```
 $$$$$$\            $$\                       $$\
$$  __$$\           $$ |                      $$ |
$$ /  \__| $$$$$$\  $$ | $$$$$$\   $$$$$$$\ $$$$$$\       $$\  $$$$$$$\
\$$$$$$\  $$  __$$\ $$ |$$  __$$\ $$  _____|\_$$  _|      \__|$$  _____|
 \____$$\ $$$$$$$$ |$$ |$$$$$$$$ |$$ /        $$ |        $$\ \$$$$$$\
$$\   $$ |$$   ____|$$ |$$   ____|$$ |        $$ |$$\     $$ | \____$$\
\$$$$$$  |\$$$$$$$\ $$ |\$$$$$$$\ \$$$$$$$\   \$$$$  |$$\ $$ |$$$$$$$  |
 \______/  \_______|\__| \_______| \_______|   \____/ \__|$$ |\_______/
                                                    $$\   $$ |
                                                    \$$$$$$  |
                                                     \______/

```

*Select.js* is a lightweight toolkit for modern browser interfaces in
JavaScript. It started as a small DOM/SVG selection library (`select/query.js`)
and now also includes template-driven UI (`select/ui.js`), fine-grained reactive
state (`select/cells.js`), browser-backed state (`select/browser.js`), routing
(`select/routing.js`), icons (`select/icons.js`), interaction helpers, and a
general utility bundle.

The aggregate entry point is `select/index.js`, which re-exports the companion
modules for projects that prefer a single import surface. The focused modules
remain available for direct imports.

While `select/query.js` is fast, the `select/ui.js` library is not the fastest,
but it is light enough for embedded UIs, plugins, and small tools. In the JSON
inspector benchmark, it is competitive with SolidJS (`npm run bench:inspector`).

In that sense, Select is designed to fill the niche for little tools that
can be composed and embedded. If you want to do a larger scale application,
have a look at [ui.js](https://github.com/sebastien/ui.js) which offers
high-performance and advanced features for complete web applications.

You can learn more about each component:

- **Select.js**: jQuery-like library ― [manual](docs/select.md)
- **Select UI**: UI component library  ― [manual](docs/ui.md) & [reference](docs/ref-ui.md)
- **Select Cells**: Reactive state library ― [manual](docs/cells.md) & [reference](docs/ref-cells.md)
- **Select Browser**: Browser-backed reactive state for URL and storage ― [manual](docs/browser.md) & [reference](docs/ref-browser.md)
- **Select Utils**: Utility helpers and compatibility barrel ― [manual](docs/utils.md) & [reference](docs/ref-utils.md)
- **Select Icons**: SVG icon registry and loader utilities ― [manual](docs/icons.md)
- **Select Routing**: Route parsing and dispatch helpers ― documented in [Select Utils](docs/utils.md)

## In a nutshell

```html
<!DOCTYPE html>
<html><body>
<div id="app"></div>

<script type="importmap">
{
  "imports": {
    "@./": "./src/js/select/"
  }
}
</script>

<script type="module">
import $ from "@./query.js"
import cell from "@./cells.js"
import ui from "@./ui.js"

const Counter = ui(`
  <div>
    <button on:click="dec">-</button>
    <span out="count">0</span>
    <button on:click="inc">+</button>
  </div>
`).does({
  count: (self, { count }) => count.value,
  dec: (self, { count }) => count.set(count.value - 1),
  inc: (self, { count }) => count.set(count.value + 1),
})

Counter.new().set({ count: cell(0) }).mount("#app")
$("#app").addClass("ready")
</script>

</body></html>
```

### CDN usage (jsDelivr)

```html
<script type="importmap">
{
  "imports": {
    "@select/": "https://cdn.jsdelivr.net/gh/sebastien/select.js@v0.9.0/src/js/select/"
  }
}
</script>

<script type="module">
import $ from "@select/query.js"
import cell from "@select/cells.js"
import ui from "@select/ui.js"
</script>
```

### API

- `select(selector, scope?)` (`$`, `S`): DOM/SVG selection and manipulation API.
- `browser(options?)`: browser-backed state for URL, storage, and fetch helpers.
- `cell(value?)`: mutable reactive cell.
- `derived(template, processor?, initial?)`: derived reactive value.
- `ui(selection, scope?)`: template component factory.
- `ui.load(url, scope?)`: preload and cache external template fragments.
- `ui.component(name)`: logic-only component definition to bind later with `.using(...)`.
- `webcomponent(name, componentFactory, initial?, options?)`: native custom element registration from Select UI or pure render functions.
- `Dynamic(type, props?)`: dynamic component resolution by name/function.
- `lazy(loader, placeholder?)`: lazy component loader.
- `router()`, `routed()`, `route(pattern)`, `RoutePattern`: routing helpers from `select/routing.js`.
- `icon(name, options?)`, `install(...)`, `load(...)`: icon registry helpers from `select/icons.js`.
- `len`, `type`, `remap`: shared utility helpers from `select/ui.js`.
- `clsx`, `shortword`, `sorted`, `unique`: shared helpers from `select/utils.js` and `select/utils/*.js`.
- `bind`, `drag`, `autoresize`, `Keyboard`: interaction helpers from `select/interaction.js`.
- `fastdom`: batched DOM read/write helper.

### Modules

- [`docs/select.md`](docs/select.md): `select.js` complete reference (original README split).
- [`docs/ui.md`](docs/ui.md): `select/ui.js` usage and API guide.
- [`docs/cells.md`](docs/cells.md): `select/cells.js` usage and API guide.
- [`docs/browser.md`](docs/browser.md): `select/browser.js` usage and API guide.
- [`docs/utils.md`](docs/utils.md): `select/utils.js` and the helper submodules usage and API guide.
- [`docs/icons.md`](docs/icons.md): `select/icons.js` CDN icon loading and catalog usage.
- Routing helpers are covered by [`docs/utils.md`](docs/utils.md) and [`examples/feature-routing.html`](examples/feature-routing.html).

### Notable examples

- [`examples/feature-webcomponent.html`](examples/feature-webcomponent.html): custom elements with `webcomponent(...)`, including parent event rebinding through implicit or explicit `ui-parent`.
- [`examples/feature-icons.html`](examples/feature-icons.html): icon usage with default CDN collections and local JSON catalog.
- [`examples/feature-routing.html`](examples/feature-routing.html): browser-backed route state and route dispatch.
- [`examples/feature-template-load.html`](examples/feature-template-load.html): preload external templates with `ui.load(...)` and bind one behavior to multiple presentations with `.using(...)`.

# Features

- *DOM + SVG support*: one selection API across HTML and SVG nodes.
- *Fine-grained reactivity*: explicit `cell`/`derived` primitives.
- *Template-driven UI*: declarative slot attributes with direct DOM updates.
- *No build step required*: works in modern browsers with native ESM.
- *Small and fast*: designed with explicit loops and low-overhead primitives.
