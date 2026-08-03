We need to refactor the modules, and we can forgo of compatibility except
the toplevel index.js.

Rules:
- No single module/index.js, instead module.js
- Don't scatter a module across submodules (like interaction/ ,then ui/interaction and interaction).
- Now that we've embraced nested modules, we should cleanup the toplevel and minimize direct modules there

Except output:
- Not too many module files
- Reading module hierarchy gives a clear view of architecture
- No modules that are too thin (<100 lines) or too fat (>2000 lines)

 Guidelines:


core/fastdom -> ui/fastdom
query -> features/query
features/snappable -> features/interaction/snappable
interaction/* -> features/interaction
ui/interaction/* -> features/interaction
interaction.js -> features/interaction/index.js
browser.js -> state/browser.js
icons.js -> features/icons.js
cell.js -> state/cells.js






