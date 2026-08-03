import cell from "../../../src/js/select/state/cells.js"
import { remap, ui } from "../../../src/js/select/ui.js"

const getType = (value) =>
	value === undefined || value === null
		? "undefined"
		: value instanceof Map
			? "map"
			: Array.isArray(value)
				? "array"
				: typeof value

// Unwrap root store cell or bag field that may hold a cell.
const plain = (value) => (value?.isReactive === true ? value.value : value)

// Collection host: root store is the tree; nested inspectors use { value }.
const collectionOf = (data) => {
	if (data?.isReactive === true) {
		return data.value
	}
	if (data && typeof data === "object" && "value" in data) {
		return plain(data.value)
	}
	return data
}

// Store-mode: root `set(store)`; updates via `store.reconcile` / `instance.update(tree)`.
// Lists use positional reconciliation; dicts key by property name.
const Item = ui(
	`<li class="pl-2"><span class="mono dim small" out="label"></span> <span out-replace="value"></span></li>`,
).does({
	label: (_self, { key }) => `${key}:`,
	value: (_self, { value }) => InspectValue(plain(value)),
})

const InspectList = ui(`<ul class="comma brackets dim-ab" out="items"></ul>`).does(
	{
		items: (_self, data) =>
			remap(collectionOf(data), (entry, index) =>
				Item({
					key: `#${index}`,
					value: entry,
				}),
			),
	},
)

const InspectDict = ui(`<ul class="comma curlies dim-ab" out="items"></ul>`).does(
	{
		items: (_self, data) =>
			remap(collectionOf(data), (entry, key) =>
				Item({
					key,
					value: entry,
					$key: key,
				}),
			),
	},
)

const InspectScalar = ui(`<span out="text"></span>`).does({
	text: (_self, data) => {
		if (data?.isReactive === true) {
			return `${data.value}`
		}
		if (data && typeof data === "object" && "value" in data) {
			return `${plain(data.value)}`
		}
		return `${data}`
	},
})

const InspectValue = (value) => {
	const current = plain(value)
	switch (getType(current)) {
		case "object":
		case "map":
			return InspectDict({ value: current })
		case "array":
			return InspectList({ value: current })
		default:
			return InspectScalar({ value: current })
	}
}

export const createApp = async (root, initialValue) => {
	const state = cell.store(initialValue)
	const instance = InspectDict.new()
	// Store is instance.data directly — update(tree) reconciles into it.
	instance.set(state).mount(root)
	return {
		update(nextValue) {
			instance.update(nextValue)
		},
		dispose() {
			instance.unmount()
		},
	}
}
