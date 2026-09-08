# Select Icons (`select.icons.js`)

`select.icons.js` provides a small icon loader built on top of SVG symbols and the
CORS-enabled [jsDelivr](https://www.jsdelivr.com/) package CDN.

It supports:

- `icon(name, options?)` for programmatic SVG creation.
- `install(name?, options?)` for registering a `ui-icon` custom element.
- dynamic icon source catalogs loaded from Iconify collections.

## Default source catalog

Each Iconify prefix loads its standardized collection package from:

- `https://cdn.jsdelivr.net/npm/@iconify-json/<prefix>/icons.json`

Collection data is cached in memory after its first load. jsDelivr supplies wildcard CORS
and edge caching, so icon requests do not use the shared Iconify API.

The generic loader supports Iconify aliases, flips, rotation, and collection dimensions.
If a collection package is unavailable on jsDelivr, the icon fails without contacting
the Iconify API.

Remote SVG markup is parsed through a conservative allowlist before insertion.
Basic icon geometry is preserved, but richer SVG features may be stripped.

## Basic usage

```javascript
import { icon, install } from "@select/features/icons.js"

// Create SVG node directly
const node = icon("home", { source: "lucide", size: "1.5em" })
document.body.appendChild(node)

// Register custom element <ui-icon>
install("ui-icon")
```

```html
<ui-icon icon="lucide:home" size="1.5em"></ui-icon>
<ui-icon icon="mdi:account" size="2em"></ui-icon>
```

## Custom sources

If you need to point icons at another CDN or mirror, pass a `source` object with a
`url` template:

```javascript
import { install } from "@select/features/icons.js"

install("ui-icon-cdn", {
    source: {
        url: "https://cdn.example.com/__ICON_SOURCE__/__ICON_NAME__.svg",
    },
})
```

The same `source` value can also be passed directly to `icon(...)` for one-off
icons.

Remote SVG markup is parsed through a conservative allowlist before insertion,
so only basic geometry and safe attributes are preserved.

## Named transforms

Some aliases use named transforms for icon naming conventions:

- `snakecase`
- `kebabcase`
- `suffixOutline`
- `suffixFill`
- `suffixSolid`

These are applied when a source entry defines a `transform` name.

## Example

- `examples/feature-icons.html`
