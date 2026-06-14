// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-05-07
// Updated: 2026-06-02
import * as dates from "./utils/dates.js"
import sel from "./utils/selection.js"
import search from "./utils/search.js"

// Module: select/utils
// Compatibility barrel for the split utility submodules.

export * from "./utils/compare.js"
export * from "./utils/dates.js"
export * from "./utils/func.js"
export * from "./utils/hashfmt.js"
export * from "./utils/html.js"
export * from "./utils/iter.js"
export * from "./utils/logger.js"
export * from "./utils/math.js"
export * from "./utils/sanitize.js"
export * from "./utils/text.js"
export * from "./utils/transform.js"
export * from "./utils/traverse.js"
export * from "./utils/update.js"
export * from "./utils/values.js"
export { access } from "./utils/traverse.js"
export { dates, sel, search }

// EOF
