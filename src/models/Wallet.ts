/** biome-ignore-all lint/suspicious/useAdjacentOverloadSignatures: this is a class */
import { KROMER_ENDPOINT } from "../constants";
import {
  get,
  mapResult,
  type Pagination,
  parseErrorMessage,
  parsePagination,
  post,
  type Result,
  resultErr,
  resultOk,
  unwrap,
} from "../utils";
import type { MetadataInput } from "./Metadata";
import { Name, type NameType } from "./Name";
import { Transaction, type TransactionType } from "./Transaction";

export interface AddressType {
  address: string;
  balance: number;
  totalIn: number;
  totalOut: number;
  firstSeen: Date | string;
}

interface RawAddressType {
  address: string;
  balance: number;
  totalin: number;
  totalout: number;
  firstseen: string;
}

export type WalletResolvable =
  | string
  | Wallet
  | AddressType
  | { privateKey: string };
export type PrivateKeyResolvable = string | Wallet | { privateKey: string };

export async function resolveWallet(input: WalletResolvable): Promise<Wallet> {
  if (input instanceof Wallet) return input;
  if (typeof input === "string") {
    const res = await Wallet.fromAddress(input);
    if (!res.ok()) throw new Error(res.error());
    return unwrap(res);
  }
  if ("privateKey" in input) {
    const res = await Wallet.fromPrivateKey(input.privateKey);
    if (!res.ok()) throw new Error(res.error());
    return unwrap(res);
  }
  const res = await Wallet.fromAddress(input.address);
  if (!res.ok()) throw new Error(res.error());
  return unwrap(res);
}

export function resolvePrivateKey(input: PrivateKeyResolvable): string {
  if (input instanceof Wallet) {
    if (!input.privateKey)
      throw new Error("Wallet does not have a private key");
    return input.privateKey;
  }
  if (typeof input === "string") return input;
  if ("privateKey" in input) return input.privateKey;
  throw new Error("Cannot resolve private key from the given input");
}

export class Wallet {
  public readonly address: string;
  private _privateKey?: string;
  private _data?: AddressType;

  private constructor(
    address: RawAddressType | AddressType | string,
    privateKey?: string,
  ) {
    if (typeof address === "string") {
      this.address = address;
    } else {
      this.address = address.address;
      if ("firstseen" in address) {
        this._data = Wallet.mapRawAddressType(address);
      } else {
        this._data = address;
      }
    }
    this._privateKey = privateKey;
  }

  /**
   * Serializes this wallet to a normalized DTO
   * Note: if data has not been fetched yet, all numeric fields will be `undefined`.
   */
  toJSON(): Partial<AddressType> {
    return {
      address: this.address,
      balance: this.balance,
      totalIn: this.totalIn,
      totalOut: this.totalOut,
      firstSeen: this.firstSeen,
    };
  }

  async getBalance(): Promise<Result<number>> {
    const res = await this.refresh();
    if (!res.ok()) return resultErr(res.error() || "Failed to refresh wallet");
    return resultOk(this._data?.balance || 0);
  }

  async getTransactions(
    unsafePagination?: Partial<Pagination>,
    includeMined = false,
  ): Promise<Result<Transaction[]>> {
    try {
      const { limit, offset } = parsePagination(unsafePagination);

      const url = new URL(
        `${KROMER_ENDPOINT}/addresses/${this.address}/transactions`,
      );
      if (!includeMined) url.searchParams.append("exclude_mined", "true");
      if (limit) url.searchParams.append("limit", limit.toString());
      if (offset) url.searchParams.append("offset", offset.toString());

      const res = await get<{ transactions: TransactionType[] }>(
        url.toString(),
      );
      if (!res.ok) return resultErr(res.error);

      return mapResult(res, (v) =>
        v.transactions.map((t) => Transaction.from(t)),
      );
    } catch (e) {
      return resultErr(parseErrorMessage(e));
    }
  }

  static async getTransactions(
    address: string,
    unsafePagination?: Partial<Pagination>,
    includeMined = false,
  ): Promise<Result<Transaction[]>> {
    try {
      const { limit, offset } = parsePagination(unsafePagination);

      const url = new URL(`${KROMER_ENDPOINT}/addresses/${address}/transactions`);
      if (!includeMined) url.searchParams.append("exclude_mined", "true");
      if (limit) url.searchParams.append("limit", limit.toString());
      if (offset) url.searchParams.append("offset", offset.toString());

      const res = await get<{ transactions: TransactionType[] }>(url.toString());
      if (!res.ok) return resultErr(res.error);

      return mapResult(res, (v) =>
        v.transactions.map((t) => Transaction.from(t)),
      );
    } catch (e) {
      return resultErr(parseErrorMessage(e));
    }
  }

  async getNames(): Promise<Result<Name[]>> {
    return Wallet._fetchNames(this.address);
  }

  async send(
    to: WalletResolvable,
    amount: number,
    metadata?: MetadataInput,
  ): Promise<Result<Transaction>> {
    return Transaction.create(this, to, amount, metadata);
  }

  /**
   * The private key associated with this wallet, if authenticated.
   *
   * ⚠️ SECURITY WARNING:
   * This is stored in-memory as plain text. Avoid logging or exposing it.
   */
  get privateKey(): string | undefined {
    return this._privateKey;
  }

