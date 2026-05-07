// Project: Select.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2026-05-07

// Module: select/utils
// Shared utility helpers used across select modules.

function logger(scope) {
	return {
		log: (...args) => console.log(`[${scope}]`, ...args),
		warn: (...args) => console.warn(`[${scope}]`, ...args),
		error: (...args) => console.error(`[${scope}]`, ...args),
	};
}

function isObject(value) {
	return (
		value !== null &&
		value !== undefined &&
		typeof value === "object" &&
		Object.getPrototypeOf(value) === Object.prototype
	);
}

const Nothing = Object.freeze(new Object());

const Something = Object.freeze(new Object());

function clone(value, key = undefined) {
	if (Array.isArray(value)) return value.slice();
	if (isObject(value)) return { ...value };
	return typeof key === "number" ? [] : {};
}

function access(context, p, offset = 0) {
	if (p?.length && context !== undefined) {
		for (
			let i = offset;
			i < p.length && context !== undefined && context !== null;
			i++
		) {
			context = context[p[i]];
		}
	}
	return context;
}

function path(p, nothing = undefined) {
	if (p === nothing) {
		return null;
	}
	if (Array.isArray(p)) {
		return p;
	}
	if (p !== undefined && p !== null) {
		return [p];
	}
	return null;
}

function assign(scope, p, value, merge = undefined, offset = 0) {
	const n = p?.length ?? 0;
	if (n === 0) {
		return merge ? merge(scope, value) : value;
	}
	let root =
		n > offset && !(scope && scope instanceof Object)
			? typeof p[offset] === "number"
				? new Array(p[offset])
				: {}
			: scope;
	let s = root;
	let sp = null;
	for (let i = offset; i < n - 1; i++) {
		const k = p[i];
		if (!(s && s instanceof Object)) {
			s = typeof k === "number" ? new Array(k) : {};
			if (i === 0) {
				root = s;
			} else {
				sp[p[i - 1]] = s;
			}
		}
		if (typeof k === "number" && Array.isArray(s)) {
			while (s.length <= k) {
				s.push(undefined);
			}
		}
		sp = s;
		s = s[k];
	}
	const k = p[n - 1];
	s[k] = merge ? merge(s[k], value) : value;
	return root;
}

function reassign(scope, p, value, merge = undefined, offset = 0) {
	const n = p?.length ?? 0;
	if (n === 0) {
		return merge ? merge(scope, value) : value;
	}
	const start = offset < 0 ? 0 : offset;
	if (start >= n) {
		return scope;
	}
	const root = clone(scope);
	let currentClone = root;
	let currentOriginal =
		scope && (Array.isArray(scope) || isObject(scope)) ? scope : undefined;
	for (let i = start; i < n - 1; i++) {
		const key = p[i];
		const originalChild = currentOriginal ? currentOriginal[key] : undefined;
		const childClone = clone(originalChild, p[i + 1]);
		if (Array.isArray(currentClone) && typeof key === "number") {
			while (currentClone.length <= key) currentClone.push(undefined);
		}
		currentClone[key] = childClone;
		currentClone = childClone;
		currentOriginal = originalChild;
	}
	const leafKey = p[n - 1];
	if (Array.isArray(currentClone) && typeof leafKey === "number") {
		while (currentClone.length <= leafKey) currentClone.push(undefined);
	}
	currentClone[leafKey] = merge ? merge(currentClone[leafKey], value) : value;
	return root;
}

function sanitizeValue(value) {
	if (value === undefined) return undefined;
	if (Array.isArray(value)) {
		const res = [];
		for (let i = 0; i < value.length; i++) {
			const item = sanitizeValue(value[i]);
			if (item !== undefined) res.push(item);
		}
		return res;
	}
	if (isObject(value)) {
		const res = {};
		for (const k in value) {
			if (!Object.hasOwn(value, k)) continue;
			const item = sanitizeValue(value[k]);
			if (item !== undefined) res[k] = item;
		}
		return res;
	}
	return value;
}

function eq(a, b, limit = undefined) {
	if (Object.is(a, b)) {
		return true;
	}
	if (limit !== undefined && limit <= 0) {
		return false;
	}
	const nextLimit = limit === undefined ? undefined : limit - 1;
	if (Array.isArray(a) && Array.isArray(b)) {
		if (a.length !== b.length) {
			return false;
		}
		for (let i = 0; i < a.length; i++) {
			if (!eq(a[i], b[i], nextLimit)) {
				return false;
			}
		}
		return true;
	}
	if (isObject(a) && isObject(b)) {
		let n = 0;
		for (const k in a) {
			if (!Object.hasOwn(a, k)) {
				continue;
			}
			n += 1;
			if (!Object.hasOwn(b, k) || !eq(a[k], b[k], nextLimit)) {
				return false;
			}
		}
		for (const k in b) {
			if (Object.hasOwn(b, k)) {
				n -= 1;
			}
		}
		return n === 0;
	}
	return false;
}

function len(v) {
	if (v === undefined || v === null) {
		return 0;
	} else if (Array.isArray(v)) {
		return v.length;
	} else if (typeof v === "string") {
		return v.length;
	} else if (v instanceof Map || v instanceof Set) {
		return v.size;
	} else if (isObject(v)) {
		return Object.keys(v).length;
	}
	return 1;
}

