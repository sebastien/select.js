---
identity: e46c1fc7-09e5-4640-be9e-4f770cee2935
created: 2026-11-15T04:27:23.268113+00:00
updated: 2026-11-15T04:27:45.890571+00:00
status: active
---

# select.js UI guidance

- In `select/ui`, only bridge a projected DOM event when the publishing instance
  owns the slotted node; a foreign publisher (for example a document-level
  overlay) must keep handling the event itself.
- Keep component markup in `<template>` or a loaded fragment, never inline
  `ui(...)` HTML. Nest sub-templates with their own `.does()`, and build no DOM
  in behaviours. The rules and rationale live in
  `docs/ui.md#component-structure-and-anti-patterns` and the select-ui skill.
- Renders are asynchronous: after a store write or an inout input event, await a
  tick before asserting on the DOM, otherwise stale values look like binding
  bugs.
- Wrap sample text in a `<td>` inside table rows. Bare text in `<tr>` is
  foster-parented before the table, outside the `out=rows` slot.
- Register the bound component factory directly with the webcomponent renderer;
  an applied Select template serializes as an object instead of UI.
