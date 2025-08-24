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
import { type PrivateKeyResolvable, resolvePrivateKey } from "./Wallet";

export interface NameType {
	name: string;
	owner: string;
	original_owner: string;
	registered: Date | string;
	updated: Date | string | null;
	transferred: Date | string | null;
	a: string;
	unpaid: number;
}

export class Name implements NameType {
	name: string;
	owner: string;
	original_owner: string;
	registered: Date;
	updated: Date | null;
	transferred: Date | null;
	a: string;
	unpaid: number;

	private constructor(data: NameType) {
		this.name = data.name;
		this.owner = data.owner;
		this.original_owner = data.original_owner;
		this.registered = new Date(data.registered);
		this.updated = data.updated ? new Date(data.updated) : null;
		this.transferred = data.transferred ? new Date(data.transferred) : null;
		this.a = data.a;
		this.unpaid = data.unpaid;
	}

	static from(data: NameType): Name {
		return new Name(data);
	}

	toJSON(): NameType {
		return {
			name: this.name,
			owner: this.owner,
			original_owner: this.original_owner,
			registered: this.registered,
			updated: this.updated,
			transferred: this.transferred,
			a: this.a,
			unpaid: this.unpaid,
		};
	}

	static async get(name: string): Promise<Result<Name>> {
		const res = await get<{ name: NameType }>(
			`${KROMER_ENDPOINT}/names/${name}`,
		);
		return mapResult(res, (v) => new Name(v.name));
	}

	static async exists(name: string): Promise<Result<boolean>> {
		const res = await get<{ available: boolean }>(
			`${KROMER_ENDPOINT}/names/check/${name}`,
		);
		return mapResult(res, (v) => !v.available);
	}

	static async isAvailable(name: string): Promise<Result<boolean>> {
		const res = await get<{ available: boolean }>(
			`${KROMER_ENDPOINT}/names/check/${name}`,
		);
		return mapResult(res, (v) => v.available);
	}

	static async cost(): Promise<Result<number>> {
		const res = await get<{ name_cost: number }>(
			`${KROMER_ENDPOINT}/names/cost`,
		);
		return mapResult(res, (v) => v.name_cost);
	}

	static async list(
		unsafePagination?: Partial<Pagination>,
	): Promise<Result<{ total: number; count: number; names: Name[] }>> {
		const { limit, offset } = parsePagination(unsafePagination);

		const url = new URL(`${KROMER_ENDPOINT}/names`);
		if (limit) url.searchParams.append("limit", limit.toString());
		if (offset) url.searchParams.append("offset", offset.toString());

		const res = await get<{ count: number; total: number; names: NameType[] }>(
			url.toString(),
		);
		return mapResult(res, (v) => ({
			total: v.total,
			count: v.count,
			names: v.names.map((n) => new Name(n)),
		}));
	}

	static async listNewest(
		unsafePagination?: Partial<Pagination>,
	): Promise<Result<{ total: number; count: number; names: Name[] }>> {
		const { limit, offset } = parsePagination(unsafePagination);

		const url = new URL(`${KROMER_ENDPOINT}/names/new`);
		if (limit) url.searchParams.append("limit", limit.toString());
		if (offset) url.searchParams.append("offset", offset.toString());

		const res = await get<{ count: number; total: number; names: NameType[] }>(
			url.toString(),
		);
		return mapResult(res, (v) => ({
			total: v.total,
			count: v.count,
			names: v.names.map((n) => new Name(n)),
		}));
	}

	static async register(
		name: string,
		_a: string,
		unresolvedKey: PrivateKeyResolvable,
	): Promise<Result<Name>> {
		try {
			const privateKey = resolvePrivateKey(unresolvedKey);
			const res = await post<{ name: NameType }>(
				`${KROMER_ENDPOINT}/names/${name}`,
				{ privatekey: privateKey },
			);
			return mapResult(res, (v) => new Name(v.name));
		} catch (err) {
			return resultErr(parseErrorMessage(err));
		}
	}

	async update(
		a: string,
		unresolvedKey: PrivateKeyResolvable,
	): Promise<Result<Name>> {
		try {
			const privateKey = resolvePrivateKey(unresolvedKey);
			const res = await post<{ name: NameType }>(
				`${KROMER_ENDPOINT}/names/${this.name}/update`,
				{ privatekey: privateKey, a },
			);
			return mapResult(res, (v) => new Name(v.name));
		} catch (err) {
			return resultErr(parseErrorMessage(err));
		}
	}

	async transfer(
		to: string,
		unresolvedKey: PrivateKeyResolvable,
	): Promise<Result<Name>> {
		try {
			const privateKey = resolvePrivateKey(unresolvedKey);
			const res = await post<{ name: NameType }>(
				`${KROMER_ENDPOINT}/names/${this.name}/transfer`,
				{ privatekey: privateKey, address: to },
			);
			return mapResult(res, (v) => new Name(v.name));
		} catch (err) {
			return resultErr(parseErrorMessage(err));
		}
	}
}