const queueMicro =
	typeof globalThis.queueMicrotask === "function"
		? globalThis.queueMicrotask.bind(globalThis)
		: (fn) => Promise.resolve().then(fn);

function asText(value) {
	value = expand(value);
	return value === null || value === undefined
		? ""
		: typeof value === "number"
			? `${value}`
			: typeof value === "string"
				? value
				: JSON.stringify(value);
}

function isPascalCaseName(name) {
	return /^[A-Z][A-Za-z0-9_]*$/.test(name);
}

function list(value) {
	if (value == null) return [];
	switch (value?.constructor) {
		case Array:
			return value;
		case Object:
			return Object.values(value);
		case Map:
			return Array.from(value.values());
		case Set:
			return Array.from(value);
		default:
			return [value];
	}
}

function itemkey(item) {
	return item?.id ?? item?.key ?? item?.name ?? item;
}

function index(items, item, keyFn = undefined) {
	if (!items) {
		return -1;
	}
	items = list(items);
	if (keyFn === null) {
		return items.indexOf(item);
	}
	const key = keyFn ?? itemkey;
	const target = key(item);
	for (let i = 0; i < items.length; i++) {
		if (key(items[i]) === target) {
			return i;
		}
	}
	return -1;
}

function has(items, item, keyFn = undefined) {
	return index(items, item, keyFn) >= 0;
}

function add(items, item, keyFn = undefined) {
	if (!items) {
		return [item];
	}
	items = list(items);
	return index(items, item, keyFn) < 0 ? [...items, item] : items;
}

function remove(items, item, keyFn = undefined) {
	if (!items) {
		return items;
	}
	items = list(items);
	const i = index(items, item, keyFn);
	if (i < 0) {
		return items;
	}
	const res = [...items];
	res.splice(i, 1);
	return res;
}

function toggle(items, item, keyFn = undefined) {
	return has(items, item, keyFn)
		? (remove(items, item, keyFn) ?? [])
		: add(items, item, keyFn);
}

function wrapindex(itemsOrLength, i, delta = 1) {
	const n =
		typeof itemsOrLength === "number"
			? itemsOrLength
			: (itemsOrLength?.length ?? 0);
	if (n <= 0) {
		return 0;
	}
	return (((i + delta) % n) + n) % n;
}

