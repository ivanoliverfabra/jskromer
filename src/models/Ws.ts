import { KROMER_ENDPOINT } from "../constants";
import { parseErrorMessage, post, resultErr, resultOk, tryCatch, type Result } from "../utils";
import type { MotdType } from "./Misc";
import { Transaction } from "./Transaction";
import { resolvePrivateKey, type PrivateKeyResolvable } from "./Wallet";

type WebSocketLike = {
  readyState: number;
  send(data: unknown): void;
  close(code?: number, reason?: string): void;
  onopen: ((ev: any) => any) | null;
  onmessage: ((ev: any) => any) | null;
  onerror: ((ev: any) => any) | null;
  onclose: ((ev: any) => any) | null;
};

export interface WSOptions {
  protocols?: string | string[];
  autoReconnect?: boolean; // default true
  reconnectDelayMs?: number; // default 1000
  WebSocketImpl?: new (url: string, protocols?: string | string[]) => WebSocketLike;
}

export type SubscriptionEvent = "blocks" | "ownBlocks" | "transactions" | "ownTransactions" | "names" | "ownNames" | "motd";

export type OpenEvent = { url: string };
export type CloseEventPayload = { code?: number; reason?: string; wasClean?: boolean };
export type ErrorEventPayload = { message?: string; error?: any };
export type KeepaliveEvent = { type: "keepalive"; server_time: string } & Record<string, unknown>;
export type WSRequest = { type: string; id?: number } & Record<string, unknown>;
export interface WSResponseBase {
  type: "response";
  ok: boolean;
  id: number;
  responding_to: string;
  // other fields from server are allowed
  [key: string]: any;
}
export interface WSEventMap {
  // Standard events
  open: OpenEvent;
  close: CloseEventPayload;
  error: ErrorEventPayload;
  message: unknown;

  // Kromer events
  keepalive: KeepaliveEvent;
  transaction: Transaction;
  motd: MotdType;
  response: WSResponseBase;
}

export class WS {
  private url: string;
  private ws?: WebSocketLike;
  private opts: Required<Pick<WSOptions, "autoReconnect" | "reconnectDelayMs">> & WSOptions;
  private shouldReconnect = false;
  private lastUpdate: Date | null = null;
  private subscriptionCount = 0;

  private listeners: Map<string, Set<(payload: any) => void>> = new Map();
  private nextId = 0;
  private pending: Map<number, { resolve: (v: WSResponseBase) => void; reject: (e: any) => void; timer?: any }> = new Map();

  private constructor(url: string, options?: WSOptions) {
    this.url = url;
    this.opts = {
      autoReconnect: true,
      reconnectDelayMs: 1000,
      ...(options ?? {}),
    };
    this.shouldReconnect = !!this.opts.autoReconnect;
  }

  static async start(privateKey?: PrivateKeyResolvable): Promise<string> {
    const body: Record<string, unknown> = {};
    if (typeof privateKey !== "undefined") body.privatekey = resolvePrivateKey(privateKey);
    const res = await post<{ url: string }>(`${KROMER_ENDPOINT}/ws/start`, body);
    if (res.ok) return res.value.url;
    throw new Error(res.error);
  }

  static async connect(privateKeyOrUrl: PrivateKeyResolvable | string, options?: WSOptions): Promise<WS> {
    const isUrl = typeof privateKeyOrUrl === "string" && /^wss?:\/\//i.test(privateKeyOrUrl);
    const url = isUrl ? privateKeyOrUrl : await WS.start(privateKeyOrUrl);
    const client = new WS(url, options);
    client.open();
    return client;
  }

  open(): void {
    const Ctor = this.opts.WebSocketImpl ?? (globalThis as any).WebSocket;
    if (!Ctor) throw new Error("No WebSocket implementation found. Provide options.WebSocketImpl.");

    try { this.ws?.close(); } catch { }

    const ws: WebSocketLike = new Ctor(this.url, this.opts.protocols);
    this.ws = ws;

    ws.onopen = () => this.emit("open", { url: this.url });
    ws.onmessage = (ev) => {
      const data = tryCatch(() => JSON.parse(ev.data));
      if (!data.ok()) return console.error("Failed to parse WS message:", data.error());

      if (data && data.type === "keepalive") {
        if (typeof data.server_time === "string") this.lastUpdate = new Date(data.server_time);
        this.emit("keepalive", data);
      } else if (data && data.type === "event" && data.event === "transaction") {
        this.emit("transaction", Transaction.from(data.transaction));
      } else if (data && data.type === "response" && typeof data.id === "number") {
        const entry = this.pending.get(data.id);
        if (entry) {
          this.pending.delete(data.id);
          if (entry.timer) clearTimeout(entry.timer);
          if (data.ok) entry.resolve(data as WSResponseBase);
          else entry.reject(data as WSResponseBase);
        }
        this.emit("response", data as WSResponseBase);
        if (typeof data.responding_to === "string") {
          this.emit(`response:${data.responding_to}` as any, data as WSResponseBase);
        }
      } else if (data && typeof data.type === "string") {
        this.emit(data.type, data);
      }

      this.emit("message", data);
    };
    ws.onerror = (ev: any) => this.emit("error", this.normalizeErrorEvent(ev));
    ws.onclose = (ev: any) => {
      // Reject all pending requests on close
      if (this.pending.size) {
        const err = { message: "WebSocket closed before response" };
        for (const [id, p] of this.pending.entries()) {
          if (p.timer) clearTimeout(p.timer);
          p.reject({ type: "response", ok: false, id, responding_to: "unknown", error: err });
        }
        this.pending.clear();
      }

      this.emit("close", this.normalizeCloseEvent(ev));
      if (this.shouldReconnect) {
        const delay = this.opts.reconnectDelayMs ?? 1000;
        setTimeout(() => this.open(), delay);
      }
    };
  }

