// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-04-23
// Updated: 2026-06-02

// Module: select/icons
// SVG icon registry and loader utilities.
// SEE: https://observablehq.com/@sebastien/icons
import { logger } from "./utils.js";

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
const SVG_ALLOWED_ATTRS = new Set([
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
].map((_) => _.toLowerCase()));
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
	url: `https://api.iconify.design/${ICON_SOURCE}/${ICON_NAME}.svg`,
	name: "file-question-mark",
	source: "lucide",
	size: [24, 24],
	style: {
		stroke: "var(--color-icon,var(--color-text),currentColor)",
		"stroke-width": "1.5px",
		"vector-effect": "non-scaling-stroke",
		fill: "none",
	},
};

// Constant: IconSources
// Built-in source presets for common icon packs.
const IconSources = {
	devicons: {
		size: [32, 32],
	},
	"eva-outline": {
		style: {
			stroke: "transparent",
			fill: IconDefaults.style.stroke,
		},
	},
	"eva-fill": {
		style: { stroke: "transparent", fill: IconDefaults.style.stroke },
	},
	lucide: {
		style: { stroke: "transparent", fill: IconDefaults.style.stroke },
	},
};

// Constant: Cache
// Promise and symbol cache keyed by resolved icon URL.
const Cache = new Map();

// Function: parseIconName
// Splits `name` into `[iconName, iconSource]`, preserving `source` as the
// fallback when no source prefix is embedded in `name`.
function parseIconName(name, source) {
	if (!name) {
		console.error("icons.parseIconName: missing icon name, details", {
			name,
			source,
		});
		return [IconDefaults.name, source || IconDefaults.source];
	}
	const i = name.indexOf(":");
	return [
		(i > 0 ? name.substring(i + 1) : name) || IconDefaults.name,
		(i > 0 ? name.substring(0, i) : source) || source || IconDefaults.source,
	];
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
	const doc = new DOMParser().parseFromString(text.substring(i), "image/svg+xml");
	const svg = doc.documentElement;
	if (svg?.tagName.toLowerCase() !== "svg") {
		throw new Error(`Could not parse <svg> in icon "${name}"`);
	}
	return sanitizeSvgNode(svg);
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
	[name, source] = parseIconName(name, source);
	const url = (source?.url || IconSources[source]?.url || IconDefaults.url)
		.replace(ICON_NAME, name)
		.replace(ICON_SOURCE, source);
	const entry = cache.get(url);
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
		symbol.id = `icon-${name}-${source}`;
		container.appendChild(symbol);
		const attempts = (entry?.attempts || 0) + 1;
		const res = fetch(url)
			.then((_) => _.text())
			.then((text) => {
				const icon = sanitizeSvgMarkup(text, name);
				if (icon) {
					symbol.replaceChildren(icon);
				}
				// TODO: Typically the main SVG node has `width`, `height` and
				// `viewBox`, which we should use to get the ideal size.
				if (icon?.attributes) {
					["stroke-width", "fill", "stroke"].forEach((_) => {
						if (icon.hasAttribute(_)) {
							icon.setAttribute(_, "");
						}
					});
				} else {
					log.error("icons.load: icon should have content, details", {
						name,
						text,
					});
				}
				for (const [k, v] of Object.entries(source.style ?? {})) {
					if (icon && isSafeSvgAttribute(k, `${v}`)) {
						icon.setAttribute(k, `${v}`);
					}
				}
				if (!container.parentElement) {
					document.body.appendChild(container);
				}
				cache.set(url, { status: "success", attempts, value: symbol });
				return symbol;
			})
			.catch((reason) => {
				cache.set(url, {
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
		cache.set(url, { status: "pending", attempts, promise: res });
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
	style = Object.assign({}, IconDefaults.style, source?.style, style);
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
	const classes = (className || "")
		.trim()
		.split(" ")
		.map((_) => _.trim())
		.filter((_) => _.length);
	switch (mode) {
		// We support an inline mode, which is necessary for web components.
		case "inline":
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
			use.setAttribute("href", `#icon-${name}-${source}`);
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
		fill && (style.fill = fill);
		stroke && (style.stroke = stroke);
		stroke_width && (style["stroke-width"] = stroke_width);
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
	Object.assign(IconDefaults, options);
	// Register the custom element
	if (!customElements.get(name)) {
		customElements.define(name, IconElement);
	}
}

export { icon, install, load, Cache, IconContainer, IconSources };
export default Object.assign(icon, {
	load,
	install,
	container: IconContainer,
	sources: IconSources,
});
// EOF
