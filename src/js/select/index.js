// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-05-07
// Updated: 2026-06-20

// Module: select/index
// Aggregates the core and companion modules into a single import surface.

import browser from "./browser.js";
import cells from "./cells.js";
import fastdom from "./fastdom.js";
import icons from "./icons.js";
import * as interaction from "./interaction.js";
import $ from "./query.js";
import * as routing from "./routing.js";
import ui from "./ui/index.js";
import * as dates from "./utils/dates.js";
import * as utils from "./utils.js";

export * from "./browser.js";
export * from "./cells.js";
export { expand } from "./cells.js";
export * from "./fastdom.js";
export * from "./icons.js";
export * from "./interaction.js";
export * from "./routing.js";
export * from "./ui/index.js";
export { remap } from "./ui/index.js";
export * from "./utils.js";

export {
	$,
	browser,
	cells,
	dates,
	fastdom,
	icons,
	interaction,
	routing,
	ui,
	utils,
};

// EOF
