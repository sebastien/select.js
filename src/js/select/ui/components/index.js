// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2015-02-27
// Updated: 2026-06-02

// Module: select/ui/components
// Public barrel for the component runtime. Re-exports the component model,
// registry helpers, template instance, template class, and slot descriptors.

// ----------------------------------------------------------------------------
//
// BARREL EXPORTS
//
// ----------------------------------------------------------------------------

export { UIInstance } from "./instance.js";
export { AppliedUITemplate, UIEvent } from "./model.js";
export {
	COMPONENTS,
	component,
	Dynamic,
	lazy,
	options,
	registerComponent,
} from "./registry.js";
export {
	UIAttributeSlot,
	UIAttributeTemplateSlot,
	UIContentSlot,
	UIEventSlot,
	UIEventTemplateSlot,
	UISlot,
	UITemplateSlot,
} from "./slots.js";
export { UITemplate } from "./template.js";

// EOF
