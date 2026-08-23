// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-05-07
// Updated: 2026-06-02

// Module: select/ui
// Re-export surface for the UI runtime.

// ----------------------------------------------------------------------------
//
// PUBLIC HELPERS
//
// ----------------------------------------------------------------------------

import { FORMATS, format } from "../features/formats.js";
import { len, type } from "../utils/index.js";
import { remap } from "../utils/transform.js";
import {
	AppliedUITemplate,
	COMPONENTS,
	component,
	Dynamic,
	lazy,
	options,
	UIAttributeSlot,
	UIAttributeTemplateSlot,
	UIContentSlot,
	UIEvent,
	UIEventSlot,
	UIEventTemplateSlot,
	UIInstance,
	UISlot,
	UITemplate,
	UITemplateSlot,
} from "./components.js";
import { ui } from "./factory.js";
import { captureLinks, interceptLink } from "./links.js";
import { mask } from "./mask.js";
import { virtual, windowOf } from "./virtual.js";
import {
	Adopted,
	Disconnect,
	UIWebComponent,
	webcomponent,
} from "./webcomponents.js";

// Function: remap
// Maps `f` over collection entries while preserving the input container shape.
// Re-exported from utils/transform.js.

export {
	Adopted,
	AppliedUITemplate,
	COMPONENTS,
	captureLinks,
	component,
	Disconnect,
	Dynamic,
	FORMATS,
	format,
	interceptLink,
	lazy,
	len,
	mask,
	options,
	remap,
	type,
	UIAttributeSlot,
	UIAttributeTemplateSlot,
	UIContentSlot,
	UIEvent,
	UIEventSlot,
	UIEventTemplateSlot,
	UIInstance,
	UISlot,
	UITemplate,
	UITemplateSlot,
	UIWebComponent,
	ui,
	virtual,
	webcomponent,
	windowOf,
};

export default ui;

// EOF
