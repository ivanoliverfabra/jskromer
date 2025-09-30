# jskromer

TypeScript SDK for the Kromer Krist-compatible API. It provides typed models, a small Result API, and helpers for HTTP and WebSocket usage.

- Models: `Wallet`, `Transaction`, `Name`, `Metadata`, `Misc`, `WS`
- Utilities: lightweight Result-like pattern with `ok()` and `error()`, plus `unwrap()` helper and v2 address generation
- ESM-first (works in Bun/Node) with generated types

## Install

```bash
# choose one
npm i jskromer
pnpm add jskromer
yarn add jskromer
bun add jskromer
```

## Configure endpoint (optional)

Set the base server via environment variables (defaults to `https://kromer.reconnected.cc/api/krist`).

- `KROMER_URL=https://your.domain` → sets the base URL (defaults to `https://kromer.reconnected.cc`)
- `KROMER_API_BASE_PATH=/custom/path` → sets the API path (defaults to `/api/krist`)
- Final endpoint: `${KROMER_URL}${KROMER_API_BASE_PATH}`

## Result API in a nutshell

All model methods return a Result-like value with:

- `ok(): boolean` → true on success
- `error(): string | undefined` → error message on failure
- Object can be used directly without checking `ok()` first

Example:

```ts
import { Wallet } from "jskromer";

const wallet = await Wallet.fromPrivateKey(process.env.PRIVATE_KEY!);
if (!wallet.ok()) throw new Error(wallet.error());
console.log(wallet.address);
```

---

## Utilities

Core utilities exported by the SDK:

- `unwrap<T>(result: T & { ok(): boolean; error(): string | undefined }): T` → extracts value from Result-like objects, throws on error
- `generateAddressV2(privateKey: string, prefix = "k"): string` → generates a v2-format Krist address from a private key

Example:

```ts
import { generateAddressV2, unwrap, Wallet } from "jskromer";

// Generate address from private key
const address = generateAddressV2("your-private-key-here");
console.log(address); // e.g., "k1a2b3c4d5e6f7g8h"

// Use unwrap to extract values without manual error checking
const wallet = unwrap(await Wallet.fromPrivateKey(privateKey));
console.log(wallet.address); // throws if wallet creation failed

// You can also unwrap from Result-Like object
const wallet = (await Wallet.fromPrivateKey(privateKey)).unwrap();
```

---

## Wallet

Create/resolve

- `Wallet.from(address: string, privateKey?: string)` → construct a Wallet instance
- `Wallet.fromAddress(address: string): Result<Wallet>`
- `Wallet.fromPrivateKey(privateKey: string): Result<Wallet>`
- `resolveWallet(input: string | Wallet | { privateKey: string } | AddressType): Promise<Wallet>`
- `resolvePrivateKey(input: string | Wallet | { privateKey: string }): string`

Instance methods

- `wallet.getBalance(): Result<number>`
- `wallet.authenticate(privateKey: string): Result<boolean>` (attach private key to a Wallet created from address only)
- `wallet.getTransactions(pagination?: Partial<Pagination>, includeMined = false): Result<Transaction[]>`
- `wallet.getNames(): Result<Name[]>`
- `wallet.send(to: WalletResolvable, amount: number, metadata?: MetadataInput): Result<Transaction>`
- `wallet.getData(): Result<AddressType>` (DEPRECATED, use `Wallet` properties instead)
- `wallet.refresh(): Promise<void>` (refreshes balance and data)

Static methods

- `Wallet.getTransactions(address: string, pagination?: Partial<Pagination>, includeMined = false): Result<Transaction[]>`
- `Wallet.getNames(address: string): Result<Name[]>`
- `Wallet.lookup(addresses: string[], includeNames = false): Result<{ found: number; notFound: number; addresses: Record<string, Wallet> }>`

Types

- `type WalletResolvable = string | Wallet | AddressType | { privateKey: string }`
- `interface AddressType { address: string; balance: number; totalin: number; totalout: number; firstSeen: Date | string }`

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
import { Transaction, unwrap } from "jskromer";

// Option 1: Manual error checking
const res = await Transaction.create(
  process.env.PRIVATE_KEY!,
  "kpq5eeqtym", // address or Wallet or { privateKey }
  5,
  { order: { id: 123, items: ["a", "b"] }, message: "thanks" }
);
if (!res.ok()) throw new Error(res.error());
console.log("tx id:", res.id);

// Option 2: Using unwrap helper
const tx = unwrap(
  await Transaction.create(process.env.PRIVATE_KEY!, "kpq5eeqtym", 5, {
    order: { id: 123, items: ["a", "b"] },
    message: "thanks",
  })
);
console.log("tx id:", tx.id);
```

Subscribe to live transactions:

```ts
import { WS } from "jskromer";
const ws = await WS.connect(process.env.PRIVATE_KEY!);
ws.on("open", () => ws.subscribe("transactions"));
ws.on("transaction", (tx) => console.log("tx", tx.id, tx.metadata.json()));
```

Check name availability and register:

```ts
import { Name, unwrap } from "jskromer";

const available = unwrap(await Name.isAvailable("example"));
if (!available) throw new Error("name not available");

const reg = unwrap(await Name.register("example", process.env.PRIVATE_KEY!));
console.log("registered to:", reg.owner);
```

Generate addresses from private keys:

```ts
import { generateAddressV2, Wallet } from "jskromer";

// Generate v2 address directly
const address = generateAddressV2(process.env.PRIVATE_KEY!);
console.log("Address:", address);

// Or use Wallet.from for more features
const wallet = await Wallet.from(address, process.env.PRIVATE_KEY!);
console.log("Balance:", unwrap(await wallet.getBalance()));
```

---

## Notes

- All methods are Promise-based and typed. Always check `ok()` before using the value, or use `unwrap()` for automatic error throwing.
- Errors are stringified consistently via `error()`.
- WebSocket reconnection is enabled by default; call `ws.close()` to stop.
- The `generateAddressV2` function implements the v2 address generation algorithm compatible with Kromer.
