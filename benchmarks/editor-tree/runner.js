import {
	buildDocumentForSize,
	cloneDocument,
	countDocumentNodes,
	countDomNodes,
	countTextCharacters,
	createPatchPhases,
	SIZE_NAMES,
	settle,
} from "./common.js";

const mean = (values) =>
	values.length
		? values.reduce((total, value) => total + value, 0) / values.length
		: 0;

const measureUpdate = async (update, nextValue) => {
	const startedAt = performance.now();
	update(nextValue);
	await settle();
	return performance.now() - startedAt;
};

const hashString = (text) => {
	let hash = 2166136261;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
};

const createSnapshot = (root) => {
	const structure = root.innerHTML;
	const text = root.textContent || "";
	return {
		structure,
		text,
		structureHash: hashString(structure),
		textHash: hashString(text),
	};
};

export const createBenchmarkRunner = ({ framework, root, createApp }) => ({
	async run(options = {}) {
		const { captureSnapshots = false } = options;
		const sizes = [];

		for (const sizeName of SIZE_NAMES) {
			root.replaceChildren();
			const base = buildDocumentForSize(sizeName);
			const phases = createPatchPhases(base);
			const initialValue = cloneDocument(base);
			const snapshots = [];

			const capture = (label) => {
				if (!captureSnapshots) {
					return;
				}
				snapshots.push({
					label,
					...createSnapshot(root),
				});
			};

			const initialStartedAt = performance.now();
			const app = await createApp(root, initialValue);
			await settle();
			const initialDuration = performance.now() - initialStartedAt;
			const initialNodeCount = countDomNodes(root);
			capture(`${sizeName}:initial`);

			let current = initialValue;
			const phaseResults = [];
			for (const phase of phases) {
				const operationResults = [];
				for (const operation of phase.operations) {
					const next = cloneDocument(current);
					operation.apply(next);
					const duration = await measureUpdate(app.update, next);
					current = next;
					capture(`${sizeName}:${phase.name}:${operation.name}`);
					operationResults.push({
						name: operation.name,
						duration,
					});
				}
				phaseResults.push({
					name: phase.name,
					totalDuration: operationResults.reduce(
						(total, operation) => total + operation.duration,
						0,
					),
					meanDuration: mean(operationResults.map((_) => _.duration)),
					operations: operationResults,
				});
			}

			app.dispose();
			sizes.push({
				name: sizeName,
				docNodeCount: countDocumentNodes(base),
				textLength: countTextCharacters(base),
				initial: {
					duration: initialDuration,
					nodeCount: initialNodeCount,
				},
				patches: {
					totalDuration: phaseResults.reduce(
						(total, phase) => total + phase.totalDuration,
						0,
					),
					phases: phaseResults,
				},
				snapshots,
			});
		}

		return {
			framework,
			sizes,
		};
	},
});

export const formatBenchmarkResult = (result) =>
	JSON.stringify(
		{
			framework: result.framework,
			sizes: result.sizes.map((size) => ({
				name: size.name,
				docNodeCount: size.docNodeCount,
				textLength: size.textLength,
				initialMs: Number(size.initial.duration.toFixed(2)),
				patchTotalMs: Number(size.patches.totalDuration.toFixed(2)),
				phases: size.patches.phases.map((phase) => ({
					name: phase.name,
					totalMs: Number(phase.totalDuration.toFixed(2)),
					meanMs: Number(phase.meanDuration.toFixed(2)),
					operations: phase.operations.map((operation) => ({
						name: operation.name,
						ms: Number(operation.duration.toFixed(2)),
					})),
				})),
			})),
		},
		null,
		2,
	);
