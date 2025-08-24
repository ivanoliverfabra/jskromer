import { PAGINATION_MAX_LIMIT } from "./constants";

export type ApiResult<T> =
	| { ok: true; value: T }
	| { ok: false; error: string };

export async function get<T>(
	url: string,
	headers: Record<string, string> = {},
): Promise<ApiResult<T>> {
	try {
		const res = await fetch(url, { headers });
		if (!res.ok) {
			const body = (await res.json()) as {
				ok: false;
				error: string;
				message?: string;
			} | null;
			return { ok: false, error: body?.error ?? `HTTP error ${res.status}` };
		}
		return { ok: true, value: (await res.json()) as T };
	} catch (err) {
		return { ok: false, error: (err as Error).message };
	}
}

export async function post<T, B = unknown>(
	url: string,
	body: B,
	headers: Record<string, string> = {},
): Promise<ApiResult<T>> {
	try {
		const res = await fetch(url, {
			method: "POST",
			headers: { "Content-Type": "application/json", ...headers },
			body: JSON.stringify(body),
		});
		if (!res.ok) {
			const body = (await res.json()) as {
				ok: false;
				error: string;
				message?: string;
			} | null;
			return { ok: false, error: body?.error ?? `HTTP error ${res.status}` };
		}
		return { ok: true, value: (await res.json()) as T };
	} catch (err) {
		return { ok: false, error: (err as Error).message };
	}
}

export function parsePagination(
	unsafePagination?: Partial<Pagination>,
): Partial<Pagination> {
	let limit: number | undefined = parseInt(
		String(unsafePagination?.limit ?? 50),
		10,
	);
	if (Number.isNaN(limit) || limit < 1 || limit > PAGINATION_MAX_LIMIT)
		limit = undefined;
	let offset: number | undefined = parseInt(
		String(unsafePagination?.offset ?? 0),
		10,
	);
	if (Number.isNaN(offset) || offset < 0) offset = undefined;
	return { limit, offset };
}

export interface Pagination {
	limit: number;
	offset: number;
}

// New Result API: a Result-like object that behaves like its value, with ok()/error() methods
export type ResultLike<T> = T & { ok(): boolean; error(): string | undefined };
export type Result<T> = ResultLike<T>;

function makeProxy<T>(value: T, ok: boolean, error?: string): ResultLike<T> {
	const target =
		typeof value === "object" && value !== null ? value : Object(value);
	const meta = { _ok: ok, _error: error };
	const handler: ProxyHandler<ResultLike<T>> = {
		get(t, p, r) {
			if (p === "ok") return () => meta._ok;
			if (p === "error") return () => meta._error;
			if (p === Symbol.toPrimitive) {
				return (_hint: string) => {
					if (typeof value === "object" && value !== null) return value;
					return (value as { valueOf(): T }).valueOf();
				};
			}
			return Reflect.get(t, p, r);
		},
		has(t, p) {
			if (p === "ok" || p === "error") return true;
			return Reflect.has(t, p);
		},
	};
	return new Proxy(target, handler) as ResultLike<T>;
}

export function resultOk<T>(value: T): ResultLike<T> {
	return makeProxy<T>(value, true);
}

export function resultErr<T = never>(error: string): ResultLike<T> {
	return makeProxy<T>({} as unknown as T, false, error);
}

// For internal usage when you need the raw value
export function unwrap<T>(r: ResultLike<T>): T {
	return r as unknown as T;
}

// Transform ApiResult/Result into ResultLike with a mapper
export type CommonResult<T> = ApiResult<T> | ResultLike<T> | Result<T>;

export function mapResult<T, U>(
	res: CommonResult<T>,
	fn: (value: T) => U,
): ResultLike<U> {
	// If it's already our new ResultLike, treat as success and apply fn
	if (typeof res?.ok === "function") {
		const r = res as ResultLike<T>;
		return r.ok()
			? resultOk(fn(unwrap(r)))
			: resultErr(r.error?.() ?? "Unknown error");
	}
	const r2 = res as ApiResult<T>;
	return r2.ok ? resultOk(fn(r2.value)) : resultErr<U>(r2.error);
}

export function tryCatch<T>(fn: () => T): ResultLike<T> {
	try {
		return resultOk(fn());
	} catch (err) {
		return resultErr(parseErrorMessage(err));
	}
}

export function parseErrorMessage(err: unknown): string {
	if (typeof err === "string") return err;
	if (err instanceof Error) return err.message;
	if (typeof err === "object" && err !== null) {
		if ("message" in err && typeof err.message === "string")
			return err.message;
		if ("error" in err && typeof err.error === "string")
			return err.error;
	}
	return String(err);
}