  private static mapRawAddressType(raw: RawAddressType): AddressType {
    return {
      address: raw.address,
      balance: raw.balance,
      totalIn: raw.totalin,
      totalOut: raw.totalout,
      firstSeen:
        typeof raw.firstseen === "string"
          ? new Date(raw.firstseen)
          : raw.firstseen,
    };
  }

  /**
   * @deprecated Use `Wallet` properties instead (e.g. `wallet.balance`, `wallet.totalIn`, etc.)
   */
  async getData(): Promise<Result<AddressType>> {
    const res = await this.refresh();
    if (!res.ok()) return resultErr(res.error() || "Failed to fetch wallet data");
    if (!this._data) return resultErr("Wallet data is unavailable");
    return resultOk(this._data);
  }

  static async getData(address: string): Promise<Result<AddressType>> {
    try {
      const res = await get<{ address: RawAddressType }>(
        `${KROMER_ENDPOINT}/addresses/${address}`,
      );
      if (!res.ok) return resultErr(res.error);
      return mapResult(res, (v) => Wallet.mapRawAddressType(v.address));
    } catch (e) {
      return resultErr(parseErrorMessage(e));
    }
  }

  /**
   * Fetches and updates the wallet data from the Kromer API.
   */
  async refresh(): Promise<Result<void>> {
    try {
      const res = await get<{ address: RawAddressType }>(
        `${KROMER_ENDPOINT}/addresses/${this.address}`,
      );
      if (!res.ok) return resultErr(res.error);
      this._data = Wallet.mapRawAddressType(res.value.address);
      return resultOk(void 0);
    } catch (e) {
      return resultErr(parseErrorMessage(e));
    }
  }

  get data(): AddressType | undefined {
    return this._data;
  }

  get balance(): number | undefined {
    return this._data?.balance;
  }

  get totalIn(): number | undefined {
    return this._data?.totalIn;
  }

  get totalOut(): number | undefined {
    return this._data?.totalOut;
  }

  get firstSeen(): Date | undefined {
    return typeof this._data?.firstSeen === "string"
      ? new Date(this._data.firstSeen)
      : this._data?.firstSeen;
  }

  static async fromAddress(address: string): Promise<Result<Wallet>> {
    const wallet = new Wallet(address);
    const res = await wallet.refresh();
    if (!res.ok()) return resultErr(res.error() || "Failed to fetch wallet data");
    return resultOk(wallet);
  }

  async authenticate(privateKey: string): Promise<Result<void>> {
    try {
      const res = await post<{ authed: boolean; address: string | null }>(
        `${KROMER_ENDPOINT}/login`,
        { privatekey: privateKey },
      );
      if (!res.ok) return resultErr(res.error);
      if (!res.value.authed || res.value.address !== this.address)
        return resultErr("Invalid private key for this address");

      this._privateKey = privateKey;
      return resultOk(void 0);
    } catch (e) {
      return resultErr(parseErrorMessage(e));
    }
  }

  static async fromPrivateKey(privateKey: string): Promise<Result<Wallet>> {
    try {
      const res = await post<{ authed: boolean; address: string | null }>(
        `${KROMER_ENDPOINT}/login`,
        { privatekey: privateKey },
      );
      if (!res.ok) return resultErr(res.error);
      if (!res.value.authed || !res.value.address)
        return resultErr("Invalid private key");
      const walletData = await Wallet.getData(res.value.address);
      if (!walletData.ok())
        return resultErr(walletData.error() || "Failed to fetch wallet data");
      return resultOk(new Wallet(walletData, privateKey));
    } catch (e) {
      return resultErr(parseErrorMessage(e));
    }
  }

  private static async _fetchNames(address: string): Promise<Result<Name[]>> {
    try {
      const res = await get<{ names: NameType[] }>(
        `${KROMER_ENDPOINT}/addresses/${address}/names`,
      );
      if (!res.ok) return resultErr(res.error);
      return mapResult(res, (v) => v.names.map((n) => Name.from(n)));
    } catch (e) {
      return resultErr(parseErrorMessage(e));
    }
  }

  static from(address: string, privateKey?: string): Wallet {
    return new Wallet(address, privateKey);
  }

  static async getNames(address: string): Promise<Result<Name[]>> {
    return Wallet._fetchNames(address);
  }

  static async create(privateKey: string): Promise<Result<Wallet>> {
    return Wallet.fromPrivateKey(privateKey);
  }

  static async lookup(
    addresses: string[],
    includeNames = false,
  ): Promise<
    Result<{
      found: number;
      notFound: number;
      addresses: Record<string, Wallet>;
    }>
  > {
    try {
      if (!addresses.length)
        return resultOk({ found: 0, notFound: 0, addresses: {} });

      const url = new URL(
        `${KROMER_ENDPOINT}/lookup/addresses/${addresses
          .map((a) => encodeURIComponent(a))
          .join(",")}`,
      );
      if (includeNames) url.searchParams.append("fetch_names", "true");

      const res = await get<{
        found: number;
        notFound: number;
        addresses: Record<string, AddressType>;
      }>(url.toString());

      if (!res.ok) return resultErr(res.error);

      const wallets: Record<string, Wallet> = {};
      for (const [addr, data] of Object.entries(res.value.addresses)) {
        wallets[addr] = new Wallet(data);
      }

      return resultOk({
        found: res.value.found,
        notFound: res.value.notFound,
        addresses: wallets,
      });
    } catch (e) {
      return resultErr(parseErrorMessage(e));
    }
  }
}