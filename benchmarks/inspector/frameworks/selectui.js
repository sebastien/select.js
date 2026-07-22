import { remap, ui } from "../../../src/js/select/ui.js"

const getType = (value) =>
	value === undefined || value === null
		? "undefined"
		: value instanceof Map
			? "map"
			: Array.isArray(value)
				? "array"
				: typeof value

// No path-derived $keys: index shifts must not invalidate nested instance
// identity. Lists use positional reconciliation (append/tail/shift fast paths).
// Dict entries key by property name only.
const Item = ui(
	`<li class="pl-2"><span class="mono dim small" out="label"></span> <span out-replace="value"></span></li>`,
).does({
	label: (_self, { key }) => `${key}:`,
	value: (_self, { value }) => InspectValue(value),
})

const InspectList = ui(`<ul class="comma brackets dim-ab" out="items"></ul>`).does({
	items: (_self, { value }) =>
		remap(value, (entry, index) =>
			Item({
				key: `#${index}`,
				value: entry,
			}),
		),
})

const InspectDict = ui(`<ul class="comma curlies dim-ab" out="items"></ul>`).does({
	items: (_self, { value }) =>
		remap(value, (entry, key) =>
			Item({
				key,
				value: entry,
				$key: key,
			}),
		),
})

const InspectScalar = ui(`<span out="text"></span>`).does({
	text: (_self, { value }) => `${value}`,
})

const InspectValue = (value) => {
	switch (getType(value)) {
		case "object":
		case "map":
			return InspectDict({ value })
		case "array":
			return InspectList({ value })
		default:
			return InspectScalar({ value })
	}
}

export const createApp = async (root, initialValue) => {
	const instance = InspectDict.new()
	instance.set({ value: initialValue }).mount(root)
	return {
		update(nextValue) {
			instance.update({ value: nextValue })
		},
		dispose() {
			instance.unmount()
		},
	}
}
