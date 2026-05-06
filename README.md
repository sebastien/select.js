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
JavaScript. It started as faster alternative to the venerable jQuery,
with support for DOM/SVG manipulation (`select/query.js`), and then expanded
with a UI template library (`select/ui.js`) and supporting fine-grained reactive
state primitives (`select/cells.js`).

While `select/query.js` is fast, the `select/ui.js` library is not the fastest, but
it is fast enough and lightweight enough to be used in a wide range of
contexts, in particular when writing plugins or small UIs that need to be
embedded into others.

In that sense, Select is designed to fill the niche for little tools that
can be composed and embedded. If you want to do a larger scale application,
have a look at [ui.js](https://github.com/sebastien/ui.js) which offers
high-performance and advanced features for complete web applications.

You can learn more about each component:

- **Select.js**: jQuery-like library ― [manual](docs/select.md)
- **Select UI**: UI component library  ― [manual](docs/ui.md) & [reference](docs/ref-ui.md)
- **Select Cells**: Reactive state library ― [manual](docs/cells.md) & [reference](docs/ref-cells.md)
- **Select Utils/Interaction/Routing**: Agnostic utility, interaction, and routing helpers ― [manual](docs/utils.md) & [reference](docs/ref-utils.md)

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
    "@select/": "https://cdn.jsdelivr.net/gh/sebastien/select.js@v0.7.1/src/js/select/"
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
- `cell(value?)`: mutable reactive cell.
- `derived(template, processor?, initial?)`: derived reactive value.
- `ui(selection, scope?)`: template component factory.
- `webcomponent(name, componentFactory, initial?, options?)`: native custom element registration from Select UI or pure render functions.
- `Dynamic(type, props?)`: dynamic component resolution by name/function.
- `lazy(loader, placeholder?)`: lazy component loader.
- `len`, `type`, `remap`: shared utility helpers from `select/ui.js`.
- `clsx`, `shortword`, `sorted`, `unique`: shared helpers from `select/utils.js`.
- `bind`, `drag`, `autoresize`, `Keyboard`: interaction helpers from `select/interaction.js`.

### Modules

- [`docs/select.md`](docs/select.md): `select.js` complete reference (original README split).
- [`docs/ui.md`](docs/ui.md): `select/ui.js` usage and API guide.
- [`docs/cells.md`](docs/cells.md): `select/cells.js` usage and API guide.
- [`docs/utils.md`](docs/utils.md): `select/utils.js`, `select/interaction.js`, and `select/routing.js` usage and API guide.
- [`docs/icons.md`](docs/icons.md): `select/icons.js` CDN icon loading and catalog usage.

### Notable examples

- [`examples/feature-webcomponent.html`](examples/feature-webcomponent.html): custom elements with `webcomponent(...)` for both Select UI templates and pure render functions.
- [`examples/feature-icons.html`](examples/feature-icons.html): icon usage with default CDN collections and local JSON catalog.

# Features

- *DOM + SVG support*: one selection API across HTML and SVG nodes.
- *Fine-grained reactivity*: explicit `cell`/`derived` primitives.
- *Template-driven UI*: declarative slot attributes with direct DOM updates.
- *No build step required*: works in modern browsers with native ESM.
- *Small and fast*: designed with explicit loops and low-overhead primitives.
