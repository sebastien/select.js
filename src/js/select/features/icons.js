// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-04-23
// Updated: 2026-10-01

// Module: select/features/icons
// SVG icon registry and loader utilities. Built-in presets fetch one SVG per
// icon from pinned jsDelivr packages. An explicit source with `format: "iconify"`
// can still read a collection JSON; that is never the default.
// SEE: https://observablehq.com/@sebastien/icons

import { classTokens } from "../utils/dom.js";
import { logger } from "../utils/index.js";

const SVG = "http://www.w3.org/2000/svg";
const log = logger("select.icons");
const ICON_NAME = "__ICON_NAME__";
const ICON_SOURCE = "__ICON_SOURCE__";
const ICON_RETRY_DELAYS = [250, 500, 1000];
const SVG_ALLOWED_TAGS = new Set([
	"svg",
	"g",
	"path",
	"circle",
	"rect",
	"line",
	"polyline",
	"polygon",
	"ellipse",
	"defs",
	"lineargradient",
	"radialgradient",
	"stop",
	"clippath",
	"mask",
	"title",
	"desc",
	"use",
]);
const SVG_ALLOWED_ATTRS = new Set(
	[
		"class",
		"cx",
		"cy",
		"d",
		"fill",
		"fill-opacity",
		"fill-rule",
		"height",
		"id",
		"mask",
		"maskcontentunits",
		"maskunits",
		"offset",
		"opacity",
		"points",
		"preserveaspectratio",
		"r",
		"role",
		"rx",
		"ry",
		"stroke",
		"stroke-dasharray",
		"stroke-dashoffset",
		"stroke-linecap",
		"stroke-linejoin",
		"stroke-miterlimit",
		"stroke-opacity",
		"stroke-width",
		"transform",
		"viewbox",
		"width",
		"x",
		"x1",
		"x2",
		"xlink:href",
		"xmlns",
		"y",
		"y1",
		"y2",
		"href",
		"gradienttransform",
		"gradientunits",
		"clip-path",
		"clip-rule",
		"clipPathUnits",
		"stop-color",
		"stop-opacity",
		"vector-effect",
	].map((_) => _.toLowerCase()),
);
// Constant: IconContainer
// Shared hidden SVG container used to host loaded symbols.
const IconContainer = Object.entries({
	style: "position:absolute; width:0; height:0; overflow:hidden;",
	width: "0",
	height: "0",
	viewBox: "0 0 0 0",
}).reduce(
	(r, [k, v]) => {
		r.setAttribute(k, v);
		return r;
	},
	document.createElementNS(SVG, "svg"),
);

const IconDefaults = {
	name: "file-question-mark",
	source: "lucide",
	size: [24, 24],
	style: {
		color: "var(--color-icon,currentColor)",
	},
};

// Constant: FillStyle
// Paint override for icon sets whose paths inherit black fill instead of
// `currentColor`.
const FillStyle = {
	fill: "var(--color-icon,currentColor)",
	stroke: "none",
};

