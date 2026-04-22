import { remap, ui } from "../../../src/js/select.ui.js";

const getType = (value) =>
	value === undefined || value === null
		? "undefined"
		: value instanceof Map
			? "map"
			: Array.isArray(value)
				? "array"
				: typeof value;

const createKeyNode = (key) => {
	const node = document.createElement("span");
	node.className = "mono dim small";
	node.textContent = `${key}:`;
	return node;
};

const Item = ui(`<li class="pl-2" out="content"></li>`).does({
	content: (_self, { key, value }) => [
		createKeyNode(key),
		" ",
		InspectValue(value),
	],
});

const InspectList = ui(
	`<ul class="comma brackets dim-ab" out="items"></ul>`,
).does({
	items: (_self, { value }) =>
		remap(value, (v, i) => Item({ key: `#${i}`, value: v })),
});

const InspectDict = ui(
	`<ul class="comma curlies dim-ab" out="items"></ul>`,
).does({
	items: (_self, { value }) =>
		remap(value, (v, k) => Item({ key: k, value: v })),
});

const InspectScalar = ui(`<span out="text"></span>`).does({
	text: (_self, { value }) => `${value}`,
});

const InspectValue = (value) => {
	switch (getType(value)) {
		case "object":
		case "map":
			return InspectDict({ value });
		case "array":
			return InspectList({ value });
		default:
			return InspectScalar({ value });
	}
};

const _Inspector = ui(`<div out="content"></div>`).does({
	content: (_self, { value }) => InspectValue(value),
});

const asMountedInstance = (root, applied) => {
	const instance = applied.template.new();
	instance.set(applied.data).mount(root);
	return instance;
};

export const createApp = async (root, initialValue) => {
	let current = InspectValue(initialValue);
	let instance = asMountedInstance(root, current);
	return {
		update(nextValue) {
			const next = InspectValue(nextValue);
			if (next.template === current.template) {
				instance.update(next.data);
			} else {
				instance.unmount();
				instance = asMountedInstance(root, next);
			}
			current = next;
		},
		dispose() {
			instance.unmount();
		},
	};
};
