import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Window } from "happy-dom";
import { compareSnapshots } from "./verification.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const FRAMEWORKS = ["preact", "solidjs", "selectui"];
const FRAMEWORK_LABELS = {
	preact: "preact",
	solidjs: "solidjs",
	selectui: "ui",
};
const RUNS = 5;
const originalFetch = globalThis.fetch;
let baseline;

function setupGlobals(window) {
	const g = global;
	g.window = window;
	g.document = window.document;
	g.Node = window.Node;
	g.Element = window.Element;
	g.DocumentFragment = window.DocumentFragment;
	g.Text = window.Text;
	g.Comment = window.Comment;
	g.Document = window.Document;
	g.DOMParser = window.DOMParser;
	g.MutationObserver = window.MutationObserver;
	g.requestAnimationFrame = window.requestAnimationFrame.bind(window);
	g.NodeFilter = window.NodeFilter;
	g.SVGElement = window.SVGElement;

	const asJsonFileResponse = (filePath) => {
		const text = fs.readFileSync(filePath, "utf-8");
		return Promise.resolve({
			ok: true,
			status: 200,
			json: () => Promise.resolve(JSON.parse(text)),
			text: () => Promise.resolve(text),
		});
	};

	g.fetch = (url, ...args) => {
		if (typeof url === "string") {
			if (url.startsWith("../../")) {
				const filePath = path.join(ROOT, url.replace(/^\.\.\/\.\.\//, ""));
				if (fs.existsSync(filePath)) {
					return asJsonFileResponse(filePath);
				}
			}
			if (url.startsWith("./")) {
				const filePath = path.join(
					ROOT,
					"benchmarks/inspector",
					url.replace(/^\.\//, ""),
				);
				if (fs.existsSync(filePath)) {
					return asJsonFileResponse(filePath);
				}
			}
		}

		if (originalFetch) {
			return originalFetch(url, ...args);
		}

		return Promise.reject(new Error(`Unsupported fetch URL: ${String(url)}`));
	};
}

const createBenchWindow = () =>
	new Window({
		url: "http://localhost:8001/benchmarks/inspector/",
	});

function gc() {
	if (global.gc) {
		global.gc();
	}
}

function heapMB() {
	const usage = process.memoryUsage();
	return usage.heapUsed / 1024 / 1024;
}

async function runFramework(name) {
	const { createBenchmarkRunner } = await import("./runner.js");

	const results = [];
	let heapPeak = 0;
	let heapBeforeAll = 0;
	let nodeCount = 0;

	// Verify separately so snapshot allocations do not enter measured runs.
	for (let i = -1; i < RUNS; i++) {
		const window = createBenchWindow();
		setupGlobals(window);
		const root = window.document.createElement("div");
		window.document.body.appendChild(root);

		gc();
		const heapBefore = heapMB();
		if (i === 0) heapBeforeAll = heapBefore;

		try {
			const { createApp } = await import(`./frameworks/${name}.js`);
			const runner = createBenchmarkRunner({
				framework: name,
				root,
				createApp,
			});

			const result = await runner.run({ captureSnapshots: i === -1 });
			if (i === -1) {
				if (name === "preact") baseline = result;
				const verification = compareSnapshots(baseline, result);
				console.log(
					JSON.stringify({
						framework: name,
						checkpoints: result.snapshots.length,
						...verification,
					}),
				);
				if (!verification.ok) throw new Error("Inspector verification failed");
				continue;
			}
			results.push(result);

			const heapAfter = heapMB();
			if (heapAfter > heapPeak) heapPeak = heapAfter;
			nodeCount = result.initial.nodeCount;
		} finally {
			globalThis._benchmarkApp?.dispose?.();
			globalThis._benchmarkApp = null;
			root.remove();
			await window.happyDOM.close();
			gc();
		}
	}

	const get = (obj, path) =>
		path.split(".").reduce((o, k) => (o ? o[k] : undefined), obj);
	const avg = (path) =>
		results.reduce((sum, r) => sum + (get(r, path) || 0), 0) / results.length;
	const avgInitial = avg("initial.duration");
	const avgPatch = avg("patches.totalDuration");

	const phases = {};
	for (const phase of results[0].patches.phases) {
		phases[phase.name] =
			results.reduce(
				(sum, r) =>
					sum +
					r.patches.phases.find((p) => p.name === phase.name).totalDuration,
				0,
			) / results.length;
	}

	gc();
	const heapFinal = heapMB();

	return {
		framework: FRAMEWORK_LABELS[name],
		runs: RUNS,
		logs: results[0].dataset.logCount,
		initialMs: Number(avgInitial.toFixed(2)),
		patchTotalMs: Number(avgPatch.toFixed(2)),
		heapBeforeMB: Number(heapBeforeAll.toFixed(2)),
		heapPeakMB: Number(heapPeak.toFixed(2)),
		heapAfterMB: Number(heapFinal.toFixed(2)),
		heapDeltaMB: Number((heapPeak - heapBeforeAll).toFixed(2)),
		nodeCount,
		phases: Object.fromEntries(
			Object.entries(phases).map(([k, v]) => [k, Number(v.toFixed(2))]),
		),
	};
}

async function main() {
	if (!process.execArgv.includes("--conditions=browser")) {
		throw new Error(
			"Run with node --conditions=browser or bun run bench:inspector:happy",
		);
	}
	const summary = [];
	for (const fw of FRAMEWORKS) {
		console.log(`Running ${fw}...`);
		try {
			summary.push(await runFramework(fw));
		} catch (err) {
			console.error(`  ${fw} failed:`, err.message);
			summary.push({
				framework: FRAMEWORK_LABELS[fw],
				runs: RUNS,
				logs: 1000,
				error: err.message,
			});
		}
	}

	console.log("\n=== Benchmark Comparison ===\n");
	console.log(JSON.stringify(summary, null, 2));

	// Also print a markdown table
	console.log(
		"\n| Framework | Initial | Patch Total | Heap Peak | Heap Delta | Node Count |",
	);
	console.log(
		"|-----------|---------|-------------|-----------|------------|------------|",
	);
	for (const r of summary) {
		if (r.error) {
			console.log(
				`| ${r.framework.padEnd(9)} | ${"ERROR".padEnd(7)} | ${r.error.slice(0, 30).padEnd(11)} |`,
			);
		} else {
			console.log(
				`| ${r.framework.padEnd(9)} | ${String(r.initialMs).padEnd(7)}ms | ${String(r.patchTotalMs).padEnd(11)}ms | ${String(r.heapPeakMB).padEnd(9)}MB | ${String(r.heapDeltaMB).padEnd(10)}MB | ${String(r.nodeCount).padEnd(10)} |`,
			);
		}
	}

	process.exit(summary.some((result) => result.error) ? 1 : 0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