// Constant: SourceTransforms
// Named filename transforms referenced by preset `transform` strings.
const SourceTransforms = {
	kebabcase: (name) => `${name}`.replaceAll("_", "-").replaceAll(" ", "-"),
	snakecase: (name) => `${name}`.replaceAll("-", "_").replaceAll(" ", "_"),
	snakecaseFill: (name) => {
		const text = `${name}`;
		const suffix = text.endsWith("-fill") ? "-fill" : "";
		const base = suffix ? text.slice(0, -suffix.length) : text;
		return base.replaceAll("-", "_").replaceAll(" ", "_") + suffix;
	},
	// Maps an Iconify-style Material Symbols name to a `folder/file` path.
	// Iconify's convention is that the bare name is the *filled* style; an
	// `-outline` token (before an optional `-rounded`/`-sharp` style token)
	// selects the outlined file. So `home` -> `outlined/home-fill` and
	// `home-outline-rounded` -> `rounded/home`. A redundant `-fill` is accepted
	// as filled. `options.variant` sets the default folder so style-specific
	// presets can omit the suffix.
	symbolsStyle: (name, options) => {
		const text = `${name}`;
		let base = text;
		if (base.endsWith("-fill")) base = base.slice(0, -"-fill".length);
		let folder = options?.variant || "outlined";
		// A trailing `-rounded`/`-sharp` picks the folder, but `-outline` may sit
		// before it (`home-outline-rounded`). Only a trailing token counts, so a
		// name that merely contains `outline` (check-box-outline-blank) survives.
		let outline = false;
		if (base.endsWith("-outline")) {
			outline = true;
			base = base.slice(0, -"-outline".length);
		}
		for (const [suffix, dir] of [
			["-rounded", "rounded"],
			["-sharp", "sharp"],
		]) {
			if (base.endsWith(suffix)) {
				folder = dir;
				base = base.slice(0, -suffix.length);
				if (base.endsWith("-outline")) {
					outline = true;
					base = base.slice(0, -"-outline".length);
				}
				break;
			}
		}
		const suffix = outline ? "" : "-fill";
		return `${folder}/${base.replaceAll("-", "_").replaceAll(" ", "_")}${suffix}`;
	},
	suffixOutline: (name) =>
		name.endsWith("-outline") ? name : `${name}-outline`,
	stripFill: (name) => (name.endsWith("-fill") ? name.slice(0, -5) : name),
	// Iconify's Tabler collection encodes the filled style as a `-filled`
	// suffix while the package stores it in a `filled/` folder.
	tablerStyle: (name, options) => {
		const text = `${name}`;
		const filled = text.endsWith("-filled");
		const base = filled ? text.slice(0, -"-filled".length) : text;
		return `${filled ? "filled" : options?.variant || "outline"}/${base}`;
	},
	// Same idea for Iconoir's `-solid` suffix and `solid/` folder.
	iconoirStyle: (name, options) => {
		const text = `${name}`;
		const solid = text.endsWith("-solid");
		const base = solid ? text.slice(0, -"-solid".length) : text;
		return `${solid ? "solid" : options?.variant || "regular"}/${base}`;
	},
};

