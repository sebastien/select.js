// Project: Select.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2024-01-01

// Module: select.all
// Combined exports of all Select.js modules. Re-exports everything from
// select.js, select.cells.js, and select.ui.js for convenience.
//
// Example:
// ```javascript
// import { $, cell, ui } from "./select.all.js"
//
// const state = cell({ count: 0 })
// const Counter = ui(`
//   <button out:text='count' on:click='increment'></button>
// `).does({
//   increment: (self, data) => data.count.set(data.count.get() + 1)
// })
//
// Counter({ count: state }).mount(document.body)
// ```

export * from "./select.js"
export { default as select, S, $ } from "./select.js"

export * from "./select.cells.js"
export { default as cell } from "./select.cells.js"

export * from "./select.ui.js"
export { default as ui } from "./select.ui.js"

// EOF
