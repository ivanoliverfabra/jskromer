# kromer

TypeScript SDK for the Kromer Krist-compatible API. It provides typed models, a small Result API, and helpers for HTTP and WebSocket usage.

- Models: `Wallet`, `Transaction`, `Name`, `Metadata`, `Misc`, `WS`
- Utilities: lightweight Result-like pattern with `ok()` and `error()`
- ESM-first (works in Bun/Node) with generated types

## Install

```bash
# choose one
npm i kromer
pnpm add kromer
yarn add kromer
bun add kromer
```

## Configure endpoint (optional)

Set the base server via environment variable (defaults to `https://kromer.reconnected.cc`).

- `KROMER_URL=https://your.domain` → requests go to `${KROMER_URL}/api/krist`.

## Result API in a nutshell

All model methods return a Result-like value with:

- `ok(): boolean` → true on success
- `error(): string | undefined` → error message on failure
- Object can be used directly without checking `ok()` first

Example:

```ts
import { Wallet } from "kromer";

const wallet = await Wallet.fromPrivateKey(process.env.PRIVATE_KEY!);
if (!wallet.ok()) throw new Error(wallet.error());
console.log(wallet.address);
```

---

## Wallet

Create/resolve

- `Wallet.from(address: string, privateKey?: string)` → construct a Wallet instance
- `Wallet.fromPrivateKey(privateKey: string): Result<Wallet>`
- `resolveWallet(input: string | Wallet | { privateKey: string } | AddressType): Promise<Wallet>`
- `resolvePrivateKey(input: string | Wallet | { privateKey: string }): string`

Instance methods

- `wallet.getBalance(): Result<number>`
- `wallet.getTransactions(pagination?: Partial<Pagination>, includeMined = false): Result<Transaction[]>`
- `wallet.getNames(): Result<Name[]>`
- `wallet.send(to: WalletResolvable, amount: number, metadata?: MetadataInput): Result<Transaction>`

Static methods

- `Wallet.getTransactions(address: string, pagination?: Partial<Pagination>, includeMined = false): Result<Transaction[]>`
- `Wallet.getNames(address: string): Result<Name[]>`
- `Wallet.lookup(addresses: string[], includeNames = false): Result<{ found: number; notFound: number; addresses: Record<string, Wallet> }>`

Types

- `type WalletResolvable = string | Wallet | AddressType | { privateKey: string }`
- `interface AddressType { address; balance; totalin; totalout; firstSeen }`

---

## Transaction

Data

- `interface TransactionType { id; from; to; value; time; name; metadata; sent_metaname; sent_name; type }`
- Instance has `metadata: Metadata` (parsed/normalized)

Create/clone

- `Transaction.create(wallet: PrivateKeyResolvable, to: WalletResolvable, amount: number, metadata?: MetadataInput): Result<Transaction>`
- `tx.withMetadata(meta: MetadataInput): Transaction` (returns a copy)
- `tx.clone(wallet: PrivateKeyResolvable): Result<Transaction>` (same params as original, new tx)

Query

- `Transaction.get(id: number): Result<Transaction>`
- `Transaction.list(pagination?: Partial<Pagination>): Result<{ count; total; transactions: Transaction[] }>`
- `Transaction.listLatest(pagination?: Partial<Pagination>): Result<{ count; total; transactions: Transaction[] }>`

---

## Name (names / registry)

Data

- `interface NameType { name; owner; original_owner; registered; updated; transferred; a; unpaid }`

Query

- `Name.get(name: string): Result<Name>`
- `Name.exists(name: string): Result<boolean>`
- `Name.isAvailable(name: string): Result<boolean>`
- `Name.cost(): Result<number>`
- `Name.list(pagination?: Partial<Pagination>): Result<Name[]>`
- `Name.listNewest(pagination?: Partial<Pagination>): Result<Name[]>`
- `Name.update(a: string, key: PrivateKeyResolvable): Result<Name>`
- `Name.transfer(to: WalletResolvable, key: PrivateKeyResolvable): Result<Name>`

Mutations

- `Name.register(name: string, key: PrivateKeyResolvable): Result<Name>`

---

## Metadata

Flexible metadata wrapper. Accepts strings, plain objects, arrays, or another `Metadata`.

Create/convert

