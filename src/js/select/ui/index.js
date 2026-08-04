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
	component,
	Disconnect,
	Dynamic,
	FORMATS,
	format,
	lazy,
	len,
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
	webcomponent,
};

export default ui;

// EOF
