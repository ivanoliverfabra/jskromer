/** biome-ignore-all lint/suspicious/noExplicitAny: utility file */

import {
	type InferXMS,
	XMSDoc,
	type XMSNode,
	type XMSParsedLikeGeneric,
	type XMSParseOptions,
	type XMSValue
} from "openxms";

export type MetadataInput = XMSValue | Record<string, any> | Metadata<any>;

export type InferCombined<L extends Record<string, any>, R extends Record<string, any>> = {
	[K in keyof L | keyof R]: K extends keyof R
	? K extends keyof L
	? [L[K], R[K]] extends [infer LL, infer RR]
	? LL & RR
	: never
	: R[K]
	: K extends keyof L
	? L[K]
	: never;
};

/**
 * Class representing metadata.
 * @template T The type of the metadata object.
 * @example
 * ```ts
 * import { Metadata } from "./src";
 * const metadata = Metadata.from({ key: "value" });
 * ```
 */
export class Metadata<T extends XMSNode = XMSNode, O extends XMSParseOptions = XMSParseOptions> {
	private _doc: XMSDoc<T, O>;

	private constructor(doc: XMSDoc<T, O>) {
		this._doc = doc;
	}

	static from<const S extends string, O extends XMSParseOptions>(input: S, opts?: O): Metadata<InferXMS<S, O>, O>;
	static from<T extends XMSNode, O extends XMSParseOptions>(input: T, opts?: O): Metadata<T, O>;
	static from<M extends Metadata<any>, O extends XMSParseOptions>(input: M, opts?: O): M;
	static from(input?: MetadataInput, opts?: XMSParseOptions): Metadata<any>;
	static from(input?: MetadataInput, opts?: XMSParseOptions): Metadata<any> {
		if (!input) return new Metadata(XMSDoc.parse("") as any);

		if (input instanceof Metadata) return input;

		if (typeof input === "string") {
			return new Metadata(XMSDoc.parse(input, opts)) as any;
		}

		if (input && typeof input === "object") {
			return new Metadata(XMSDoc.from(input as XMSParsedLikeGeneric, opts) as any);
		}

		return new Metadata(XMSDoc.parse("xms/1;") as any);
	}

	/**
	 * Creates a Metadata instance from a raw metadata string.
	 * @param raw The raw metadata string.
	 * @returns The Metadata instance.
	 */
	static fromRaw<T extends XMSNode = XMSNode>(raw: string): Metadata<T> {
		return new Metadata(XMSDoc.parse(raw)) as any;
	}

	/**
	 * Creates a Metadata instance from a JSON object.
	 * @param json The JSON object.
	 * @returns The Metadata instance.
	 */
	static fromJson<T extends XMSNode>(json: T): Metadata<T> {
		return new Metadata(XMSDoc.from(json) as any) as any;
	}

	/**
	 * Returns the raw metadata string.
	 * @returns The raw metadata string.
	 * @deprecated Use `toString()` instead.
	 */
	raw(): string {
		return this._doc.toXMS();
	}

	/**
	 * Returns the raw metadata string.
	 * @returns The raw metadata string.
	 */
	toString(): string {
		return this._doc.toXMS();
	}

	/**
	 * Returns the metadata as a JSON object.
	 * @deprecated Use `toJSON()` instead.
	 */
	json(): T {
		return this._doc.data as T;
	}

	/**
	 * Returns the metadata as a JSON object.
	 * @returns The metadata as a JSON object.
	 */
	toJSON(): T {
		return this._doc.data as T;
	}

	/**
	 * Returns an iterator of the metadata entries.
	 * @returns An iterator of the metadata entries.
	 */
	get entries() {
		return this._doc.entries;
	}

	/** 
	 * Returns the metadata version.
	 * @returns The metadata version.
	 */
	get version(): number {
		return this._doc.version;
	}

	/** 
	 * Combines two metadata objects into one.
	 * @param left The left metadata object.
	 * @param right The right metadata object.
	 * @param opts Optional parameters for combining.
	 * @returns The combined metadata object.
	 */
	static combine<
		L extends XMSNode = XMSNode,
		R extends XMSNode = XMSNode
	>(
		left: L | Metadata<L>,
		right: R | Metadata<R>,
		opts?: { prefer?: "left" | "right" }
	): Metadata<any> {
		const l = Metadata.from(left instanceof Metadata ? left._doc.data : left)._doc;
		const r = Metadata.from(right instanceof Metadata ? right._doc.data : right)._doc;

		const lData = l.data as any;
		const rData = r.data as any;

		const data =
			opts?.prefer === "left"
				? { ...rData, ...lData }
				: { ...lData, ...rData };

		return new Metadata(XMSDoc.from(data) as any) as any;
	}

	/**
	 * Returns the underlying XMSDoc instance.
	 * @returns The underlying XMSDoc instance.
	 */
	get doc(): XMSDoc<T> {
		return this._doc as any;
	}
}