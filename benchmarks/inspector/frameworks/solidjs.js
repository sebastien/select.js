import { createMemo, For } from "solid-js";
import h from "solid-js/h/dist/h.js";
import { createStore, reconcile } from "solid-js/store/dist/store.js";
import { render } from "solid-js/web/dist/web.js";

const getType = (value) =>
	value === undefined || value === null
		? "undefined"
		: value instanceof Map
			? "map"
			: Array.isArray(value)
				? "array"
				: typeof value;

const Inspector = (props) => {
	const type = createMemo(() => {
		const type = getType(props.value);
		return type === "object" || type === "map" || type === "array"
			? type
			: "scalar";
	});
	return () => {
		switch (type()) {
			case "object":
			case "map":
			case "array":
				return h(
					"ul",
					{
						className: `comma ${type() === "array" ? "brackets" : "curlies"} dim-ab`,
					},
					// Instantiate each thunk in For's item owner, not its list effect.
					h(For, { each: () => Object.keys(props.value ?? {}) }, (key) =>
						h(
							"li",
							{ className: "pl-2" },
							h(
								"span",
								{ className: "mono dim small" },
								`${type() === "array" ? "#" : ""}${key}:`,
							),
							" ",
							h(Inspector, { value: () => props.value?.[key] }),
						)(),
					),
				);
			default:
				return h("span", null, () => `${props.value}`);
		}
	};
};

export const createApp = async (root, initialValue) => {
	const [state, setState] = createStore({ value: initialValue });
	const dispose = render(
		() => h(Inspector, { value: () => state.value }),
		root,
	);
	return {
		update(nextValue) {
			// Positional diffing preserves nodes across the benchmark's deep clones.
			setState(reconcile({ value: nextValue }, { key: null, merge: true }));
		},
		dispose,
	};
};
