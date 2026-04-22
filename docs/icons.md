# Select Icons (`select.icons.js`)

`select.icons.js` provides a small icon loader built on top of SVG symbols and CDN sources.

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

## Basic usage

```javascript
import { icon, install } from "@./select.icons.js"

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

## Using a local JSON catalog

You can pass a catalog to `install(..., { sources })` as:

- a URL string
- a `{ sources: ... }` object
- a raw Iconify collections object

```javascript
import { install } from "@./select.icons.js"

const catalog = await fetch("../src/js/select.icons.json").then((r) => r.json())
install("ui-icon-local", { sources: catalog })
```

## Generating `select.icons.json`

Use the generator script to refresh the local catalog:

```bash
src/sh/select.icon.sh
```

Options:

- `--json-out <path>`: write JSON to a custom path.
- `--stdout`: print JSON to stdout.
- `--no-json`: skip file write (use with `--stdout`).

By default it writes:

- `src/js/select.icons.json`

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
