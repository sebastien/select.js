// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-08-04

// Module: select/features
// Public entry point for optional feature modules. Icons are intentionally not
// re-exported here: their DOM-backed API is a separate leaf surface. Import them from
// `select/features/icons.js` (and `select/features/icons.catalog.js`) directly.

export * from "./formats.js";
export * from "./interaction/index.js";
export * from "./workflows.js";

// EOF