// Constant: IconSources
// Built-in source presets. Each URL is pinned so the browser can cache the
// SVG forever. Unknown names do not fall back to a collection download.
const IconSources = {
	lucide: {
		url: `https://cdn.jsdelivr.net/npm/lucide-static@1.50.0/icons/${ICON_NAME}.svg`,
		size: [24, 24],
	},
	iconoir: {
		url: `https://cdn.jsdelivr.net/npm/iconoir@7.12.1/icons/${ICON_NAME}.svg`,
		transform: "iconoirStyle",
		size: [24, 24],
	},
	"eva-outline": {
		url: `https://cdn.jsdelivr.net/npm/eva-icons@1.1.3/outline/svg/${ICON_NAME}.svg`,
		transform: "suffixOutline",
		size: [24, 24],
		style: FillStyle,
	},
	eva: "eva-outline",
	tabler: {
		url: `https://cdn.jsdelivr.net/npm/@tabler/icons@3.48.0/icons/${ICON_NAME}.svg`,
		transform: "tablerStyle",
		size: [24, 24],
	},
	"iconoir-solid": {
		url: `https://cdn.jsdelivr.net/npm/iconoir@7.12.1/icons/${ICON_NAME}.svg`,
		transform: "iconoirStyle",
		variant: "solid",
		size: [24, 24],
	},
	"eva-fill": {
		url: `https://cdn.jsdelivr.net/npm/eva-icons@1.1.3/fill/svg/${ICON_NAME}.svg`,
		transform: "stripFill",
		size: [24, 24],
		style: FillStyle,
	},
	"tabler-filled": {
		url: `https://cdn.jsdelivr.net/npm/@tabler/icons@3.48.0/icons/${ICON_NAME}.svg`,
		transform: "tablerStyle",
		variant: "filled",
		size: [24, 24],
	},
	mdi: {
		url: `https://cdn.jsdelivr.net/npm/@mdi/svg@7.4.47/svg/${ICON_NAME}.svg`,
		size: [24, 24],
		style: FillStyle,
	},
	"material-symbols": {
		url: `https://cdn.jsdelivr.net/npm/@material-symbols/svg-400@0.47.6/${ICON_NAME}.svg`,
		transform: "symbolsStyle",
		size: [48, 48],
		style: FillStyle,
	},
	"material-symbols-outlined": "material-symbols",
	"material-symbols-rounded": {
		url: `https://cdn.jsdelivr.net/npm/@material-symbols/svg-400@0.47.6/${ICON_NAME}.svg`,
		transform: "symbolsStyle",
		variant: "rounded",
		size: [48, 48],
		style: FillStyle,
	},
	"material-symbols-sharp": {
		url: `https://cdn.jsdelivr.net/npm/@material-symbols/svg-400@0.47.6/${ICON_NAME}.svg`,
		transform: "symbolsStyle",
		variant: "sharp",
		size: [48, 48],
		style: FillStyle,
	},
	"material-symbols-light": {
		url: `https://cdn.jsdelivr.net/npm/@material-symbols/svg-200@0.47.6/${ICON_NAME}.svg`,
		transform: "symbolsStyle",
		size: [48, 48],
		style: FillStyle,
	},
	"material-symbols-light-outlined": "material-symbols-light",
	"material-symbols-light-rounded": {
		url: `https://cdn.jsdelivr.net/npm/@material-symbols/svg-200@0.47.6/${ICON_NAME}.svg`,
		transform: "symbolsStyle",
		variant: "rounded",
		size: [48, 48],
		style: FillStyle,
	},
	"material-symbols-light-sharp": {
		url: `https://cdn.jsdelivr.net/npm/@material-symbols/svg-200@0.47.6/${ICON_NAME}.svg`,
		transform: "symbolsStyle",
		variant: "sharp",
		size: [48, 48],
		style: FillStyle,
	},
	"material-icons": {
		url: `https://cdn.jsdelivr.net/npm/@material-design-icons/svg@0.14.15/filled/${ICON_NAME}.svg`,
		transform: "snakecase",
		size: [24, 24],
		style: FillStyle,
	},
	"material-icons-filled": "material-icons",
	"material-icons-outlined": {
		url: `https://cdn.jsdelivr.net/npm/@material-design-icons/svg@0.14.15/outlined/${ICON_NAME}.svg`,
		transform: "snakecase",
		size: [24, 24],
		style: FillStyle,
	},
	"material-icons-round": {
		url: `https://cdn.jsdelivr.net/npm/@material-design-icons/svg@0.14.15/round/${ICON_NAME}.svg`,
		transform: "snakecase",
		size: [24, 24],
		style: FillStyle,
	},
	"material-icons-sharp": {
		url: `https://cdn.jsdelivr.net/npm/@material-design-icons/svg@0.14.15/sharp/${ICON_NAME}.svg`,
		transform: "snakecase",
		size: [24, 24],
		style: FillStyle,
	},
	"material-icons-two-tone": {
		url: `https://cdn.jsdelivr.net/npm/@material-design-icons/svg@0.14.15/two-tone/${ICON_NAME}.svg`,
		transform: "snakecase",
		size: [24, 24],
		style: FillStyle,
	},
	"radix-icons": {
		url: `https://cdn.jsdelivr.net/gh/radix-ui/icons@d166d5ab1669b26d8854f50f8304296d54a7a410/packages/radix-icons/icons/${ICON_NAME}.svg`,
		size: [15, 15],
	},
	ix: {
		url: `https://cdn.jsdelivr.net/npm/@siemens/ix-icons@3.5.0/svg/${ICON_NAME}.svg`,
		size: [512, 512],
		style: FillStyle,
	},
};

// Constant: Cache
// Promise and symbol cache keyed by resolved icon URL.
const Cache = new Map();
// Promise cache keyed by collection URL, scoped to each icon symbol cache.
const CollectionCaches = new WeakMap();

