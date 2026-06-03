// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-05-07
// Updated: 2026-06-02

// Module: select/index
// Aggregates the core and companion modules into a single import surface.

import cells from "./cells.js";
import fastdom from "./fastdom.js";
import icons from "./icons.js";
import ui from "./ui/index.js";
import browser from "./browser.js";
import * as interaction from "./interaction.js";
import * as routing from "./routing.js";
import * as utils from "./utils.js";
import $ from "./query.js";

export * from "./cells.js";
export * from "./fastdom.js";
export * from "./browser.js";
export * from "./icons.js";
export * from "./ui/index.js";
export * from "./interaction.js";
export * from "./routing.js";
export * from "./utils.js";

export { cells, fastdom, icons, interaction, routing, $, ui, utils, browser };

// EOF
