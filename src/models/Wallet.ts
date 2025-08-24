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
  totalin: number;
  totalout: number;
  firstSeen: Date | string;
}

export type WalletResolvable =
  | string
  | Wallet
  | AddressType
  | { privateKey: string };
export type PrivateKeyResolvable = string | Wallet | { privateKey: string };

export async function resolveWallet(input: WalletResolvable): Promise<Wallet> {
  if (input instanceof Wallet) return input;
  if (typeof input === "string") return Wallet.from(input);
  if ("privateKey" in input) {
    const res = await Wallet.fromPrivateKey(input.privateKey);
    if (!res.ok()) throw new Error(res.error());
    return unwrap(res);
  }
  return Wallet.from(input.address);
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
  public address: string;
  private _privateKey?: string;

  private constructor(address: AddressType | string, privateKey?: string) {
    if (typeof address === "string") this.address = address;
    else this.address = address.address;

    this._privateKey = privateKey;
  }

  toJSON(): AddressType {
    return {
      address: this.address,
      balance: 0,
      totalin: 0,
      totalout: 0,
      firstSeen: new Date(0),
    };
  }

  async getBalance(): Promise<Result<number>> {
    const res = await get<{ address: { balance: number } }>(
      `${KROMER_ENDPOINT}/addresses/${this.address}`,
    );
    return mapResult(res, (v) => v.address.balance);
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
    const { limit, offset } = parsePagination(unsafePagination);

    const url = new URL(`${KROMER_ENDPOINT}/addresses/${address}/transactions`);
    if (!includeMined) url.searchParams.append("exclude_mined", "true");

    if (limit) url.searchParams.append("limit", limit.toString());
    if (offset) url.searchParams.append("offset", offset.toString());

    const res = await get<{ transactions: TransactionType[] }>(url.toString());
    return mapResult(res, (v) =>
      v.transactions.map((t) => Transaction.from(t)),
    );
  }

  async getNames(): Promise<Result<Name[]>> {
    const res = await get<{ names: NameType[] }>(
      `${KROMER_ENDPOINT}/addresses/${this.address}/names`,
    );
    return mapResult(res, (v) => v.names.map((n) => Name.from(n)));
  }

  async send(
    to: WalletResolvable,
    amount: number,
    metadata?: MetadataInput,
  ): Promise<Result<Transaction>> {
    return Transaction.create(this, to, amount, metadata);
  }

  get privateKey(): string | undefined {
    return this._privateKey;
  }

  async getData(): Promise<Result<AddressType>> {
    const res = await get<{ address: AddressType }>(
      `${KROMER_ENDPOINT}/addresses/${this.address}`,
    );
    return mapResult(res, (v) => ({
      ...v.address,
      firstSeen:
        typeof v.address.firstSeen === "string"
          ? new Date(v.address.firstSeen)
          : v.address.firstSeen,
    }));
  }

  static from(address: string, privateKey?: string): Wallet {
    return new Wallet(address, privateKey);
  }

  static async fromPrivateKey(privateKey: string): Promise<Result<Wallet>> {
    const res = await post<{ authed: boolean; address: string | null }>(
      `${KROMER_ENDPOINT}/login`,
      { privatekey: privateKey },
    );
    if (!res.ok) return resultErr(res.error);
    if (!res.value.authed || !res.value.address)
      return resultErr("Invalid private key");
    return resultOk(new Wallet(res.value.address, privateKey));
  }

  static async getNames(address: string): Promise<Result<Name[]>> {
    const res = await get<{ names: NameType[] }>(
      `${KROMER_ENDPOINT}/addresses/${address}/names`,
    );
    return mapResult(res, (v) => v.names.map((n) => Name.from(n)));
  }

  static async create(privateKey: string): Promise<Result<Wallet>> {
    // Delegate to fromPrivateKey for a single source of truth
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
        `${KROMER_ENDPOINT}/lookup/addresses/${addresses.map((a) => encodeURIComponent(a)).join(",")}`,
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