// Function: parseIconName
// Splits `name` into `[iconName, iconSource]`, preserving `source` as the
// fallback when no source prefix is embedded in `name`.
function parseIconName(name, source) {
	if (!name) {
		return [IconDefaults.name, source || IconDefaults.source];
	}
	const i = name.indexOf(":");
	return [
		(i > 0 ? name.substring(i + 1) : name) || IconDefaults.name,
		(i > 0 ? name.substring(0, i) : source) || source || IconDefaults.source,
	];
}

// Function: sourceKey
// Stable id fragment for a source string or a one-off source object.
function sourceKey(source) {
	return typeof source === "string" ? source : `${source ?? "custom"}`;
}

// Function: sourceOptions
// Resolves a source string to a preset, following string aliases. Object
// sources are returned as-is. Unknown names return `undefined` so the loader
// does not fetch a collection.
function sourceOptions(source, seen = new Set()) {
	if (source && typeof source === "object") {
		return source;
	}
	if (typeof source !== "string" || !source || seen.has(source)) {
		return;
	}
	seen.add(source);
	const preset = IconSources[source];
	if (!preset) {
		return;
	}
	return typeof preset === "string" ? sourceOptions(preset, seen) : preset;
}

// Function: resolveFileName
// Applies a preset filename transform. Iconify collections keep the requested
// name so alias resolution can still find it.
function resolveFileName(name, options) {
	const transform = options?.transform;
	if (!transform || options.format === "iconify") {
		return name;
	}
	const fn =
		typeof transform === "function" ? transform : SourceTransforms[transform];
	return fn ? fn(name, options) : name;
}

// Function: paintStyle
// Merges default, preset, and per-call paint. `color` themes `currentColor`
// icons; fill presets override inherited black.
function paintStyle(source, options, extra) {
	return Object.assign(
		{},
		IconDefaults.style,
		options?.style,
		source && typeof source === "object" ? source.style : undefined,
		extra,
	);
}

// Function: register
// Adds `sources` to the shared preset map.
function register(sources) {
	if (!sources || typeof sources !== "object") {
		return IconSources;
	}
	for (const key of Object.keys(sources)) {
		if (key === "__proto__" || key === "constructor" || key === "prototype") {
			continue;
		}
		IconSources[key] = sources[key];
	}
	return IconSources;
}

// Function: iconifyIcon
// Resolves `name`, including any Iconify alias transformations.
function iconifyIcon(data, name, seen = new Set()) {
	if (seen.has(name)) {
		return;
	}
	seen.add(name);
	const defaults = {
		left: data.left || 0,
		top: data.top || 0,
		width: data.width || 16,
		height: data.height || 16,
		rotate: data.rotate || 0,
		hFlip: data.hFlip || false,
		vFlip: data.vFlip || false,
	};
	const icon = data.icons?.[name];
	if (icon) {
		return Object.assign(defaults, icon);
	}
	const alias = data.aliases?.[name];
	if (!alias?.parent) {
		return;
	}
	const parent = iconifyIcon(data, alias.parent, seen);
	if (!parent) {
		return;
	}
	return Object.assign({}, parent, alias, {
		body: parent.body,
		hFlip: Boolean(parent.hFlip) !== Boolean(alias.hFlip),
		vFlip: Boolean(parent.vFlip) !== Boolean(alias.vFlip),
		rotate: ((parent.rotate || 0) + (alias.rotate || 0)) % 4,
	});
}

// Function: iconifySvg
// Wraps resolved Iconify JSON icon data in SVG markup for sanitization.
function iconifySvg(data, name) {
	const icon = iconifyIcon(data, name);
	if (!icon?.body) {
		throw new Error(
			`Could not find icon "${name}" in Iconify collection "${data.prefix}"`,
		);
	}
	const left = icon.left || 0;
	const top = icon.top || 0;
	const width = icon.width || 16;
	const height = icon.height || 16;
	const rotate = (icon.rotate || 0) % 4;
	const cx = left + width / 2;
	const cy = top + height / 2;
	const viewBox =
		rotate % 2
			? `${cx - height / 2} ${cy - width / 2} ${height} ${width}`
			: `${left} ${top} ${width} ${height}`;
	const transform = `translate(${cx} ${cy}) rotate(${rotate * 90}) scale(${icon.hFlip ? -1 : 1} ${icon.vFlip ? -1 : 1}) translate(${-cx} ${-cy})`;
	return `<svg viewBox="${viewBox}"><g transform="${transform}">${icon.body}</g></svg>`;
}

