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

*Select.js* is a lightweight toolkit for modern browser interfaces. It
started as a faster alternative to the venerable jQuery, with support for
DOM/SVG manipulation, and grew into template-driven UI components,
fine-grained reactive state, browser-backed state, routing, icons, and a
bundle of utilities.

The selection API is fast; the UI library is not the fastest, but it is
light enough for embedded UIs, plugins, and small tools — in the JSON
inspector benchmark, it is competitive with SolidJS. Select fills the niche
for little tools that can be composed and embedded. If you are building a
larger scale application, have a look at
[ui.js](https://github.com/sebastien/ui.js) instead.

## Get started

Install from npm:

```sh
npm install @ssebastien/select
```

```js
import select from "@ssebastien/select"
import cell from "@ssebastien/select/state/cells.js"
import ui from "@ssebastien/select/ui"
```

Using an AI coding agent? Install the [select-ui skill](docs/skills/select-ui/SKILL.md) for guidance on templates, reactivity, and component patterns:

```sh
npx skills add sebastien/select.js/docs/skills/select-ui
```

## In a nutshell

No build step required — the example below loads straight from a CDN:

```html
<!DOCTYPE html>
<html><body>
<div id="app"></div>

<script type="importmap">
{
  "imports": {
    "@select/": "https://cdn.jsdelivr.net/gh/sebastien/select.js@v1.2.1/src/js/select/"
  }
}
</script>

<script type="module">
import $ from "@select/features/query.js"
import cell from "@select/state/cells.js"
import ui from "@select/ui"

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

## Features

- *DOM + SVG support*: one selection API across HTML and SVG nodes.
- *Fine-grained reactivity*: explicit `cell`/`derived` primitives.
- *Template-driven UI*: declarative slot attributes with direct DOM updates.
- *No build step required*: works in modern browsers with native ESM.
- *Small and fast*: designed with explicit loops and low-overhead primitives.

## Where to go next

- [docs/](docs/) — usage guides and API references for each module
- [examples/](examples/) — runnable demos; serve them with `make run` and open any HTML file
