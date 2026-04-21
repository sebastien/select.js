import { createSignal } from "solid-js/dist/solid.js";
import { render } from "solid-js/web/dist/web.js";
import h from "solid-js/h/dist/h.js";

const getType = (value) =>
	value === undefined || value === null
		? "undefined"
		: value instanceof Map
			? "map"
			: Array.isArray(value)
				? "array"
				: typeof value;

const Inspector = (props) => {
	const value = typeof props.value === "function" ? props.value() : props.value;

	switch (getType(value)) {
		case "object":
		case "map":
			return h(
				"ul",
				{ className: "comma curlies dim-ab" },
				...Object.entries(value).map(([key, entryValue]) =>
					h(
						"li",
						{ className: "pl-2" },
						h("span", { className: "mono dim small" }, `${key}:`),
						" ",
						h(Inspector, { value: () => entryValue })
					)
				)
			);
		case "array":
			return h(
				"ul",
				{ className: "comma brackets dim-ab" },
				...value.map((entryValue, index) =>
					h(
						"li",
						{ className: "pl-2" },
						h("span", { className: "mono dim small" }, `#${index}:`),
						" ",
						h(Inspector, { value: () => entryValue })
					)
				)
			);
		default:
			return h("span", null, `${value}`);
	}
};

export const createApp = async (root, initialValue) => {
	const [value, setValue] = createSignal(initialValue);
	const dispose = render(() => h(Inspector, { value }), root);
	return {
		update(nextValue) {
			setValue(nextValue);
		},
		dispose,
	};
};