function isLocalSvgReference(value) {
	const text = `${value || ""}`.trim();
	if (!text) {
		return false;
	}
	if (text[0] === "#") {
		return true;
	}
	if (text.startsWith("url(")) {
		const inner = text.substring(4, text.length - 1).trim();
		const quote = inner[0];
		const ref =
			(quote === '"' || quote === "'") && inner[inner.length - 1] === quote
				? inner.substring(1, inner.length - 1).trim()
				: inner;
		return ref[0] === "#";
	}
	return false;
}

function isSafeSvgAttribute(name, value) {
	const key = name.toLowerCase();
	if (key.startsWith("on") || !SVG_ALLOWED_ATTRS.has(key)) {
		return false;
	}
	if (key === "href" || key === "xlink:href") {
		return isLocalSvgReference(value);
	}
	if (
		(key === "fill" ||
			key === "stroke" ||
			key === "clip-path" ||
			key === "mask") &&
		`${value || ""}`.includes("url(")
	) {
		return isLocalSvgReference(value);
	}
	return true;
}

function sanitizeSvgNode(node) {
	if (!node || node.nodeType !== Node.ELEMENT_NODE) {
		return null;
	}
	const tagName = node.tagName.toLowerCase();
	if (!SVG_ALLOWED_TAGS.has(tagName)) {
		return null;
	}
	const result = document.createElementNS(SVG, node.tagName);
	for (const attr of Array.from(node.attributes || [])) {
		if (isSafeSvgAttribute(attr.name, attr.value)) {
			result.setAttribute(attr.name, attr.value);
		}
	}
	for (const child of Array.from(node.childNodes || [])) {
		if (child.nodeType === Node.ELEMENT_NODE) {
			const sanitized = sanitizeSvgNode(child);
			if (sanitized) {
				result.appendChild(sanitized);
			}
		} else if (child.nodeType === Node.TEXT_NODE) {
			result.appendChild(document.createTextNode(child.textContent || ""));
		}
	}
	return result;
}

function sanitizeSvgMarkup(text, name) {
	// Some icons have extra information, like XML PI, comments, doctype.
	// SEE: https://unpkg.com/devicons@1.8.0/!SVG/python.svg
	const i = text.indexOf("<svg");
	if (i < 0) {
		throw new Error(`Could not find <svg> in icon "${name}", got: ${text}`);
	}
	const doc = new DOMParser().parseFromString(
		text.substring(i),
		"image/svg+xml",
	);
	const svg = doc.documentElement;
	if (svg?.tagName.toLowerCase() !== "svg") {
		throw new Error(`Could not parse <svg> in icon "${name}"`);
	}
	return sanitizeSvgNode(svg);
}

// Function: resolve
// Resolves `name`/`source` to the icon location without fetching it. Returns
// `undefined` when the source is unknown or the name has no transform result.
// Useful for diagnostics and tooling.
function resolve(name = IconDefaults.name, source = IconDefaults.source) {
	const [iconName, iconSource] = parseIconName(name, source);
	const options = sourceOptions(iconSource);
	if (!options?.url) {
		return;
	}
	const fileName = resolveFileName(iconName, options);
	if (!fileName) {
		return;
	}
	const url = options.url
		.replace(ICON_NAME, fileName)
		.replace(ICON_SOURCE, typeof iconSource === "string" ? iconSource : "");
	return {
		name: iconName,
		source: iconSource,
		options,
		fileName,
		format: options.format || "svg",
		url,
	};
}

