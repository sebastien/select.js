// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-06-02
// Updated: 2026-06-02

// Module: select/ui/components/model
// Small model classes shared by the component runtime.

class UIEvent {
	constructor(name, data, origin) {
		this.name = name;
		this.data = data;
		this.origin = origin;
		this.current = undefined;
	}
	stopPropagation() {
		return null;
	}
}

class AppliedUITemplate {
	constructor(template, data) {
		this.template = template;
		this.data = data;
	}
}

export { AppliedUITemplate, UIEvent };

// EOF
