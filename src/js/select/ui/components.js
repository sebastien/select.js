// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02

// Module: select/ui/components
// Public barrel for the component runtime. Re-exports the component model,
// registry helpers, template instance, template class, and slot descriptors.

// ----------------------------------------------------------------------------
//
// BARREL EXPORTS
//
// ----------------------------------------------------------------------------

export { AppliedUITemplate, UIEvent } from "./components/model.js";
export { COMPONENTS, component, Dynamic, lazy, options } from "./components/registry.js";
export { UIInstance } from "./components/instance.js";
export { UITemplate } from "./components/template.js";
export {
	UIAttributeSlot,
	UIAttributeTemplateSlot,
	UIContentSlot,
	UIEventSlot,
	UIEventTemplateSlot,
	UISlot,
	UITemplateSlot,
} from "./components/slots.js";

// EOF
