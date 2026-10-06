// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-05-07
// Updated: 2026-06-20

// Module: select/index
// Aggregates the core and companion modules into a single import surface.
// Kept free of DOM-at-import dependencies so it can be imported headless (e.g.
// for server-side rendering). Icons are a separate DOM-backed leaf surface;
// import them from `select/features/icons.js` (and the
// catalog from `select/features/icons.catalog.js`) explicitly.

import * as interaction from "./features/interaction/index.js";
import $ from "./features/query.js";
import workflow from "./features/workflows.js";
import browser from "./state/browser.js";
import cells from "./state/cells.js";
import * as routing from "./state/routing.js";
import fastdom from "./ui/fastdom.js";
import ui from "./ui/index.js";
import { dates } from "./utils/dates.js";
import * as utils from "./utils/index.js";

export { debug, FORMATS, format } from "./features/formats.js";
export * from "./features/interaction/index.js";
export * from "./state/browser.js";
export * from "./state/cells.js";
export { expand } from "./state/cells.js";
export * from "./state/routing.js";
export * from "./ui/fastdom.js";
export * from "./ui/index.js";
export { remap } from "./ui/index.js";
export * from "./utils/index.js";

export {
	$,
	browser,
	cells,
	dates,
	fastdom,
	interaction,
	routing,
	ui,
	utils,
	workflow,
};

// EOF