- `Metadata.from(input: MetadataInput): Metadata`
- `Metadata.fromRaw(raw: string, opts?: { parseJson?: boolean }): Metadata`
- `Metadata.fromJson(json: any, opts?: { stringify?: boolean }): Metadata`
- `Metadata.toRaw(input: MetadataInput): string`
- `Metadata.toJson<T = any>(input: MetadataInput): T | undefined`
- `Metadata.combine(left: MetadataInput, right: MetadataInput, opts?): Metadata` (deep/shallow merge, raw strategy)

Inspect/mutate

- `meta.text(): string` and `meta.toString()`
- `meta.json<T>(): T | undefined`
- `meta.withRaw(raw: string, parseJson = true): Metadata`
- `meta.withJson(json: any, stringify = true): Metadata`
- `meta.merge(input: MetadataInput, deep = false): Metadata`

Types

- `type MetadataInput = string | Record<string, any> | Metadata | undefined | null`

Notes

- Strings like `"a=1;b=2.c=3"` are parsed into nested objects using dot-paths; unknown formats become `{ text: "..." }`.

---

## Misc

- `Misc.getSupply(): Result<number>`
- `Misc.getMotd(): Result<MotdType>`
- `Misc.login(key: PrivateKeyResolvable): Result<{ authed: boolean; address: string | null }>`

Types

- `MotdPackage`, `MotdConstants`, `MotdCurrency`, `MotdType`

---

## WebSocket (WS)

Connect

- `WS.connect(privateKeyOrUrl: PrivateKeyResolvable | string, options?: WSOptions): Promise<WS>`
  - If a URL (`ws://`/`wss://`) is passed, it’s used directly; otherwise `WS.start` authenticates and returns a URL.
- `WS.start(privateKey?: PrivateKeyResolvable): Promise<string>`
  - Authenticates and returns a WebSocket URL to connect to.

Options

- `WSOptions { protocols?, autoReconnect?=true, reconnectDelayMs?=1000, WebSocketImpl? }`

Usage

- `ws.on(event, handler)` / `ws.off(event, handler)`; known events: `open`, `close`, `error`, `message`, `keepalive`, `transaction`, `response`
- `ws.subscribe("blocks" | "ownBlocks" | "transactions" | "ownTransactions" | "names" | "ownNames" | "motd")`
- `ws.request(message: { type: string; ... }, timeoutMs?): Result<WSResponseBase>` (tracks responses by id)
- `ws.sendJSON(obj)` / `ws.send(stringOrBufferlike)`
- `ws.close(code?, reason?)`

Types

- `type SubscriptionEvent = "transactions" | "names" | "blocks" | "ownTransactions"`
- `interface WSResponseBase { type: "response"; ok: boolean; id: number; responding_to: string; ... }`

---

## Pagination

Many list methods accept `Partial<Pagination>`:

- `interface Pagination { limit: number; offset: number }`
- `limit` clamped to 1..1000; `offset >= 0`

---

## Examples

Send a transaction with structured metadata:

```ts
import { Transaction } from "kromer";

const res = await Transaction.create(
  process.env.PRIVATE_KEY!,
  "kpq5eeqtym", // address or Wallet or { privateKey }
  5,
  { order: { id: 123, items: ["a", "b"] }, message: "thanks" }
);
if (!res.ok()) throw new Error(res.error()); // optional
console.log("tx id:", res.id);
```

Subscribe to live transactions:

```ts
import { WS } from "kromer";
const ws = await WS.connect(process.env.PRIVATE_KEY!);
ws.on("open", () => ws.subscribe("transactions"));
ws.on("transaction", (tx) => console.log("tx", tx.id, tx.metadata.json()));
```

Check name availability and register:

```ts
import { Name } from "kromer";

const available = await Name.isAvailable("example");
if (!available.ok() || !available)
  throw new Error("check failed or not available");

const reg = await Name.register("example", process.env.PRIVATE_KEY!);
if (!reg.ok()) throw new Error(reg.error());
console.log("registered to:", reg.owner);
```

---

## Notes

- All methods are Promise-based and typed. Always check `ok()` before using the value.
- Errors are stringified consistently via `error()`.
- WebSocket reconnection is enabled by default; call `ws.close()` to stop.
