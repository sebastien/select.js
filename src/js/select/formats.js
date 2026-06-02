// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-05-15

// Module: select/formats
// String case format helpers shared across modules.

import { unwrap } from "./cells.js";
import { bool, entries, idem, len, type } from "./utils.js";

const MONTH_NAMES = [
	"January",
	"February",
	"March",
	"April",
	"May",
	"June",
	"July",
	"August",
	"September",
	"October",
	"November",
	"December",
];
const numberFormatterDefault = new Intl.NumberFormat();
const percentFormatterDefault = new Intl.NumberFormat(undefined, {
	style: "percent",
	maximumFractionDigits: 2,
});
const currencyFormatterDefault = new Intl.NumberFormat(undefined, {
	style: "currency",
	currency: "USD",
});
const currencyFormatters = new Map();

function active(value) {
	return value ? "active" : "";
}
function toKebabCase(value) {
	return `${value}`
		.replace(/([a-z0-9])([A-Z])/g, "$1-$2")
		.replace(/[_\s]+/g, "-")
		.toLowerCase();
}

function toCamelCase(value) {
	return `${value}`
		.toLowerCase()
		.replace(/-([a-z0-9])/g, (_, letter) => letter.toUpperCase());
}

function text(value) {
	return `${value}`;
}

function unwrapped(value) {
	return unwrap(value);
}

function count(value) {
	const n = len(value);
	return n ? `${n}` : "";
}

function index(value) {
	return typeof value === "number" ? value + 1 : null;
}

function attr(value) {
	return bool(value) ? text(value) : "";
}

function not(value) {
	return !bool(value);
}

function item(value, index) {
	switch (value?.constructor) {
		case String:
		case Boolean:
		case Number:
		case undefined:
			return { value, label: `${value}`, index };
		default:
			return value;
	}
}
function empty(value) {
	if (!value) {
		return true;
	}
	if (Array.isArray(value)) {
		return value.length === 0;
	}
	if (!(value instanceof Object)) {
		return false;
	}
	for (const _key in value) {
		return false;
	}
	return true;
}

function asDate(value) {
	return value && typeof value === "number"
		? new Date(value * 1000)
		: value && value instanceof Date
			? value
			: new Date();
}

function asDateWithUtcFallback(value) {
	if (value instanceof Date) {
		return value;
	}
	if (typeof value === "number") {
		return new Date(value * 1000);
	}
	if (typeof value !== "string") {
		return asDate(value);
	}
	const source = value.trim();
	if (!source) {
		return new Date();
	}
	// Treat timezone-less ISO-like strings as UTC so local rendering is stable.
	const hasTimezone = /(?:Z|[+-]\d{2}:?\d{2})$/i.test(source);
	const normalized =
		hasTimezone || !/^\d{4}-\d{2}-\d{2}/.test(source)
			? source
			: `${source.replace(" ", "T")}Z`;
	return new Date(normalized);
}

function date(value) {
	const d = asDate(value);
	const month = d.getMonth() + 1;
	const day = d.getDate();
	return `${d.getFullYear()}-${month < 10 ? `0${month}` : `${month}`}-${day < 10 ? `0${day}` : `${day}`}`;
}

function number(value, options = undefined) {
	const n = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(n)) {
		return "";
	}
	return options
		? new Intl.NumberFormat(undefined, options).format(n)
		: numberFormatterDefault.format(n);
}

function currency(value, code = "USD", options = undefined) {
	const n = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(n)) {
		return "";
	}
	if (options) {
		return new Intl.NumberFormat(undefined, {
			style: "currency",
			currency: code || "USD",
			...options,
		}).format(n);
	}
	const c = code || "USD";
	if (c === "USD") {
		return currencyFormatterDefault.format(n);
	}
	let formatter = currencyFormatters.get(c);
	if (!formatter) {
		formatter = new Intl.NumberFormat(undefined, {
			style: "currency",
			currency: c,
		});
		currencyFormatters.set(c, formatter);
	}
	return formatter.format(n);
}

function percent(value, options = undefined) {
	const n = typeof value === "number" ? value : Number(value);
	if (!Number.isFinite(n)) {
		return "";
	}
	return options
		? new Intl.NumberFormat(undefined, {
				style: "percent",
				maximumFractionDigits: 2,
				...options,
			}).format(n)
		: percentFormatterDefault.format(n);
}

function time(value) {
	const d = asDate(value);
	const hours = d.getHours();
	const minutes = d.getMinutes();
	const seconds = d.getSeconds();
	return `${hours < 10 ? `0${hours}` : `${hours}`}:${minutes < 10 ? `0${minutes}` : `${minutes}`}:${seconds < 10 ? `0${seconds}` : `${seconds}`}`;
}

function datetime(value) {
	const d = asDate(value);
	return `${date(d)} ${time(d)}`;
}

function localtime(value) {
	const d = asDateWithUtcFallback(value);
	return `${date(d)} ${time(d)}`;
}

