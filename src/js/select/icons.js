// Project: Select.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2024-01-01

// Module: select/icons
// SVG icon registry and loader utilities.
// SEE: https://observablehq.com/@sebastien/icons
import { logger } from "./utils.js";

const SVG = "http://www.w3.org/2000/svg";
const log = logger("select.icons");
const ICON_NAME = "__ICON_NAME__";
const ICON_SOURCE = "__ICON_SOURCE__";
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
	source: undefined,
	style: {
		stroke: "var(--color-icon,currentColor)",
		"stroke-width": "1.5px",
		"vector-effect": "non-scaling-stroke",
		fill: "none",
	},
};

const IconSources = {
	devicons: {
		url: `https://unpkg.com/devicons@1.8.0/!SVG/${ICON_NAME}.svg`,
		size: [32, 32],
		style: {
			stroke: "transparent",
			fill: "var(--color-icon)",
		},
	},
	iconoir: {
		url: `https://unpkg.com/iconoir@7.8.0/icons/regular/${ICON_NAME}.svg`,
		size: [24, 24],
		style: {
			fill: "none",
			stroke: "var(--color-icon)",
			"stroke-width": "1.5px",
			"vector-effect": "non-scaling-stroke",
		},
	},
	"iconoir-solid": {
		url: `https://unpkg.com/iconoir@7.0.2/icons/solid/${ICON_NAME}.svg`,
		size: [24, 24],
		style: {
			fill: "none",
			stroke: "var(--color-icon)",
			"stroke-width": "1.5px",
			"vector-effect": "non-scaling-stroke",
		},
	},
	"eva-outline": {
		url: `https://unpkg.com/eva-icons@1.1.3/outline/svg/${ICON_NAME}.svg`,
		style: { stroke: "transparent", fill: "var(--color-icon)" },
	},
	"eva-fill": {
		url: `https://unpkg.com/eva-icons@1.1.3/fill/svg/${ICON_NAME}.svg`,
		style: { stroke: "transparent", fill: "var(--color-icon)" },
	},
	// SEE: https://lucide.dev/guide/packages/lucide-static
	lucide: {
		url: `https://unpkg.com/lucide-static@0.441.0/icons/${ICON_NAME}.svg`,
		style: { stroke: "transparent", fill: "var(--color-icon)" },
	},
};

const Cache = new Map();

function parseIconName(name, source) {
	const i = name.indexOf(":");
	return [
		(i > 0 ? name.substring(i + 1) : name) || IconDefaults.name,
		(i > 0 ? name.substring(0, i) : source) || source | IconDefaults.source,
	];
}

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
	if (cache.has(url)) {
		return Promise.resolve(cache.get(url));
	} else {
		const symbol = document.createElementNS(
			"http://www.w3.org/2000/svg",
			"symbol",
		);
		symbol.id = `icon-${name}-${source}`;
		container.appendChild(symbol);
		const res = fetch(url)
			.then((_) => _.text())
			.then((text) => {
				// Some icons have extra information, like XML PI, comments, doctype.
				// SEE: https://unpkg.com/devicons@1.8.0/!SVG/python.svg
				const i = text.indexOf("<svg");
				if (i < 0) {
					throw new Error(
						`Could not find <svg> in icon "${name}", got: ${text}`,
					);
				}
				symbol.innerHTML = text.substring(i);
				const icon = symbol.firstChild;
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
				Object.entries(source.style ?? {}).forEach(([k, v]) => {
					icon.setAttribute(k, `${v}`);
				});
				if (!container.parentElement) {
					document.body.appendChild(container);
				}
				cache.set(url, symbol);
				return symbol;
			})
			.catch((reason) => {
				log.warn(`icons.load: could not load icon from <${url}>, details`, {
					name,
					reason,
					symbol,
				});
			});
		cache.set(url, res);
		return res;
	}
}

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
		(r, [k, v]) => {
			r.setAttribute(k, v);
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
			classes.forEach((_) => node.classList.add(_));
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
			use.classList.forEach((_) => node.classList.add(_));
			Object.assign(node.style, style);
			use.setAttribute("href", `#icon-${name}-${source}`);
			node.appendChild(use);
			return node;
		}
	}
}

function px(value) {
	return value && /^\d+$/.test(value) ? `${value}px` : value;
}

// Define the custom element class inline
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
		const size = px(this.getAttribute("size") || IconDefaults.size);
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