// Function: load
// Loads the SVG symbol for `name` from `source`, appends it to `container`,
// and returns a promise for the created `<symbol>`.
function load(
	name = IconDefaults.name,
	source = IconDefaults.source,
	container = IconContainer,
	cache = Cache,
) {
	const resolved = resolve(name, source);
	if (!resolved) {
		log.warn("icons.load: unknown icon source, details", { name, source });
		return Promise.resolve();
	}
	[name, source] = [resolved.name, resolved.source];
	const { options, format, url } = resolved;
	const id = `icon-${name}-${sourceKey(source)}`;
	const cacheKey = format === "iconify" ? `${url}#${name}` : `${url}#${id}`;
	const entry = cache.get(cacheKey);
	if (entry?.status === "pending") {
		return entry.promise;
	} else if (entry?.status === "success") {
		return Promise.resolve(entry.value);
	} else if (
		entry?.status === "failure" &&
		(entry.attempts > ICON_RETRY_DELAYS.length || Date.now() < entry.retryAt)
	) {
		return Promise.resolve();
	} else {
		const symbol = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"symbol",
		);
		symbol.id = id;
		container.appendChild(symbol);
		const attempts = (entry?.attempts || 0) + 1;
		let collections = CollectionCaches.get(cache);
		if (!collections) {
			collections = new Map();
			CollectionCaches.set(cache, collections);
		}
		const collection = collections.get(url);
		const request =
			format === "iconify" && collection
				? collection
				: fetch(url).then((response) => {
						if (response.ok === false) {
							throw new Error(
								`Icon request failed with status ${response.status}`,
							);
						}
						return format === "iconify" ? response.json() : response.text();
					});
		if (format === "iconify" && !collection) {
			collections.set(url, request);
			request.catch(() => collections.delete(url));
		}
		const res = request
			.then((data) => (format === "iconify" ? iconifySvg(data, name) : data))
			.then((text) => {
				const icon = sanitizeSvgMarkup(text, name);
				if (icon) {
					symbol.replaceChildren(icon);
				}
				if (!icon?.attributes) {
					log.error("icons.load: icon should have content, details", {
						name,
						text,
					});
				}
				for (const [k, v] of Object.entries(paintStyle(source, options))) {
					if (icon && isSafeSvgAttribute(k, `${v}`)) {
						icon.setAttribute(k, `${v}`);
					}
				}
				if (!container.parentElement) {
					document.body.appendChild(container);
				}
				cache.set(cacheKey, { status: "success", attempts, value: symbol });
				return symbol;
			})
			.catch((reason) => {
				cache.set(cacheKey, {
					status: "failure",
					attempts,
					retryAt: Date.now() + (ICON_RETRY_DELAYS[attempts - 1] || 0),
				});
				if (!symbol.firstChild && symbol.parentNode === container) {
					container.removeChild(symbol);
				}
				log.warn(`icons.load: could not load icon from <${url}>, details`, {
					name,
					reason,
					symbol,
				});
			});
		cache.set(cacheKey, { status: "pending", attempts, promise: res });
		return res;
	}
}

