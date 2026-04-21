import { ui, type, len, remap } from "../../../src/js/select.ui.js";

const getType = (value) =>
	value === undefined || value === null
		? "null"
		: Array.isArray(value)
			? "array"
			: Object.getPrototypeOf(value) === Object.prototype
				? "object"
				: typeof value;

const Item = ui(`<li class="pl-2">
	<span class="mono dim small" out="key"></span>
	<span out="value"></span>
</li>`).does({
	key: (self, { key }) => `${key}:`,
	value: (self, { value }) => InspectValue(value),
});

const InspectList = ui(`<ul class="comma brackets dim-ab" out="items">
	<li>Empty</li>
</ul>`).does({
	items: (self, { value }) =>
		remap(value, (v, i) =>
			Item({ key: `#${i}`, value: v }),
		),
});

const InspectDict = ui(`<ul class="comma curlies dim-ab" out="items">
	<li>Empty</li>
</ul>`).does({
	items: (self, { value }) =>
		remap(value, (v, k) =>
			Item({ key: k, value: v }),
		),
});

const InspectScalar = ui(`<span out="text"></span>`).does({
	text: (self, { value }) =>
		value === null || value === undefined ? "null" : String(value),
});

const InspectValue = (value) => {
	const t = getType(value);
	switch (t) {
		case "array":
			return InspectList({ value });
		case "object":
			return InspectDict({ value });
		default:
			return InspectScalar({ value });
	}
};

const Inspector = ui(`<div out="content"></div>`).does({
	content: (self, { value }) => InspectValue(value),
});

export const createApp = async (root, initialValue) => {
	const instance = Inspector.new().set({ value: initialValue }).mount(root);
	return {
		update(nextValue) {
			instance.set({ value: nextValue });
		},
		dispose() {
			instance.unmount();
		},
	};
};
