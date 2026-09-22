# Select Icons (`select.icons.js`)

`select.icons.js` provides a small icon loader built on SVG symbols and pinned
packages from the CORS-enabled [jsDelivr](https://www.jsdelivr.com/) CDN.

It supports:

- `icon(name, source?, options?)` for programmatic SVG creation.
- `install(name?, options?)` for registering a `ui-icon` custom element.
- built-in presets that each fetch one SVG file.

Unknown source names do not download an Iconify collection. A page that asks
for one icon should not pay for the whole family.

## Built-in presets

| Source | Package | Notes |
| --- | --- | --- |
| `lucide` (default) | `lucide-static@1.47.0` | stroke, `currentColor` |
| `iconoir` | `iconoir@7.12.1` regular | stroke, `currentColor` |
| `iconoir-solid` | `iconoir@7.12.1` solid | not every regular name has a solid file |
| `eva`, `eva-outline` | `eva-icons@1.1.3` outline | appends `-outline`; sets `fill` |
| `eva-fill` | `eva-icons@1.1.3` fill | strips a `-fill` suffix; sets `fill` |
| `tabler` | `@tabler/icons@3.47.0` outline | stroke, `currentColor` |
| `tabler-filled` | `@tabler/icons@3.47.0` filled | |
| `mdi` | `@mdi/svg@7.4.47` | sets `fill` |

Versions are pinned so the browser can cache each file. `color: var(--color-icon, currentColor)` themes sets that already use `currentColor`. Eva paths inherit black fill, so that preset sets `fill` instead.

## Basic usage

```javascript
import { icon, install } from "@select/features/icons.js"

const node = icon("home", "lucide", { size: "1.5em" })
document.body.appendChild(node)

install("ui-icon")
```

```html
<ui-icon icon="lucide:home" size="1.5em"></ui-icon>
<ui-icon icon="eva:heart" size="2em"></ui-icon>
```

`icon("lucide:home")` is the same as `icon("home", "lucide")`.

`register(sources)` adds more presets at runtime. `install(name, { sources })`
does the same while defining a custom element.

## Custom sources

Pass a source object with a `url` template. `__ICON_NAME__` and `__ICON_SOURCE__`
are replaced.

```javascript
import { icon } from "@select/features/icons.js"

icon("home", {
    url: "https://cdn.example.com/__ICON_NAME__.svg",
})
```

An explicit `format: "iconify"` source still reads a collection JSON, including
aliases, flips, and rotation. That path is opt-in. Do not point the default
source at `@iconify-json/<prefix>/icons.json`.

Remote SVG markup is parsed through a conservative allowlist before insertion,
so only basic geometry and safe attributes are preserved.

## Named transforms

A preset `transform` can be a function or one of:

- `kebabcase`
- `suffixOutline`
- `stripFill`

## Example

- `examples/feature-icons.html`
