import { createSignal } from "https://esm.sh/solid-js";
import h from "https://esm.sh/solid-js/h";
import { render } from "https://esm.sh/solid-js/web";

const renderDocumentNode = (node) => {
	if (!node || typeof node !== "object") {
		return "";
	}
	if (node.type === "text") {
		return node.value || "";
	}
	if (node.type !== "element" || typeof node.tag !== "string") {
		return "";
	}
	const attrs = node.attrs || null;
	const children = (node.children || []).map((child) =>
		renderDocumentNode(child),
	);
	return h(node.tag, attrs, ...children);
};

const DocumentTree = (props) => {
	const node = typeof props.value === "function" ? props.value() : props.value;
	return renderDocumentNode(node);
};

export const createApp = async (root, initialValue) => {
	const [value, setValue] = createSignal(initialValue);
	const dispose = render(() => h(DocumentTree, { value }), root);
	return {
		update(nextValue) {
			setValue(nextValue);
		},
		dispose,
	};
};
