/** biome-ignore-all lint/suspicious/noExplicitAny: <> */
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
} from "../utils";
import { Metadata, type MetadataInput } from "./Metadata";
import {
	type PrivateKeyResolvable,
	resolvePrivateKey,
	resolveWallet,
	Wallet,
	type WalletResolvable,
} from "./Wallet";

export interface TransactionType {
	id: number;
	from: string;
	to: string;
	value: number;
	time: Date | string;
	name: string;
	metadata: string;
	sent_metaname: string;
	sent_name: string;
	type: string;
}

export class Transaction<D extends Record<string, any> = Record<string, any>> {
	id: number;
	from: Wallet;
	to: Wallet;
	value: number;
	time: Date;
	name: string;
	metadata: Metadata<D>;
	sent_metaname: string;
	sent_name: string;
	type: string;

	private constructor(data: TransactionType) {
		this.id = data.id;
		this.from = Wallet.from(data.from);
		this.to = Wallet.from(data.to);
		this.value = data.value;
		this.time = new Date(data.time);
		this.name = data.name;
		this.metadata = Metadata.from(data.metadata) as Metadata<D>;
		this.sent_metaname = data.sent_metaname;
		this.sent_name = data.sent_name;
		this.type = data.type;
	}

	toJSON(): Omit<TransactionType, "metadata"> & { metadata: string } {
		return {
			id: this.id,
			from: this.from.address,
			to: this.to.address,
			value: this.value,
			time: this.time,
			name: this.name,
			metadata: this.metadata.toString(),
			sent_metaname: this.sent_metaname,
			sent_name: this.sent_name,
			type: this.type,
		};
	}

	static from(data: TransactionType): Transaction {
		return new Transaction(data);
	}

	withMetadata(meta: MetadataInput): Transaction {
		const copy = new Transaction(this.toJSON());
		copy.metadata = Metadata.from(meta);
		return copy;
	}

	async clone(wallet: PrivateKeyResolvable): Promise<Result<Transaction>> {
		return Transaction.create(wallet, this.to, this.value, this.metadata);
	}

	static async create(
		wallet: PrivateKeyResolvable,
		to: WalletResolvable,
		amount: number,
		metadata?: MetadataInput,
	): Promise<Result<Transaction>> {
		try {
			const privateKey = resolvePrivateKey(wallet);
			const recipient = await resolveWallet(to);

			const meta = Metadata.from(metadata);

			const res = await post<{ transaction: TransactionType }>(
				`${KROMER_ENDPOINT}/transactions`,
				{
					privatekey: privateKey,
					to: recipient.address,
					amount,
					metadata: meta.toString(),
				},
			);
			return mapResult(res, (v) => new Transaction(v.transaction));
		} catch (err) {
			return resultErr(parseErrorMessage(err));
		}
	}

	static async get<D extends Record<string, any>>(id: number): Promise<Result<Transaction<D>>> {
		const res = await get<{ transaction: TransactionType }>(
			`${KROMER_ENDPOINT}/transactions/${id}`,
		);
		return mapResult(res, (v) => new Transaction<D>(v.transaction));
	}

	static async list(
		unsafePagination?: Partial<Pagination>,
	): Promise<
		Result<{ count: number; total: number; transactions: Transaction[] }>
	> {
		const { limit, offset } = parsePagination(unsafePagination);

		const url = new URL(`${KROMER_ENDPOINT}/transactions`);
		if (limit) url.searchParams.append("limit", limit.toString());
		if (offset) url.searchParams.append("offset", offset.toString());

		const res = await get<{
			count: number;
			total: number;
			transactions: TransactionType[];
		}>(url.toString());
		return mapResult(res, (v) => ({
			count: v.count,
			total: v.total,
			transactions: v.transactions.map((t) => new Transaction(t)),
		}));
	}

	static async listLatest(
		unsafePagination?: Partial<Pagination>,
	): Promise<
		Result<{ count: number; total: number; transactions: Transaction[] }>
	> {
		const { limit, offset } = parsePagination(unsafePagination);

		const url = new URL(`${KROMER_ENDPOINT}/transactions/latest`);
		if (limit) url.searchParams.append("limit", limit.toString());
		if (offset) url.searchParams.append("offset", offset.toString());

		const res = await get<{
			count: number;
			total: number;
			transactions: TransactionType[];
		}>(url.toString());
		return mapResult(res, (v) => ({
			count: v.count,
			total: v.total,
			transactions: v.transactions.map((t) => new Transaction(t)),
		}));
	}
}
