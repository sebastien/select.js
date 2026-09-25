import ui, { format } from "../../src/js/select/ui/index.js";

const choices = [
	{ value: "none", label: "—" },
	{ value: "small", label: "Small" },
	{ value: "medium", label: "Medium" },
	{ value: "large", label: "Large" },
	{ value: "full", label: "Full" },
];

const properties = [
	["Layout", ["Flow", "Align", "Gap", "Wrap", "Position", "Display", "Box"]],
	["Size", ["Fit", "Minimum", "Maximum", "Width", "Height", "Overflow"]],
	["Color", ["Foreground", "Background", "Tint", "Blend", "Opacity"]],
	["Spacing", ["Padding", "Padding top", "Padding right", "Padding bottom", "Padding left", "Margin", "Margin top", "Margin right", "Margin bottom", "Margin left", "Radius", "Shadow"]],
	["Border", ["Sides", "Width", "Style", "Outline width"]],
	["Type", ["Weight", "Family", "Text size", "Align", "Italic", "Underline", "Nowrap", "Ellipsis", "Visibility"]],
].map(([section, labels]) => ({
	section,
	fields: labels.map((label, index) => ({
		id: `${section.toLowerCase()}-${index}`,
		label,
		value: choices[(index + labels.length) % choices.length].value,
		choices,
	})),
}));

const Choice = ui(`<label class="row middle g-1"><input type="radio" out="checked" /><span out="label"></span></label>`);
format("Choice", Choice);

const Field = ui(`<div class="row middle g-1"><label class="small ellipsis" out="label"></label><div class="selector compact small row wrap g-0 fill" out="choices|*Choice"></div></div>`)
	.does({
		label: (_self, { label }) => label,
		choices: (_self, { choices, value }) => choices.map((choice) => ({
			...choice,
			checked: choice.value === value,
		})),
	});
format("Field", Field);

const Section = ui(`<section class="stack g-1"><h3 class="small b" out="section"></h3><div class="stack g-1" out="fields|*Field"></div></section>`)
	.does({
		section: (_self, { section }) => section,
		fields: (_self, { fields }) => fields,
	});
format("Section", Section);

const DocumentProperties = ui(`<article class="stack g-2 p-2 bd rounded"><header class="row middle g-1"><strong class="b" out="name"></strong><span class="fill"></span><span class="mono small" out="box"></span></header><div class="stack g-2" out="sections|*Section"></div></article>`)
	.does({
		name: (_self, { selected }) => selected.name,
		box: (_self, { selected }) => `${selected.box.x}:${selected.box.y} ${selected.box.width}×${selected.box.height}`,
		sections: (_self, { sections }) => sections,
	});

const selected = {
	name: "Document",
	box: { x: 24, y: 48, width: 640, height: 480 },
};
const root = document.querySelector("#BenchmarkRoot");
const output = document.querySelector("#Output");

const nextFrame = () => new Promise((resolve) => requestAnimationFrame(() => resolve()));

window.runDocumentPropertiesRenderBenchmark = async ({ runs = 10, warmup = 2 } = {}) => {
	if (!Number.isInteger(runs) || runs < 1 || !Number.isInteger(warmup) || warmup < 0) {
		throw new RangeError("runs must be >= 1 and warmup must be >= 0");
	}
	const mountSamples = [];
	const settledSamples = [];
	let nodeCount = 0;
	for (let index = 0; index < warmup + runs; index += 1) {
		root.replaceChildren();
		const startedAt = performance.now();
		const instance = DocumentProperties.new(null, { data: { selected, sections: properties } });
		instance.mount(root);
		const mountDuration = performance.now() - startedAt;
		await nextFrame();
		const settledDuration = performance.now() - startedAt;
		nodeCount = root.querySelectorAll("*").length;
		instance.unmount();
		if (index >= warmup) {
			mountSamples.push(mountDuration);
			settledSamples.push(settledDuration);
		}
	}
	const stats = (values) => {
		const sorted = [...values].sort((a, b) => a - b);
		return {
			meanMs: values.reduce((sum, value) => sum + value, 0) / values.length,
			medianMs: sorted[Math.floor(sorted.length / 2)],
			minMs: sorted[0],
			maxMs: sorted.at(-1),
			samplesMs: values,
		};
	};
	const result = {
		benchmark: "document-properties-render",
		warmup,
		runs,
		mount: stats(mountSamples),
		mountToFrame: stats(settledSamples),
		domNodes: nodeCount,
	};
	output.textContent = JSON.stringify(result, null, 2);
	return result;
};

output.textContent = "Ready — run window.runDocumentPropertiesRenderBenchmark() in the console.";
if (new URLSearchParams(location.search).get("autorun") === "1") {
	await window.runDocumentPropertiesRenderBenchmark();
}
