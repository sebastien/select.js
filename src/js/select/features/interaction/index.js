// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-05-07
// Updated: 2026-09-26

// Module: select/interaction
// Aggregates DOM interaction helpers into a stable import surface.

import core from "./core.js";
import drag from "./drag.js";
import draggable, { sort } from "./draggable.js";
import keyboard, { autoresize, Keyboard } from "./keyboard.js";
import popup from "./popup.js";
import positioning from "./positioning.js";
import snappable from "./snappable.js";
import sortable from "./sortable.js";

export * from "./core.js";
export * from "./drag.js";
export * from "./draggable.js";
export * from "./keyboard.js";
export * from "./popup.js";
export * from "./positioning.js";
export * from "./snappable.js";
export * from "./sortable.js";

export default {
	...core,
	drag,
	draggable,
	keyboard,
	Keyboard,
	autoresize,
	popup,
	positioning,
	snappable,
	sortable,
	sort,
};

// EOF
