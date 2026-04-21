import { h, render } from "preact";

const getType = (value) =>
	value === undefined || value === null
		? "undefined"
		: value instanceof Map
			? "map"
			: Array.isArray(value)
				? "array"
				: typeof value;

const Inspector = ({ value }) => {
	switch (getType(value)) {
		case "object":
		case "map":
			return h(
				"ul",
				{ className: "comma curlies dim-ab" },
				Object.entries(value).map(([key, entryValue]) =>
					h(
						"li",
						{ className: "pl-2" },
						h("span", { className: "mono dim small" }, `${key}:`),
						" ",
						h(Inspector, { value: entryValue })
					)
				)
			);
		case "array":
			return h(
				"ul",
				{ className: "comma brackets dim-ab" },
				value.map((entryValue, index) =>
					h(
						"li",
						{ className: "pl-2" },
						h("span", { className: "mono dim small" }, `#${index}:`),
						" ",
						h(Inspector, { value: entryValue })
					)
				)
			);
		default:
			return h("span", null, `${value}`);
	}
};

export const createApp = async (root, initialValue) => {
	let currentValue = initialValue;
	const update = (nextValue) => {
		currentValue = nextValue;
		render(h(Inspector, { value: currentValue }), root);
	};
	update(currentValue);
	return {
		update,
		dispose() {
			render(null, root);
		},
	};
};
