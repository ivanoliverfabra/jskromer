/** biome-ignore-all lint/suspicious/noExplicitAny: this is a utility class */
export type MetadataInput =
	| string
	| Record<string, any>
	| Metadata
	| undefined
	| null;

function isPlainObject(v: any): v is Record<string, any> {
	return Object.prototype.toString.call(v) === "[object Object]";
}

function safeStringify(v: any): string {
	if (typeof v === "string") return v;
	if (v == null) return "";
	if (isPlainObject(v)) {
		const parts: string[] = [];

		function flattenObject(obj: any, prefix = ""): void {
			for (const [key, value] of Object.entries(obj)) {
				const fullKey = prefix ? `${prefix}.${key}` : key;

				if (Array.isArray(value)) {
					for (const item of value) {
						if (isPlainObject(item)) {
							flattenObject(item, fullKey);
						} else {
							parts.push(`${fullKey}=${String(item)}`);
						}
					}
				} else if (isPlainObject(value)) {
					flattenObject(value, fullKey);
				} else {
					parts.push(`${fullKey}=${String(value)}`);
				}
			}
		}

		flattenObject(v);
		return parts.join(";");
	}
	return String(v);
}

function setPath(target: Record<string, any>, path: string, value: any) {
	const parts = path
		.split(".")
		.map((p) => p.trim())
		.filter((p) => p.length > 0);
	if (parts.length === 0) return;
	let obj: Record<string, any> = target;
	parts.forEach((key, i) => {
		const last = i === parts.length - 1;
		if (last) {
			if (Object.hasOwn(obj, key)) {
				const existing = obj[key];
				if (Array.isArray(existing)) obj[key] = [...existing, value];
				else obj[key] = [existing, value];
			} else {
				obj[key] = value;
			}
		} else {
			if (!isPlainObject(obj[key])) obj[key] = {};
			obj = obj[key];
		}
	});
}

function parseRawToJson(raw?: string): any {
	const s = raw ?? "";
	try {
		return JSON.parse(s);
	} catch { }

	if (s.includes("=") || s.includes(";")) {
		const obj: Record<string, any> = {};
		let hadAny = false;
		for (const segment of s.split(";")) {
			if (!segment) continue;
			const idx = segment.indexOf("=");
			if (idx === -1) continue;
			const key = segment.slice(0, idx).trim();
			const val = segment.slice(idx + 1);
			if (!key) continue;
			hadAny = true;
			setPath(obj, key, val);
		}
		if (hadAny) return obj;
	}

	return { text: s };
}

function deepMerge(a: any, b: any): any {
	if (!isPlainObject(a) || !isPlainObject(b))
		return isPlainObject(b) ? { ...b } : b;
	const out: Record<string, any> = { ...a };
	for (const [k, v] of Object.entries(b)) {
		if (k in out && isPlainObject(out[k]) && isPlainObject(v))
			out[k] = deepMerge(out[k], v);
		else out[k] = v;
	}
	return out;
}

export class Metadata {
	private _raw?: string;
	private _json?: any;

	private constructor(raw?: string, json?: any) {
		this._raw = typeof raw === "string" ? raw : undefined;
		this._json =
			typeof json !== "undefined"
				? json
				: typeof this._raw !== "undefined"
					? parseRawToJson(this._raw)
					: undefined;
		if (typeof this._raw === "undefined" && typeof this._json !== "undefined") {
			this._raw = safeStringify(this._json);
		}
		if (typeof this._json === "undefined" && typeof this._raw !== "undefined") {
			this._json = parseRawToJson(this._raw);
		}
	}

	static from(input: MetadataInput): Metadata {
		if (input instanceof Metadata) return input;
		if (input == null) return new Metadata("");
		if (typeof input === "string") return Metadata.fromRaw(input);
		return Metadata.fromJson(input);
	}

	static fromRaw(raw: string, opts?: { parseJson?: boolean }): Metadata {
		const json =
			opts?.parseJson === false ? { text: raw } : parseRawToJson(raw);
		return new Metadata(raw, json);
	}

	static fromJson(json: any, _opts?: { stringify?: boolean }): Metadata {
		const raw = safeStringify(json);
		return new Metadata(raw, json);
	}

	static toRaw(input: MetadataInput): string {
		return Metadata.from(input).toString();
	}

	static toJson<T = any>(input: MetadataInput): T | undefined {
		return Metadata.from(input).json<T>();
	}

	static combine(
		leftInput: MetadataInput,
		rightInput: MetadataInput,
		opts?: {
			mergeStrategy?: "shallow" | "deep";
			prefer?: "left" | "right";
			raw?: "left" | "right" | "concat" | "stringifyMerged";
			delimiter?: string;
		},
	): Metadata {
		const left = Metadata.from(leftInput);
		const right = Metadata.from(rightInput);

		const strategy = opts?.mergeStrategy ?? "shallow";
		const leftJson = left.json<Record<string, any>>();
		const rightJson = right.json<Record<string, any>>();

		let mergedJson: any | undefined;
		if (leftJson && rightJson)
			mergedJson =
				strategy === "deep"
					? deepMerge(leftJson, rightJson)
					: { ...leftJson, ...rightJson };
		else mergedJson = leftJson ?? rightJson;

		const rawMode = opts?.raw ?? "stringifyMerged";
		let raw: string | undefined;
		if (rawMode === "left") raw = left._raw ?? right._raw;
		else if (rawMode === "right") raw = right._raw ?? left._raw;
		else if (rawMode === "concat")
			raw = [left._raw, right._raw]
				.filter(Boolean)
				.join(opts?.delimiter ?? "\n");
		else
			raw =
				mergedJson !== undefined
					? safeStringify(mergedJson)
					: (right._raw ?? left._raw);

		return new Metadata(raw, mergedJson);
	}

	hasRaw(): boolean {
		return typeof this._raw === "string";
	}
	hasJson(): boolean {
		return typeof this._json !== "undefined";
	}

	raw(): string | undefined {
		return this._raw;
	}

	json<T = any>(): T | undefined {
		if (typeof this._json !== "undefined") return this._json as T;
		this._json = parseRawToJson(this._raw);
		return this._json as T;
	}

	text(): string {
		return this._raw ?? safeStringify(this._json);
	}
	toString(): string {
		return this.text();
	}
	toJSON(): { raw?: string; json?: any } {
		return { raw: this._raw, json: this._json };
	}

	withRaw(raw: string, parseJson = true): Metadata {
		if (parseJson === false) return new Metadata(raw, { text: raw });
		return new Metadata(raw, parseRawToJson(raw));
	}

	withJson(json: any, stringify = true): Metadata {
		const nextRaw = stringify
			? safeStringify(json)
			: (this._raw ?? safeStringify(json));
		return new Metadata(nextRaw, json);
	}

	merge(input: MetadataInput, deep = false): Metadata {
		const obj = Metadata.from(input).json<Record<string, any>>() ?? {};
		const base = this.json<Record<string, any>>() ?? {};
		const merged = deep ? deepMerge(base, obj) : { ...base, ...obj };
		return Metadata.fromJson(merged);
	}
}
