import {
	cloneDataset,
	countDomNodes,
	createPatchPhases,
	createSnapshot,
	loadDataset,
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

export const createBenchmarkRunner = ({ framework, root, createApp }) => ({
	async run(options = {}) {
		const { captureSnapshots = false } = options;
		root.replaceChildren();
		const base = await loadDataset();
		const phases = createPatchPhases(base);
		const initialValue = cloneDataset(base);
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
		const app = await createApp(root, initialValue, options);
		await settle();
		const initialDuration = performance.now() - initialStartedAt;
		const initialNodeCount = countDomNodes(root);
		capture("initial");

		let current = initialValue;
		const phaseResults = [];
		for (const phase of phases) {
			const operationResults = [];
			for (const operation of phase.operations) {
				const next = cloneDataset(current);
				operation.apply(next);
				const duration = await measureUpdate(app.update, next);
				current = next;
				capture(`${phase.name}:${operation.name}`);
				operationResults.push({
					name: operation.name,
					duration,
				});
			}
			phaseResults.push({
				name: phase.name,
				totalDuration: operationResults.reduce(
					(total, operation) => total + operation.duration,
					0
				),
				meanDuration: mean(operationResults.map((_) => _.duration)),
				operations: operationResults,
			});
		}

		// Store app reference for external heap measurement before dispose
		if (typeof globalThis !== "undefined") {
			globalThis._benchmarkApp = app;
		}

		return {
			framework,
			dataset: {
				logCount: base.logs.length,
			},
			initial: {
				duration: initialDuration,
				nodeCount: initialNodeCount,
			},
			patches: {
				totalDuration: phaseResults.reduce(
					(total, phase) => total + phase.totalDuration,
					0
				),
				phases: phaseResults,
			},
			snapshots,
		};
	},
});

export const formatBenchmarkResult = (result) =>
	JSON.stringify(
		{
			framework: result.framework,
			logCount: result.dataset.logCount,
			initialMs: Number(result.initial.duration.toFixed(2)),
			patchTotalMs: Number(result.patches.totalDuration.toFixed(2)),
			phases: result.patches.phases.map((phase) => ({
				name: phase.name,
				totalMs: Number(phase.totalDuration.toFixed(2)),
				meanMs: Number(phase.meanDuration.toFixed(2)),
				operations: phase.operations.map((operation) => ({
					name: operation.name,
					ms: Number(operation.duration.toFixed(2)),
				})),
			})),
		},
		null,
		2
	);
