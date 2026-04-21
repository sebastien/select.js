import { render } from "solid-js/web/dist/web.js";
import { createStore, reconcile } from "solid-js/store/dist/store.js";
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
				...Object.keys(value).map((key) =>
					h(
						"li",
						{ className: "pl-2" },
						h("span", { className: "mono dim small" }, `${key}:`),
						" ",
						h(Inspector, { value: () => value[key] })
					)
				)
			);
		case "array":
			return h(
				"ul",
				{ className: "comma brackets dim-ab" },
				...value.map((_, index) =>
					h(
						"li",
						{ className: "pl-2" },
						h("span", { className: "mono dim small" }, `#${index}:`),
						" ",
						h(Inspector, { value: () => value[index] })
					)
				)
			);
		default:
			return h("span", null, `${value}`);
	}
};

export const createApp = async (root, initialValue, options = {}) => {
	if (options.captureSnapshots === true) {
		let currentValue = initialValue;
		let dispose = render(() => h(Inspector, { value: currentValue }), root);
		return {
			update(nextValue) {
				currentValue = nextValue;
				dispose();
				dispose = render(() => h(Inspector, { value: currentValue }), root);
			},
			dispose() {
				dispose();
			},
		};
	}

	const [value, setValue] = createStore(initialValue);
	const dispose = render(() => h(Inspector, { value }), root);
	return {
		update(nextValue) {
			setValue(reconcile(nextValue));
		},
		dispose,
	};
};
