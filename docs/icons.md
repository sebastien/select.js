# Select Icons (`select.icons.js`)

`select.icons.js` provides a small icon loader built on SVG symbols and pinned
packages from the CORS-enabled [jsDelivr](https://www.jsdelivr.com/) CDN.

It supports:

- `icon(name, source?, options?)` for programmatic SVG creation.
- `install(name?, options?)` for registering a `ui-icon` custom element.
- `load(...)` to fetch a `<symbol>`, and `resolve(name, source?)` to inspect the
  target URL without fetching.
- built-in presets that each fetch one SVG file.

Unknown source names do not download an Iconify collection. A page that asks
for one icon should not pay for the whole family.

The module is import-safe without a DOM (useful for the icon catalog or
server-side code). Browser-only pieces resolve lazily: the shared
`IconContainer` and the `ui-icon` custom element are created/registered on
first use, and `load()` rejects with a clear error when no DOM or explicit
container is available. With an explicit container, `load()` and `icon()` use
its `ownerDocument` and its window's `DOMParser`, without installing DOM
globals. `install(...)` requires browser globals to register custom elements.

## Built-in presets

| Source | Package | Notes |
| --- | --- | --- |
| `lucide` (default) | `lucide-static@1.48.0` | stroke, `currentColor` |
| `iconoir` | `iconoir@7.12.1` regular | stroke, `currentColor`; `-solid` suffix picks the solid folder |
| `iconoir-solid` | `iconoir@7.12.1` solid | not every regular name has a solid file |
| `eva`, `eva-outline` | `eva-icons@1.1.3` outline | appends `-outline`; sets `fill` |
| `eva-fill` | `eva-icons@1.1.3` fill | strips a `-fill` suffix; sets `fill` |
| `tabler` | `@tabler/icons@3.48.0` outline | stroke, `currentColor`; `-filled` suffix picks the filled folder |
| `tabler-filled` | `@tabler/icons@3.48.0` filled | |
| `mdi` | `@mdi/svg@7.4.47` | sets `fill` |
| `material-symbols`, `material-symbols-outlined` | `@material-symbols/svg-400@0.47.5` outlined | Iconify naming: bare name is the filled style, `-outline` is hollow, `-rounded`/`-sharp` pick the folder; sets `fill` |
| `material-symbols-rounded` | `@material-symbols/svg-400@0.47.5` rounded | defaults to the rounded folder |
| `material-symbols-sharp` | `@material-symbols/svg-400@0.47.5` sharp | |
| `material-symbols-light`, `material-symbols-light-outlined` | `@material-symbols/svg-200@0.47.5` outlined | weight 200; same naming rules |
| `material-symbols-light-rounded` | `@material-symbols/svg-200@0.47.5` rounded | |
| `material-symbols-light-sharp` | `@material-symbols/svg-200@0.47.5` sharp | |
| `material-icons`, `material-icons-filled` | `@material-design-icons/svg@0.14.15` filled | snake_case names; sets `fill` |
| `material-icons-outlined` | `@material-design-icons/svg@0.14.15` outlined | |
| `material-icons-round` | `@material-design-icons/svg@0.14.15` round | |
| `material-icons-sharp` | `@material-design-icons/svg@0.14.15` sharp | |
| `material-icons-two-tone` | `@material-design-icons/svg@0.14.15` two-tone | |
| `radix-icons` | `radix-ui/icons` (GitHub) | 15×15, `currentColor`; pinned to a commit, not tracked by `check-icons` |
| `ix` | `@siemens/ix-icons@3.5.0` | 512×512; sets `fill` |

Versions are pinned so the browser can cache each file. `color: var(--color-icon, currentColor)` themes sets that already use `currentColor`. Eva, the Material sets, and `ix` inherit black/`none` fill, so those presets set `fill` instead. The `radix-icons` preset points at a commit hash on jsDelivr's GitHub endpoint, so `update-icons` cannot bump it automatically.

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
- `snakecase`
- `snakecaseFill`
- `symbolsStyle`
- `tablerStyle`
- `iconoirStyle`
- `suffixOutline`
- `stripFill`

`snakecase` maps `-`/spaces to `_` (used by the `material-icons` presets). `snakecaseFill` does the same but keeps a trailing `-fill` suffix.

`symbolsStyle` maps Iconify-style Material Symbols names to a `folder/file` path, matching Iconify's naming: the **bare name is the filled style**, an `-outline` token selects the hollow file, and `-rounded`/`-sharp` selects the folder; the rest is snake_cased. So `material-symbols:home` resolves to `outlined/home-fill`, `material-symbols:home-outline` to `outlined/home`, and `material-symbols:home-outline-rounded` to `rounded/home`. A redundant `-fill` suffix is accepted as filled. A preset can set `variant: "rounded"` (or `sharp`) to pick the default folder, so both `material-symbols:home-rounded` and `material-symbols-rounded:home` resolve to `rounded/home-fill`.

`tablerStyle` and `iconoirStyle` do the same for those sets' `-filled`/`-solid` suffixes, which their packages store in `filled/` and `solid/` folders.

```javascript
import { resolve } from "@select/features/icons.js"

resolve("arrow-selector-tool-rounded", "material-symbols-light")
// { name, source, fileName: "rounded/arrow_selector_tool-fill",
//   url: "…/svg-200/rounded/arrow_selector_tool-fill.svg", … }
```

`resolve(name, source)` returns the target `url`/`fileName` without fetching, or
`undefined` for an unknown source. Use it for diagnostics and tooling.

## Curated catalog

`select/features/icons.catalog.js` ships a small, resilient catalog so tooling
does not need to download an Iconify collection (a single collection JSON is
1 MB+). It contains a curated set of canonical names plus a compact alias table
for the pairs a preset transform cannot derive on its own.

```javascript
import { IconCatalog, IconPresets, resolveIconName, isIconAvailable } from "@select/features/icons.catalog.js"

resolveIconName("close", "lucide")        // "x"
resolveIconName("close", "radix-icons")   // "cross-2"
resolveIconName("arrow-up", "material-symbols") // "arrow-upward"
isIconAvailable("folder", "radix-icons")  // false (no equivalent upstream)
```

- `IconCatalog` — canonical kebab-case names grouped by category.
- `IconPresets` — built-in preset labels, in display order.
- `IconAliases` — per-preset `canonical -> preset name` overrides (minimal).
- `IconUnavailable` — canonical names with no equivalent in a preset.
- `resolveIconName(name, preset)` / `isIconAvailable(name, preset)`.
- `catalogNames()` — the flattened name list.

Iconify remains the tool for *finding* icons; use it to discover a name, then
`resolveIconName` to check how each preset spells it.

## Example

- `examples/feature-icons.html`
- `examples/app-icons.html` — explorer that compares the curated catalog across
  every pinned preset, with no Iconify download. The render preset and selected
  icon are stored in the URL hash with the shared `browser()` state.
