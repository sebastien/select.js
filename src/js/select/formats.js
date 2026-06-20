// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-05-15
// Updated: 2026-06-18

// Module: select/formats
// String case format helpers shared across modules.

import { unwrap } from "./cells.js";
import { hi as htmlHi } from "./utils/html.js";
import { bool, entries, idem, len, type } from "./utils.js";

const NA = "―";
const DEFAULTS = {
	MONTH_NAMES: [
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
	],
	DAY_NAMES: [
		"Monday",
		"Tuesday",
		"Wednesday",
		"Thursday",
		"Friday",
		"Saturday",
		"Sunday",
	],
	CURRENCY: "USD",
};
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
const LOCAL_TIME = Symbol("localtime");

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

function defined(value) {
	return value !== undefined;
}

function yesno(value) {
	return value === undefined || value === null
		? NA
		: bool(value)
			? "yes"
			: "no";
}

function disabled(value) {
	return bool(value) ? undefined : "";
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

function datePartsToDate(value) {
	const tz = value[6];
	let offset = 0;
	if (typeof tz === "number" && Number.isFinite(tz)) {
		offset = tz;
	} else if (typeof tz === "string") {
		if (tz !== "Z") {
			const match = tz.match(/^([+-])(\d{2}):?(\d{2})$/);
			if (match) {
				offset =
					(Number(match[2]) * 60 + Number(match[3])) *
					(match[1] === "+" ? 1 : -1);
			}
		}
	}
	return new Date(
		Date.UTC(
			value[0],
			(value[1] || 1) - 1,
			value[2] || 1,
			value[3] || 0,
			value[4] || 0,
			value[5] || 0,
		) -
			offset * 60000,
	);
}

function asDate(value) {
	if (value?.[LOCAL_TIME]) {
		return value.date;
	}
	if (value instanceof Date) {
		return value;
	}
	if (Array.isArray(value)) {
		return datePartsToDate(value);
	}
	if (typeof value === "number" && Number.isFinite(value)) {
		return new Date(value * 1000);
	}
	if (typeof value === "string") {
		const source = value.trim();
		if (!source) {
			return new Date();
		}
		if (/^-?\d+(?:\.\d+)?$/.test(source)) {
			return new Date(Number(source) * 1000);
		}
		const match = source.match(
			/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?(Z|[+-]\d{2}:?\d{2})?$/,
		);
		if (match) {
			return datePartsToDate([
				Number(match[1]),
				Number(match[2]),
				Number(match[3]),
				Number(match[4] ?? 0),
				Number(match[5] ?? 0),
				Number(match[6] ?? 0),
				match[7],
			]);
		}
	}
	return new Date();
}

function timestamp(value) {
	return Math.floor(asDate(value).getTime() / 1000);
}

function date(value) {
	const local = value?.[LOCAL_TIME] === true;
	const d = asDate(value);
	const year = local ? d.getFullYear() : d.getUTCFullYear();
	const month = (local ? d.getMonth() : d.getUTCMonth()) + 1;
	const day = local ? d.getDate() : d.getUTCDate();
	return `${year}-${month < 10 ? `0${month}` : `${month}`}-${day < 10 ? `0${day}` : `${day}`}`;
}

function month(value) {
	const local = value?.[LOCAL_TIME] === true;
	const d = asDate(value);
	const res = (local ? d.getMonth() : d.getUTCMonth()) + 1;
	return res < 10 ? `0${res}` : `${res}`;
}

function monthname(value) {
	const local = value?.[LOCAL_TIME] === true;
	const d = asDate(value);
	return DEFAULTS.MONTH_NAMES[local ? d.getMonth() : d.getUTCMonth()] ?? "";
}

function day(value) {
	const local = value?.[LOCAL_TIME] === true;
	const d = asDate(value);
	const res = local ? d.getDate() : d.getUTCDate();
	return res < 10 ? `0${res}` : `${res}`;
}

function dayname(value) {
	const local = value?.[LOCAL_TIME] === true;
	const d = asDate(value);
	return (
		DEFAULTS.DAY_NAMES[((local ? d.getDay() : d.getUTCDay()) + 6) % 7] ?? ""
	);
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
	const currency = typeof code === "string" ? code : undefined;
	if (!Number.isFinite(n)) {
		return "";
	}
	if (options) {
		return new Intl.NumberFormat(undefined, {
			style: "currency",
			currency: currency ?? DEFAULTS.CURRENCY,
			...options,
		}).format(n);
	}
	if (!currency) {
		return currencyFormatterDefault.format(n);
	}
	let formatter = currencyFormatters.get(currency);
	if (!formatter) {
		formatter = new Intl.NumberFormat(undefined, {
			style: "currency",
			currency,
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
	const local = value?.[LOCAL_TIME] === true;
	const d = asDate(value);
	const hours = local ? d.getHours() : d.getUTCHours();
	const minutes = local ? d.getMinutes() : d.getUTCMinutes();
	const seconds = local ? d.getSeconds() : d.getUTCSeconds();
	return `${hours < 10 ? `0${hours}` : `${hours}`}:${minutes < 10 ? `0${minutes}` : `${minutes}`}:${seconds < 10 ? `0${seconds}` : `${seconds}`}`;
}

function datetime(value) {
	return `${date(value)} ${time(value)}`;
}

function localtime(value) {
	return {
		[LOCAL_TIME]: true,
		date: asDate(value),
		toString() {
			return `${date(this)} ${time(this)}`;
		},
	};
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
	const local = value?.[LOCAL_TIME] === true;
	const source = asDate(value);
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
	const dateYear = local ? source.getFullYear() : source.getUTCFullYear();
	const currentYear = local ? now.getFullYear() : now.getUTCFullYear();
	const dateText = `On ${DEFAULTS.MONTH_NAMES[local ? source.getMonth() : source.getUTCMonth()]}, ${local ? source.getDate() : source.getUTCDate()}`;
	return dateYear === currentYear ? dateText : `${dateText}, ${dateYear}`;
}

function timetuple(value) {
	return value === undefined || value === null ? null : asDate(value);
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

function hi(value, query) {
	if (value === undefined || value === null) {
		return value;
	}
	const highlighted = htmlHi(value, query);
	if (highlighted instanceof DocumentFragment) {
		const wrapper = document.createElement("span");
		wrapper.appendChild(highlighted);
		return wrapper;
	}
	return highlighted;
}

function debug(value, scope) {
	console.log("[uijs.debug] Slot value:", { value, scope });
	return value;
}

const FORMATS = {
	active,
	ago,
	asDate,
	attr,
	bool,
	count,
	currency,
	date,
	datetime,
	day,
	dayname,
	debug,
	defined,
	disabled,
	duration,
	empty,
	entries,
	head,
	hi,
	html,
	idem,
	index,
	item,
	json,
	len,
	localtime,
	month,
	monthname,
	not,
	number,
	percent,
	swallow,
	timestamp,
	text,
	time,
	timetuple,
	toCamelCase,
	toKebabCase,
	type,
	unwrap: unwrapped,
	yesno,
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
	active,
	ago,
	asDate,
	attr,
	bool,
	count,
	currency,
	DEFAULTS,
	date,
	datetime,
	day,
	debug,
	defined,
	disabled,
	duration,
	empty,
	entries,
	FORMATS,
	format,
	head,
	hi,
	html,
	idem,
	index,
	item,
	json,
	len,
	localtime,
	month,
	NA,
	not,
	number,
	percent,
	swallow,
	timestamp,
	text,
	time,
	timetuple,
	toCamelCase,
	toKebabCase,
	type,
	unwrapped as unwrap,
	yesno,
};

// EOF
