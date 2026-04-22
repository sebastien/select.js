// Project: ui.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2024-01-01
// See: https://icones.js.org/

// Module: features/icons
// Provides a flexible, CDN-based icon loading system supporting multiple icon
// libraries with automatic caching and two rendering modes: <use> references
// (default) and inline SVG content for Web Components.
//
// Example:
// ```javascript
// import { icon, IconSources, install } from "littleui/features/icons";
//
// // Basic usage
// const settingsIcon = icon("settings");
//
// // With specific source
// const homeIcon = icon("home", { source: IconSources.lucide });
//
// // Register web component
// install("ui-icon");
// ```
//
// Then in HTML:
// ```html
// <ui-icon name="home"></ui-icon>
// <ui-icon name="check" size="2em" source="Iconoir"></ui-icon>
// ```

// Constant: SVG_NAMESPACE
// The SVG XML namespace URI.
const SVG_NAMESPACE = "http://www.w3.org/2000/svg";

// Constant: DEFAULT_SOURCE_NAME
// The default icon source key used when no explicit source is provided.
const DEFAULT_SOURCE_NAME = "iconoir";

// Constant: ICON_NAME_TOKEN
// Placeholder replaced with the requested icon name in source URLs.
const ICON_NAME_TOKEN = "__ICON_NAME__";

// Constant: ICON_COLLECTIONS_URL
// CDN endpoint returning all Iconify collections metadata.
const ICON_COLLECTIONS_URL = "https://api.iconify.design/collections";

// Constant: DEFAULT_ICON_STYLE
// Baseline style for icons when sources do not define one.
const DEFAULT_ICON_STYLE = {
	color: "var(--color-icon, currentColor)",
};

// ----------------------------------------------------------------------------
// SECTION: Icon Sources
// ----------------------------------------------------------------------------

/**
 * Named icon-name transforms configured from source metadata.
 *
 * @type {Object.<string, (name:string)=>string>}
 */
const SourceTransforms = {
	identity: (name) => name,
	kebabcase: (name) => `${name}`.replaceAll("_", "-").replaceAll(" ", "-"),
	snakecase: (name) => `${name}`.replaceAll("-", "_").replaceAll(" ", "_"),
	suffixOutline: (name) =>
		name.endsWith("-outline") ? name : `${name}-outline`,
	suffixFill: (name) => (name.endsWith("-fill") ? name : `${name}-fill`),
	suffixSolid: (name) => (name.endsWith("-solid") ? name : `${name}-solid`),
};

/**
 * Backward-compatible source aliases and metadata tweaks.
 *
 * @type {Object.<string, IconSource>}
 */
const BaseIconSources = {
	iconoir: {
		url: `https://api.iconify.design/iconoir/${ICON_NAME_TOKEN}.svg`,
		size: [24, 24],
	},
	devicons: {
		url: `https://api.iconify.design/devicon/${ICON_NAME_TOKEN}.svg`,
	},
	iconoirsolid: {
		url: `https://api.iconify.design/iconoir/${ICON_NAME_TOKEN}.svg`,
		transform: "suffixSolid",
	},
	evaoutline: {
		url: `https://api.iconify.design/eva/${ICON_NAME_TOKEN}.svg`,
		transform: "suffixOutline",
	},
	evafill: {
		url: `https://api.iconify.design/eva/${ICON_NAME_TOKEN}.svg`,
		transform: "suffixFill",
	},
	fluent: {
		url: `https://api.iconify.design/fluent/${ICON_NAME_TOKEN}.svg`,
	},
	radix: {
		url: `https://api.iconify.design/radix-icons/${ICON_NAME_TOKEN}.svg`,
	},
};

/**
 * Preconfigured CDN sources for icon libraries listed by Icônes/Iconify.
 *
 * @type {Object.<string, IconSource>}
 */
const IconSources = Object.assign({}, BaseIconSources);

/**
 * Pending source catalog loading promise.
 *
 * @type {Promise<Object.<string, IconSource>>|null}
 */
let SourceCatalogPromise = null;

/**
 * Optional source catalog input configured through install options.
 *
 * @type {Object|string|undefined}
 */
let SourceCatalogInput;

// ----------------------------------------------------------------------------
// SECTION: Storage
// ----------------------------------------------------------------------------

/**
 * Hidden SVG container that holds all loaded icon symbols.
 *
 * @type {SVGSVGElement}
 */
