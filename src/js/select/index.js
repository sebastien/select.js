// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-05-07
// Updated: 2026-06-20

// Module: select/index
// Aggregates the core and companion modules into a single import surface.

import fastdom from "./core/fastdom.js";
import icons from "./features/icons.js";
import $ from "./core/query.js";
import workflow from "./features/workflows.js";
import browser from "./state/browser/index.js";
import cells from "./state/cells/index.js";
import * as routing from "./state/routing/index.js";
import ui from "./ui/index.js";
import * as interaction from "./ui/interaction/index.js";
import { dates } from "./utils/dates.js";
import * as utils from "./utils/index.js";

export * from "./core/fastdom.js";
export { debug, FORMATS, format } from "./features/formats.js";
export * from "./features/icons.js";
export * from "./features/snappable.js";
export * from "./state/browser/index.js";
export * from "./state/cells/index.js";
export { expand } from "./state/cells/index.js";
export * from "./state/routing/index.js";
export * from "./ui/index.js";
export { remap } from "./ui/index.js";
export * from "./ui/interaction/index.js";
export * from "./utils/index.js";

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
