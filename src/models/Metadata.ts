/** biome-ignore-all lint/suspicious/noExplicitAny: utility file */

import {
	type ParseXMS,
	type ValidXMSPrimitive,
	XMSDoc,
	type XMSDocument,
} from "xms-ts";

export type MetadataInput =
	| ValidXMSPrimitive
	| Record<string, any>
	| Metadata<any>
	| undefined;

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
export class Metadata<T extends Record<string, any> = Record<string, any>> {
	private _doc: XMSDoc<XMSDocument<T>>;

	private constructor(doc: XMSDoc<XMSDocument<T>>) {
		this._doc = doc;
	}

	static from<const S extends string>(input: S): Metadata<ParseXMS<S>["data"]>;
	static from<T extends Record<string, any>>(input: T): Metadata<T>;
	static from<M extends Metadata<any>>(input: M): M;
	static from(input: MetadataInput): Metadata<any>;
	static from(input: MetadataInput): Metadata<any> {
		if (input instanceof Metadata) return input;

		if (typeof input === "string") {
			return new Metadata(XMSDoc.parse(input));
		}

		if (input && typeof input === "object") {
			return new Metadata(XMSDoc.from(input as Record<string, any>, 1, false));
		}

		return new Metadata(XMSDoc.parse("xms/1;"));
	}

	/**
	 * Creates a Metadata instance from a raw metadata string.
	 * @param raw The raw metadata string.
	 * @returns The Metadata instance.
	 */
	static fromRaw<T extends Record<string, any>>(raw: string): Metadata<T> {
		return new Metadata(XMSDoc.parse<T>(raw)) as Metadata<T>;
	}

	/**
	 * Creates a Metadata instance from a JSON object.
	 * @param json The JSON object.
	 * @returns The Metadata instance.
	 */
	static fromJson<T extends Record<string, any>>(json: T): Metadata<T> {
		return new Metadata(XMSDoc.from<T>(json)) as Metadata<T>;
	}

	/**
	 * Returns the raw metadata string.
	 * @returns The raw metadata string.
	 * @deprecated Use `toString()` instead.
	 */
	raw(): string {
		return this._doc.toString();
	}

	/**
	 * Returns the raw metadata string.
	 * @returns The raw metadata string.
	 */
	toString(): string {
		return this._doc.toString();
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
		L extends Record<string, any>,
		R extends Record<string, any>
	>(
		left: L | Metadata<L>,
		right: R | Metadata<R>,
		opts?: { prefer?: "left" | "right" }
	): Metadata<L & R> {
		const l = Metadata.from<L>(left instanceof Metadata ? left._doc.data : left)._doc;
		const r = Metadata.from<R>(right instanceof Metadata ? right._doc.data : right)._doc;

		const data =
			opts?.prefer === "left"
				? { ...r.data, ...l.data } as any
				: { ...l.data, ...r.data } as any;

		return new Metadata(XMSDoc.from<InferCombined<L, R>>(data) as any) as Metadata<L & R>;
	}

	/**
	 * Returns the underlying XMSDoc instance.
	 * @returns The underlying XMSDoc instance.
	 */
	get doc(): XMSDoc<XMSDocument<T>> {
		return this._doc;
	}
}