// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-05-07
// Updated: 2026-06-16

// Module: select/interaction
// Aggregates DOM interaction helpers into a stable import surface.

import core from "./interaction/core.js";
import drag from "./interaction/drag.js";
import keyboard, { autoresize, Keyboard } from "./interaction/keyboard.js";
import placement from "./interaction/placement.js";
import sortable from "./interaction/sortable.js";

export * from "./interaction/core.js";
export * from "./interaction/drag.js";
export * from "./interaction/keyboard.js";
export * from "./interaction/placement.js";
export * from "./interaction/sortable.js";

export default {
	...core,
	drag,
	keyboard,
	Keyboard,
	autoresize,
	placement,
	sortable,
};

// EOF