// Function: icon
// Creates an SVG element for `name` using `source`. Returns either an inline
// node or a `<svg><use/></svg>` reference depending on `mode`.
function icon(
	name = IconDefaults.name,
	source = IconDefaults.source,
	{
		size = "1em",
		className = "icon",
		container = IconContainer,
		mode = undefined,
		style = {},
	},
) {
	const [parsedName, parsedSource] = parseIconName(name, source);
	style = paintStyle(parsedSource, sourceOptions(parsedSource), style);
	const node = Object.entries({ width: size, height: size }).reduce(
		(r, [k, v], i) => {
			r.setAttribute(k, Array.isArray(v) ? v[i] : v);
			return r;
		},
		document.createElementNS(SVG, "svg"),
	);
	const icon = load(name, source, container).then((symbol) => {
		if (!symbol) {
			log.warn("icons.icon: icon missing from source, details", {
				name,
				source,
			});
		} else {
			["viewBox"].forEach((_) => {
				const icon = symbol.firstChild;
				if (icon?.getAttribute) {
					const viewBox = icon.getAttribute("viewBox");
					if (viewBox) {
						node.setAttribute("viewBox", viewBox);
					}
				} else {
					log.warn("icons.icon: could not load icon viewBox, details", {
						symbol,
						name,
						source,
					});
				}
			});
		}
		return symbol;
	});
	const classes = classTokens(className);
	switch (mode) {
		// We support an inline mode, which is necessary for web components.
		case "inline":
			// A baseline-aligned SVG adds descent space to its line box. That makes
			// the glyph sit high when its host is centered in a flex or grid row.
			node.style.display = "block";
			Object.assign(node.style, style);
			classes.forEach((_) => {
				node.classList.add(_);
			});
			icon.then((symbol) => {
				if (!symbol) {
					node.classList.add("missing");
				} else {
					const svg = symbol.children[0];
					if (!svg) {
						// FIXME: Not sure why this happens
						return;
					}
					for (const attr of Array.from(svg.attributes)) {
						if (!node.hasAttribute(attr.name)) {
							node.setAttribute(attr.name, attr.value);
						}
					}
					for (const child of svg.children) {
						node.appendChild(child.cloneNode(true));
					}
				}
				node.classList.remove("loading");
			});
			return node;
		default: {
			const use = document.createElementNS(SVG, "use");
			use.classList.forEach((_) => {
				node.classList.add(_);
			});
			Object.assign(node.style, style);
			use.setAttribute(
				"href",
				`#icon-${parsedName}-${sourceKey(parsedSource)}`,
			);
			node.appendChild(use);
			return node;
		}
	}
}

// Function: px
// Normalizes numeric size strings to CSS pixel values.
function px(value) {
	return value && /^\d+$/.test(value) ? `${value}px` : value;
}

// Class: IconElement
// Custom element that renders an icon from the shared registry.
class IconElement extends HTMLElement {
	static observedAttributes = [
		"name",
		"source",
		"size",
		"icon",
		"dy",
		"fill",
		"stroke",
		"stroke-width",
	];

	constructor() {
		super();
		this.attachShadow({ mode: "open" });
	}

	connectedCallback() {
		this.render();
	}

	attributeChangedCallback(_name, _oldValue, newValue) {
		if (newValue !== null) {
			this.render();
		}
	}

	render() {
		const [name, source] = parseIconName(
			this.getAttribute("icon") || this.getAttribute("name"),
			this.getAttribute("source"),
		);
		const className = this.getAttribute("class") || "icon";
		const size = this.getAttribute("size") || "1em";
		const fill = this.getAttribute("fill");
		const stroke = this.getAttribute("stroke");
		const dy = this.getAttribute("dy");
		const stroke_width = px(this.getAttribute("stroke-width"));
		const style = {};
		if (fill) style.fill = fill;
		if (stroke) style.stroke = stroke;
		if (stroke_width) style["stroke-width"] = stroke_width;
		if (dy) {
			style.transform = `translateY(${px(dy)})`;
		}
		// Remove old icon if exists
		this.icon?.parentNode?.removeChild(this.icon);

		// Create and append new icon
		this.icon = icon(name, source, {
			mode: "inline",
			size,
			className,
			style,
		});

		if (this.shadowRoot) {
			this.shadowRoot.appendChild(this.icon);
		}
	}
}

// Function: install
// Registers the icon custom element under `name` and applies `options` to the
// shared icon defaults.
function install(name = "ui-icon", options = {}) {
	const { sources, ...rest } = options;
	if (sources) {
		register(sources);
	}
	Object.assign(IconDefaults, rest);
	// Register the custom element
	if (!customElements.get(name)) {
		// The custom-elements registry does not allow the same constructor under
		// multiple names. Keep the implementation shared, but give each tag its
		// own constructor identity.
		const Element = class extends IconElement {};
		customElements.define(name, Element);
	}
}

export {
	Cache,
	IconContainer,
	IconSources,
	icon,
	install,
	load,
	register,
	resolve,
};
export default Object.assign(icon, {
	load,
	install,
	register,
	resolve,
	container: IconContainer,
	sources: IconSources,
});
// EOF
