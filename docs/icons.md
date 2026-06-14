# Select Icons (`select.icons.js`)

`select.icons.js` provides a small icon loader built on top of SVG symbols and CDN sources
(by default [Iconify.design](https://icon-sets.iconify.design)).

It supports:

- `icon(name, options?)` for programmatic SVG creation.
- `install(name?, options?)` for registering a `ui-icon` custom element.
- dynamic icon source catalogs loaded from Iconify collections.

## Default source catalog

If no source catalog is provided, `select.icons.js` fetches available icon families from:

- `https://api.iconify.design/collections`

Each collection is mapped to a source URL template:

- `https://api.iconify.design/<prefix>/__ICON_NAME__.svg`

This gives access to all Iconify/Icônes families through a CDN endpoint.

Remote SVG markup is parsed through a conservative allowlist before insertion.
Basic icon geometry is preserved, but richer SVG features may be stripped.

## Basic usage

```javascript
import { icon, install } from "@./icons.js"

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
import { install } from "@./icons.js"

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