function rescape(value) {
	return `${value}`.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function bool(value) {
	if (value == null) return false;
	if (typeof value === "boolean") return value;
	if (typeof value === "number") return value !== 0;
	if (typeof value === "string") return value.length > 0;
	return true;
}

function extractor(pathOrFunc) {
	if (typeof pathOrFunc === "function") {
		return pathOrFunc;
	}
	if (pathOrFunc == null) {
		return (v) => v;
	}
	return (v) => access(v, pathOrFunc);
}

function cmp(a, b, extractorFunc) {
	if (extractorFunc) {
		const ext = extractor(extractorFunc);
		a = ext(a);
		b = ext(b);
	}
	if (a < b) return -1;
	if (a > b) return 1;
	return 0;
}

function predicate(predicateOrExtractor) {
	if (typeof predicateOrExtractor === "function") {
		return predicateOrExtractor;
	}
	if (predicateOrExtractor == null) {
		return (v) => bool(v);
	}
	const ext = extractor(predicateOrExtractor);
	return (v) => bool(ext(v));
}

function sorted(values, extractorFunc) {
	const arr = list(values);
	if (!extractorFunc) {
		return arr.slice().sort();
	}
	const ext = extractor(extractorFunc);
	return arr.slice().sort((a, b) => cmp(ext(a), ext(b)));
}

function unique(values, extractorFunc) {
	const arr = list(values);
	if (!extractorFunc) {
		return Array.from(new Set(arr));
	}
	const ext = extractor(extractorFunc);
	const seen = new Set();
	return arr.filter((v) => {
		const key = ext(v);
		if (seen.has(key)) return false;
		seen.add(key);
		return true;
	});
}

function filter(values, predicateOrExtractor) {
	const arr = list(values);
	const pred = predicate(predicateOrExtractor);
	return arr.filter(pred);
}

function find(items, item, key = itemkey) {
	return index(items, item, key);
}

function next(items, i, delta = 1) {
	return wrapindex(items, i, delta);
}

function* iwalk(value, functor, processor, p = [], parents = []) {
	value = processor ? processor(value) : value;
	if (!functor || functor(value, p, parents) !== false) {
		yield [value, p, parents];
		switch (value?.constructor) {
			case Array: {
				const pp = [...parents, value];
				for (let i = 0; i < value.length; i++) {
					yield* iwalk(value[i], functor, processor, [...p, i], pp);
				}
				break;
			}
			case Object: {
				const pp = [...parents, value];
				for (const k in value) {
					yield* iwalk(value[k], functor, processor, [...p, k], pp);
				}
				break;
			}
			case Map:
			case Set: {
				const pp = [...parents, value];
				for (const [k, v] of value.entries()) {
					yield* iwalk(v, functor, processor, [...p, k], pp);
				}
				break;
			}
		}
	}
}

const RE_SHORTWORD = /[A-Za-z][A-Za-z0-9]+/g;

function b26(i) {
	let result = "";
	const base = 26;
	do {
		result = String.fromCharCode(97 + (i % base)) + result;
		i = Math.floor(i / base) - 1;
	} while (i >= 0);
	return result;
}

function shortdict(text) {
	const words = Array.isArray(text)
		? text
		: `${text ?? ""}`.match(RE_SHORTWORD) || [];
	const counts = new Map();
	for (let i = 0; i < words.length; i++) {
		const word = words[i];
		counts.set(word, (counts.get(word) || 0) + 1);
	}
	const sortedWords = Array.from(counts.entries())
		.sort((a, b) => b[1] - a[1])
		.map((entry) => entry[0]);
	return Object.fromEntries(sortedWords.map((word, i) => [word, b26(i)]));
}

function shortword(text, dict = shortdict(text)) {
	let compressed = `${text ?? ""}`;
	for (const [originalWord, indexWord] of Object.entries(dict || {})) {
		const original = `${originalWord}`;
		if (!original) continue;
		compressed = compressed.replace(
			new RegExp(`\\b${rescape(original)}\\b`, "g"),
			`${indexWord}`,
		);
	}
	return compressed;
}

function unshortword(text, dict = shortdict(text)) {
	const source = `${text ?? ""}`;
	let compressed = source;
	let activeDict = dict || {};
	const splitIndex = source.indexOf("=");
	if (splitIndex >= 0) {
		const dictionary = source.slice(0, splitIndex);
		compressed = source.slice(splitIndex + 1);
		const words = dictionary ? dictionary.split(",") : [];
		const decoded = {};
		for (let i = 0; i < words.length; i++) {
			const word = words[i]?.trim();
			if (word) decoded[word] = b26(i);
		}
		activeDict = decoded;
	}
	let decompressed = compressed;
	for (const [originalWord, indexWord] of Object.entries(activeDict)) {
		const short = `${indexWord ?? ""}`;
		if (!short) continue;
		decompressed = decompressed.replace(
			new RegExp(`\\b${rescape(short)}\\b`, "g"),
			`${originalWord}`,
		);
	}
	return decompressed;
}

function* iclsx(...args) {
	for (const value of args) {
		if (!value) continue;
		switch (value?.constructor) {
			case Array:
				yield* iclsx(...value);
				break;
			case Object:
				for (const key in value) {
					const token = key.trim();
					if (value[key] && token) yield token;
				}
				break;
			case String: {
				const token = value.trim();
				if (token.length) yield token;
				break;
			}
			case Number:
				yield `${value}`;
				break;
		}
	}
}

function clsx(...args) {
	return [...iclsx(...args)].join(" ");
}

function remap(
	value,
	mapper,
	{ deep = false, match = undefined, descend = undefined, path = [] } = {},
) {
	const shouldMap = match ? !!match(value, path) : true;
	const mapped = shouldMap ? mapper(value, path[path.length - 1], path) : value;
	if (!deep) {
		return mapped;
	}
	if (descend && descend(mapped, path) === false) {
		return mapped;
	}
	if (Array.isArray(mapped)) {
		const n = mapped.length;
		const res = new Array(n);
		for (let i = 0; i < n; i++) {
			res[i] = remap(mapped[i], mapper, {
				deep,
				match,
				descend,
				path: [...path, i],
			});
		}
		return res;
	}
	if (mapped instanceof Map) {
		const res = new Map();
		for (const [k, v] of mapped.entries()) {
			res.set(
				k,
				remap(v, mapper, {
					deep,
					match,
					descend,
					path: [...path, k],
				}),
			);
		}
		return res;
	}
	if (mapped instanceof Set) {
		const res = new Set();
		let i = 0;
		for (const v of mapped.values()) {
			res.add(
				remap(v, mapper, {
					deep,
					match,
					descend,
					path: [...path, i],
				}),
			);
			i += 1;
		}
		return res;
	}
	if (isObject(mapped)) {
		const res = {};
		for (const k in mapped) {
			if (!Object.hasOwn(mapped, k)) {
				continue;
			}
			res[k] = remap(mapped[k], mapper, {
				deep,
				match,
				descend,
				path: [...path, k],
			});
		}
		return res;
	}
	return mapped;
}

function expand(value) {
	return remap(value, (v) => (v?.isReactive === true ? v.value : v), {
		deep: true,
		descend: (v) => !(v?.isReactive === true),
	});
}

export {
	access,
	add,
	asText,
	assign,
	bool,
	clsx,
	cmp,
	expand,
	eq,
	extractor,
	filter,
	find,
	has,
	iclsx,
	index,
	isObject,
	isPascalCaseName,
	iwalk,
	len,
	list,
	logger,
	Nothing,
	next,
	path,
	predicate,
	queueMicro,
	reassign,
	remap,
	remove,
	sanitizeValue,
	shortdict,
	shortword,
	sorted,
	Something,
	toggle,
	unshortword,
	unique,
	wrapindex,
	clone,
};

// EOF
