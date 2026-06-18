import { remap, ui } from "../../../src/js/select/ui.js"

const getType = (value) =>
	value === undefined || value === null
		? "undefined"
		: value instanceof Map
			? "map"
			: Array.isArray(value)
				? "array"
				: typeof value

const withPath = (path, key) => `${path}.${key}`

const Item = ui(`<li class="pl-2"><span class="mono dim small" out="label"></span> <span out-replace="value"></span></li>`).does({
	label: (_self, { key }) => `${key}:`,
	value: (_self, { value, path }) => InspectValue({ value, path }),
})

const InspectList = ui(`<ul class="comma brackets dim-ab" out="items"></ul>`).does({
	items: (_self, { value, path }) =>
		remap(value, (entry, index) => {
			const itemPath = withPath(path, index)
			return Item({
				key: `#${index}`,
				path: itemPath,
				value: entry,
				$key: index,
			})
		}),
})

const InspectDict = ui(`<ul class="comma curlies dim-ab" out="items"></ul>`).does({
	items: (_self, { value, path }) =>
		remap(value, (entry, key) => {
			const itemPath = withPath(path, key)
			return Item({
				key,
				path: itemPath,
				value: entry,
				$key: itemPath,
			})
		}),
})

const InspectScalar = ui(`<span out="text"></span>`).does({
	text: (_self, { value }) => `${value}`,
})

const InspectValue = ({ value, path = "$" }) => {
	switch (getType(value)) {
		case "object":
		case "map":
			return InspectDict({ value, path, $key: path })
		case "array":
			return InspectList({ value, path, $key: path })
		default:
			return InspectScalar({ value, $key: path })
	}
}

export const createApp = async (root, initialValue) => {
	const instance = InspectDict.new()
	instance.set({ value: initialValue, path: "$" }).mount(root)
	return {
		update(nextValue) {
			instance.update({ value: nextValue, path: "$" })
		},
		dispose() {
			instance.unmount()
		},
	}
}