const IconsContainer = Object.entries({
	width: "0",
	height: "0",
	viewBox: "0 0 0 0",
	style: "position:absolute; width:0; height:0; overflow:hidden;",
}).reduce(
	(r, [k, v]) => {
		r.setAttribute(k, v);
		return r;
	},
	document.createElementNS(SVG_NAMESPACE, "svg"),
);

/**
 * Global cache mapping icon URLs to loaded SVG symbols or promises.
 *
 * @type {Map<string, SVGSymbolElement|Promise<SVGSymbolElement|undefined>>}
 */
const Cache = new Map();

// ----------------------------------------------------------------------------
// SECTION: Internal Functions
// ----------------------------------------------------------------------------

/**
 * Normalizes Iconify collections payload to Select.js source entries.
 *
 * @param {Object} collections - Iconify collections payload
 * @returns {Object.<string, IconSource>} Normalized icon sources
 */
function normalizeCollections(collections) {
	const normalized = {};
	for (const prefix in collections) {
		const meta = collections[prefix];
		if (!meta || typeof meta !== "object") {
			continue;
		}
		const entry = {
			url: `https://api.iconify.design/${prefix}/${ICON_NAME_TOKEN}.svg`,
			collectionVersion: meta.version || "latest",
		};
		if (typeof meta.height === "number" && meta.height > 0) {
			entry.size = [meta.height, meta.height];
		}
		normalized[prefix.toLowerCase()] = entry;
	}
	return normalized;
}

/**
 * Resolves icon source entries from provided input or from the default CDN.
 *
 * @param {Object|string|undefined} input - Source catalog input
 * @returns {Promise<Object.<string, IconSource>>} Resolved source map
 */
async function resolveSourceCatalog(input) {
	let payload = input;
	if (!payload) {
		payload = ICON_COLLECTIONS_URL;
	}

	if (typeof payload === "string") {
		const response = await fetch(payload);
		payload = await response.json();
	}

	if (!payload || typeof payload !== "object") {
		return {};
	}

	if (payload.sources && typeof payload.sources === "object") {
		return payload.sources;
	}

	return normalizeCollections(payload);
}

/**
 * Ensures IconSources include all available Iconify collections.
 *
 * @param {Object|string|undefined} input - Optional source catalog input
 * @returns {Promise<Object.<string, IconSource>>} Updated source map
 */
function ensureSourceCatalog(input = SourceCatalogInput) {
	if (!SourceCatalogPromise) {
		SourceCatalogPromise = resolveSourceCatalog(input)
			.then((sources) => {
				for (const key in sources) {
					IconSources[key.toLowerCase()] = sources[key];
				}
				for (const key in BaseIconSources) {
					IconSources[key] = BaseIconSources[key];
				}
				return IconSources;
			})
			.catch((error) => {
				console.warn("icons", "Could not load icon source catalog", error);
				return IconSources;
			});
	}
	return SourceCatalogPromise;
}

/**
 * Updates source catalog input and resets loading state.
 *
 * @param {Object|string|undefined} input - Source catalog input
 */
function configureSourceCatalog(input) {
	SourceCatalogInput = input;
	SourceCatalogPromise = null;
}

/**
 * Resolves `source` to its canonical source key using `sources`.
 *
 * @param {IconSource|string} source - The source to resolve
 * @param {Object.<string, IconSource>} [sources=IconSources] - Available sources
 * @returns {string} The canonical source key
 */
function sourceName(source, sources = IconSources) {
	if (typeof source === "string") {
		return source.toLowerCase();
	}

	const key = source;
	let result = "generic";
	for (const k in sources) {
		if (key === k) {
			result = k;
			break;
		} else if (key === sources[k]) {
			result = k;
			break;
		} else if (sources[k].url === key) {
			result = k;
			break;
		}
	}
	return result.toLowerCase();
}

/**
 * Resolves `source` to a registered source object, falling back to the default
 * source when a string key is unknown.
 *
 * @param {IconSource|string} source - The source to resolve
 * @returns {IconSource} The resolved source
 */
function resolveSource(source) {
	if (typeof source !== "string") {
		return source;
	}

	const key = source.toLowerCase();
	return IconSources[key] || IconSources[DEFAULT_SOURCE_NAME];
}

/**
 * Resolves a transform function from a source transform descriptor.
 *
 * @param {((name:string)=>string)|string|undefined} transform - Transform descriptor
 * @returns {(name:string)=>string} A transform function
 */
