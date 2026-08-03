// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-05-07
// Updated: 2026-06-16

// Module: select/interaction
// Aggregates DOM interaction helpers into a stable import surface.

import core from "./core.js";
import drag from "./drag.js";
import draggable, { sort } from "./draggable.js";
import keyboard, { autoresize, Keyboard } from "./keyboard.js";
import placement from "./placement.js";

export * from "./core.js";
export * from "./drag.js";
export * from "./draggable.js";
export * from "./keyboard.js";
export * from "./placement.js";

export default {
	...core,
	drag,
	draggable,
	keyboard,
	Keyboard,
	autoresize,
	placement,
	sort,
};

// EOF
