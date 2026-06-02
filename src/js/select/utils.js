// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02
import sel from "./utils/selection.js";

// Module: select/utils
// Compatibility barrel for the split utility submodules.

export {
	add,
	find,
	has,
	index,
	itemkey,
	items,
	next,
	remove,
	toggle,
	wrapindex,
} from "./utils/selection.js";
export * from "./utils/compare.js";
export * from "./utils/func.js";
export * from "./utils/html.js";
export * from "./utils/iter.js";
export * from "./utils/logger.js";
export * from "./utils/math.js";
export * from "./utils/sanitize.js";
export * from "./utils/text.js";
export * from "./utils/transform.js";
export * from "./utils/traverse.js";
export * from "./utils/update.js";
export * from "./utils/values.js";
export { sel };

// EOF