function resolveTransform(transform) {
	if (typeof transform === "function") {
		return transform;
	}

	if (typeof transform === "string") {
		return SourceTransforms[transform] || SourceTransforms.identity;
	}

	return SourceTransforms.identity;
}

/**
 * Fetches an icon from a CDN source and caches it as a symbol.
 *
 * @param {string} name - The icon name
 * @param {IconSource|string} [source=DEFAULT_SOURCE_NAME] - The icon source
 * @param {SVGSVGElement} [container=IconsContainer] - Container for caching
 * @param {Map<string, SVGSymbolElement|Promise<SVGSymbolElement|undefined>>} [cache=Cache] - Cache
 * @returns {Promise<SVGSymbolElement|undefined>} The loaded symbol
 */
function loadIcon(
	name,
	source = DEFAULT_SOURCE_NAME,
	container = IconsContainer,
	cache = Cache,
) {
	const res = ensureSourceCatalog(SourceCatalogInput).then(() => {
		const resolvedSource = resolveSource(source);

		const sourceId = sourceName(source);
		const iconId = `icon-${name}-${sourceId}`;
		const iconName = resolveTransform(resolvedSource.transform)(name);
		const url = resolvedSource.url.replace(ICON_NAME_TOKEN, iconName);

		const cached = cache.get(url);
		if (cached instanceof Promise) {
			return cached;
		} else if (cached) {
			return Promise.resolve(cached);
		}

		const symbol = document.createElementNS(SVG_NAMESPACE, "symbol");
		symbol.id = iconId;
		container.appendChild(symbol);

		const iconRes = fetch(url)
			.then((response) => {
				if (!response.ok) {
					throw new Error(`HTTP ${response.status}`);
				}
				return response.text();
			})
			.then((text) => {
				const svgStart = text.indexOf("<svg");
				if (svgStart < 0) {
					throw new Error("SVG tag not found");
				}
				symbol.innerHTML = text.substring(svgStart);
				const icon = symbol.firstChild;
				if (!icon || `${icon.nodeName}`.toLowerCase() !== "svg") {
					throw new Error("Invalid SVG payload");
				}

				if (icon.attributes) {
					["stroke-width", "fill", "stroke"].forEach((attr) => {
						if (icon.hasAttribute(attr)) {
							icon.removeAttribute(attr);
						}
					});
				}

				if (resolvedSource?.style) {
					Object.entries(resolvedSource.style).forEach(([k, v]) => {
						icon?.setAttribute(k, `${v}`);
					});
				}

				if (!container.parentElement) {
					document.body.appendChild(container);
				}

				cache.set(url, symbol);
				return symbol;
			})
			.catch((reason) => {
				symbol.parentNode?.removeChild(symbol);
				console.warn(
					"icons",
					`Could not load icon "${name}" from <${url}>: ${reason}`,
					symbol,
				);
				return undefined;
			});

		cache.set(url, iconRes);
		return iconRes;
	});

	return res;
}

// ----------------------------------------------------------------------------
// SECTION: Public API
// ----------------------------------------------------------------------------

/**
 * Creates an SVG element referencing a loaded icon.
 *
 * @param {string} name - The icon name
 * @param {IconOptions} [options={}] - Options for creating the icon
 * @returns {SVGSVGElement} The created SVG element
 */
