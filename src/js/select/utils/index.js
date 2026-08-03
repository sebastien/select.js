// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-05-07
// Updated: 2026-06-15
import { dates } from "./dates.js";
import dom from "./dom.js";
import search from "./search.js";
import sel from "./selection.js";

// Module: select/utils
// Compatibility barrel for the split utility submodules.

export * from "./async.js";
export * from "./compare.js";
export * from "./func.js";
export * from "./hashfmt.js";
export * from "./html.js";
export * from "./iter.js";
export * from "./logger.js";
export * from "./math.js";
export * from "./sanitize.js";
export * from "./shape.js";
export * from "./storage.js";
export * from "./text.js";
export * from "./transform.js";
export * from "./traverse.js";
export { access } from "./traverse.js";
export * from "./update.js";
export * from "./values.js";
export { dates, dom, search, sel };

// EOF
