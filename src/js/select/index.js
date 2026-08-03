// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-05-07
// Updated: 2026-06-20

// Module: select/index
// Aggregates the core and companion modules into a single import surface.

import fastdom from "./ui/fastdom.js";
import icons from "./features/icons.js";
import $ from "./features/query.js";
import workflow from "./features/workflows.js";
import browser from "./state/browser.js";
import cells from "./state/cells.js";
import * as routing from "./state/routing.js";
import ui from "./ui.js";
import * as interaction from "./features/interaction/index.js";
import { dates } from "./utils/dates.js";
import * as utils from "./utils.js";

export * from "./ui/fastdom.js";
export { debug, FORMATS, format } from "./features/formats.js";
export * from "./features/icons.js";
export * from "./features/interaction/snappable.js";
export * from "./state/browser.js";
export * from "./state/cells.js";
export { expand } from "./state/cells.js";
export * from "./state/routing.js";
export * from "./ui.js";
export { remap } from "./ui.js";
export * from "./features/interaction/index.js";
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
	workflow,
};

// EOF