function icon(name, options = {}) {
	const {
		size = "1em",
		className = "icon",
		source = DEFAULT_SOURCE_NAME,
		container = IconsContainer,
		mode = undefined,
		style: customStyle = {},
	} = options;

	const resolvedSource = resolveSource(source);
	const mergedStyle = Object.assign(
		{},
		DEFAULT_ICON_STYLE,
		resolvedSource?.style,
		customStyle,
	);

	const node = Object.entries({
		width: size,
		height: size,
	}).reduce(
		(r, [k, v]) => {
			r.setAttribute(k, v);
			return r;
		},
		document.createElementNS(SVG_NAMESPACE, "svg"),
	);

	const iconPromise = loadIcon(name, source, container).then((symbol) => {
		if (!symbol) {
			console.warn("icons", "Icon missing from source", { name, source });
		} else {
			// Copy viewBox from symbol's first child
			const iconSvg = symbol.firstChild;
			if (iconSvg?.getAttribute) {
				const viewBox = iconSvg.getAttribute("viewBox");
				if (viewBox) {
					node.setAttribute("viewBox", viewBox);
				}
			} else {
				console.warn("icons", `Could not load icon "${name}", got:`, symbol);
			}
		}
		return symbol;
	});

	switch (mode) {
		case "inline":
			Object.assign(node.style, mergedStyle);
			node.classList.add(className);
			node.classList.add("loading");
			iconPromise.then((symbol) => {
				if (!symbol) return;
				const svg = symbol.children[0];
				if (!svg) return;

				// Copy attributes
				for (const attr of Array.from(svg.attributes)) {
					if (!node.hasAttribute(attr.name)) {
						node.setAttribute(attr.name, attr.value);
					}
				}

				// Copy children
				for (const child of Array.from(svg.children)) {
					node.appendChild(child.cloneNode(true));
				}

				node.classList.remove("loading");
			});
			return node;
		default: {
			const use = document.createElementNS(SVG_NAMESPACE, "use");
			use.classList.add(className);
			Object.assign(node.style, mergedStyle);
			use.setAttribute("href", `#icon-${name}-${sourceName(source)}`);
			node.appendChild(use);
			return node;
		}
	}
}

/**
 * Batch loading placeholder (not implemented).
 *
 * @param {Array<{name: string, source?: IconSource|string}>} icons - Icons to load
 */
function loadIcons(icons) {
	console.warn("loadIcons not implemented", { icons });
}

// ----------------------------------------------------------------------------
// SECTION: Web Components
// ----------------------------------------------------------------------------

/**
 * Registers a <ui-icon> web component using native custom elements.
 * The web component supports `name`, `source`, `size`, and `icon`
 * attributes. Numeric `size` values are converted to pixel units.
 * Option `sources` can be a URL, a `{sources: ...}` JSON object, or
 * an Iconify collections object.
 *
 * @param {string} [name="ui-icon"] - The custom element name
 * @param {InstallOptions} [options={}] - Installation options
 */
function install(name = "ui-icon", options = {}) {
	const {
		source = DEFAULT_SOURCE_NAME,
		size = "1em",
		className = "icon",
		sources = undefined,
	} = options;

	if (sources !== undefined) {
		configureSourceCatalog(sources);
	}

	ensureSourceCatalog(SourceCatalogInput);

	// Define the custom element class inline
	class IconElement extends HTMLElement {
		static observedAttributes = ["name", "source", "size", "icon"];
		iconNode = null;

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
			// Check for explicit source/name attributes first
			let iconName = this.getAttribute("name");
			let sourceName = this.getAttribute("source")?.toLowerCase();

			// If no explicit name/source, try parsing the "icon" attribute
			if (!iconName && !sourceName) {
				const iconAttr = this.getAttribute("icon");
				if (iconAttr) {
					// Parse "source:name" format
					const colonIndex = iconAttr.indexOf(":");
					if (colonIndex > 0) {
						sourceName = iconAttr.substring(0, colonIndex).toLowerCase();
						iconName = iconAttr.substring(colonIndex + 1);
					} else {
						// Just a name, no source specified
						iconName = iconAttr;
					}
				}
			}

			// Apply defaults
			iconName = iconName || "star";
			let iconSize = this.getAttribute("size") || size;

			// Convert numeric size (e.g., "12") to pixels (e.g., "12px")
			if (iconSize && /^\d+$/.test(iconSize)) {
				iconSize = `${iconSize}px`;
			}

			const iconSource = sourceName
				? IconSources[sourceName] ||
					(typeof source === "string" ? resolveSource(source) : source)
				: source;

			// Remove old icon if exists
			if (this.iconNode?.parentNode) {
				this.iconNode.parentNode.removeChild(this.iconNode);
			}

			// Create and append new icon
			this.iconNode = icon(iconName, {
				mode: "inline",
				source: iconSource,
				size: iconSize,
				className,
			});

			if (this.shadowRoot) {
				this.shadowRoot.appendChild(this.iconNode);
			}
		}
	}

	// Register the custom element
	if (!customElements.get(name)) {
		customElements.define(name, IconElement);
	}
}

// ----------------------------------------------------------------------------
// SECTION: Exports
// ----------------------------------------------------------------------------

export {
	Cache,
	IconSources,
	IconsContainer,
	icon,
	install,
	loadIcon,
	loadIcons,
};

export default Object.assign(icon, { install });

// EOF