  subscribe(event: SubscriptionEvent | SubscriptionEvent[], id?: number): void {
    // 'id' is unused and kept for backward compatibility.
    if (Array.isArray(event)) {
      event.forEach((e) => this.request({ type: "subscribe", event: e }));
    } else {
      this.request({ type: "subscribe", event });
    }
  }

  send(data: unknown): void {
    if (!this.ws || this.ws.readyState !== 1 /* OPEN */) throw new Error("WebSocket is not open");
    this.ws.send(data);
  }

  /** Send a JSON-serializable payload without request tracking */
  sendJSON(obj: unknown): void {
    this.send(JSON.stringify(obj));
  }

  /** Send a request and await a typed response with matching id */
  async request<TRes extends WSResponseBase = WSResponseBase>(
    message: Omit<WSRequest, "id">,
    timeoutMs = 15000
  ): Promise<Result<TRes>> {
    try {
      if (!message || typeof (message as any).type !== "string") {
        throw new Error("Request message must include a string 'type'");
      }
      const id = ++this.nextId;
      const payload = { ...(message as WSRequest), id } as WSRequest;

      if (!this.ws || this.ws.readyState !== 1) throw new Error("WebSocket is not open");

      const promise = new Promise<TRes>((resolve, reject) => {
        const timer = setTimeout(() => {
          this.pending.delete(id);
          reject(new Error(`Request timed out: ${(message as WSRequest).type} (${id})`));
        }, timeoutMs);
        this.pending.set(id, {
          resolve: (v) => resolve(v as TRes),
          reject: (e) => reject(e),
          timer,
        });
      });

      this.ws.send(JSON.stringify(payload));
      const value = await promise;
      return resultOk(value);
    } catch (e) {
      return resultErr(parseErrorMessage(e));
    }
  }

  close(code?: number, reason?: string): void {
    this.shouldReconnect = false;
    this.ws?.close(code, reason);
  }

  // Event subscription API with type-safety for known events and support for custom events
  on<E extends keyof WSEventMap>(event: E, handler: (payload: WSEventMap[E]) => void): this;
  on<T extends string>(event: Exclude<T, keyof WSEventMap>, handler: (payload: any) => void): this;
  on(event: string, handler: (payload: any) => void): this {
    if (!this.listeners.has(event)) this.listeners.set(event, new Set());
    this.listeners.get(event)!.add(handler);
    return this;
  }

  off<E extends keyof WSEventMap>(event: E, handler: (payload: WSEventMap[E]) => void): this;
  off<T extends string>(event: Exclude<T, keyof WSEventMap>, handler: (payload: any) => void): this;
  off(event: string, handler: (payload: any) => void): this {
    const set = this.listeners.get(event);
    if (set) set.delete(handler as any);
    return this;
  }

  private emit<E extends keyof WSEventMap>(event: E, payload: WSEventMap[E]): void;
  private emit<T extends string>(event: Exclude<T, keyof WSEventMap>, payload: any): void;
  private emit(event: string, payload: any): void {
    const set = this.listeners.get(event);
    if (!set || set.size === 0) return;
    for (const fn of set) {
      try { fn(payload); } catch { /* swallow */ }
    }
  }

  private normalizeErrorEvent(ev: any): ErrorEventPayload {
    const message = typeof ev?.message === "string"
      ? ev.message
      : typeof ev === "string"
        ? ev
        : typeof ev?.error?.message === "string"
          ? ev.error.message
          : undefined;
    const error = ev?.error ?? ev;
    return { message, error };
  }

  private normalizeCloseEvent(ev: any): CloseEventPayload {
    return {
      code: ev?.code,
      reason: ev?.reason,
      wasClean: ev?.wasClean,
    };
  }
}