const durationUnits = [
	{ name: " year", value: 365 * 24 * 60 * 60 },
	{ name: " weeks", value: 7 * 24 * 60 * 60 },
	{ name: " day", value: 24 * 60 * 60 },
	{ name: "h", value: 60 * 60 },
	{ name: "m", value: 60 },
	{ name: "s", value: 1 },
];

function duration(seconds) {
	if (typeof seconds !== "number") {
		return null;
	}
	const parts = [];
	let v = Math.abs(seconds);
	for (const { name, value } of durationUnits) {
		if (v >= value) {
			const t = Math.floor(v / value);
			parts.push(`${t}${name}`);
			v -= t * value;
		}
	}
	return parts.length
		? parts.join(" ")
		: v === Math.floor(v)
			? `${Math.floor(v)}`
			: `${v.toFixed(2)}s`;
}

function swallow() {
	return "";
}

function ago(value) {
	const source =
		value && typeof value === "number"
			? new Date(value * 1000)
			: value instanceof Date
				? value
				: null;
	if (!source) {
		return null;
	}
	const now = new Date();
	const diffInSeconds = Math.floor((now - source) / 1000);
	const absDiff = Math.abs(diffInSeconds);
	const prefix = diffInSeconds > 0 ? "" : "in ";
	const suffix = diffInSeconds > 0 ? " ago" : "";
	if (absDiff < 1) {
		return "now";
	}
	if (absDiff < 60) {
		return `${prefix}${absDiff}s${suffix}`;
	}
	const diffInMinutes = Math.floor(absDiff / 60);
	if (diffInMinutes < 60) {
		return `${prefix}${diffInMinutes}m${suffix}`;
	}
	const diffInHours = Math.floor(diffInMinutes / 60);
	if (diffInHours < 24) {
		return `${prefix}${diffInHours}h${suffix}`;
	}
	const diffInDays = Math.floor(diffInHours / 24);
	if (diffInDays < 7) {
		return `${prefix}${diffInDays}d${suffix}`;
	}
	const diffInWeeks = Math.floor(diffInDays / 7);
	if (diffInWeeks < 4) {
		return `${prefix}${diffInWeeks}w${suffix}`;
	}
	const dateYear = source.getFullYear();
	const currentYear = now.getFullYear();
	const dateText = `On ${MONTH_NAMES[source.getMonth()]}, ${source.getDate()}`;
	return dateYear === currentYear ? dateText : `${dateText}, ${dateYear}`;
}

function timetuple(value) {
	return value && Array.isArray(value)
		? new Date(
				Date.UTC(
					value[0],
					value[1] - 1,
					value[2],
					value[3],
					value[4],
					value[5],
				),
			)
		: value instanceof Date
			? value
			: null;
}

const HTML_PARSER = globalThis.DOMParser ? new DOMParser() : null;

function json(value) {
	return value === undefined ? "" : JSON.stringify(value);
}

function head(value) {
	return Array.isArray(value) && value.length > 0 ? value[0] : null;
}
const html = HTML_PARSER
	? (value) => {
			const doc = HTML_PARSER.parseFromString(`${value ?? ""}`, "text/html");
			const nodes = [...(doc.body?.childNodes ?? [])];
			if (nodes.length === 1) {
				return nodes[0];
			}
			const res = new DocumentFragment();
			for (const node of nodes) {
				res.appendChild(node);
			}
			return res;
		}
	: (value) => value;

function debug(value, scope) {
	console.log("[uijs.debug] Slot value:", { value, scope });
	return value;
}

const FORMATS = {
	ago,
	active,
	asDate,
	attr,
	bool,
	count,
	currency,
	date,
	datetime,
	debug,
	duration,
	empty,
	entries,
	html,
	idem,
	index,
	item,
	json,
	head,
	len,
	localtime,
	not,
	number,
	percent,
	swallow,
	text,
	time,
	timetuple,
	toCamelCase,
	toKebabCase,
	type,
	unwrap: unwrapped,
};

function format(name, ...value) {
	if (name && typeof name === "object" && !Array.isArray(name)) {
		for (const key in name) {
			FORMATS[key] = name[key];
		}
		return FORMATS;
	}
	if (typeof name !== "string") {
		return undefined;
	}
	const key = name.trim();
	if (!key) {
		return undefined;
	}
	if (value.length) {
		FORMATS[key] = value[0];
		return value[0];
	}
	return FORMATS[key];
}

export {
	ago,
	active,
	asDate,
	attr,
	bool,
	count,
	currency,
	date,
	datetime,
	debug,
	duration,
	empty,
	entries,
	FORMATS,
	format,
	html,
	idem,
	index,
	json,
	len,
	localtime,
	not,
	number,
	percent,
	swallow,
	text,
	time,
	timetuple,
	item,
	head,
	toCamelCase,
	toKebabCase,
	type,
	unwrapped as unwrap,
};

// EOF
