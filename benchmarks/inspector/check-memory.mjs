// Project: Select.js
// Author: Sebastien Pierre
// License: BSD
// Created: 2026-09-08
// Run: node --expose-gc --experimental-vm-modules benchmarks/inspector/check-memory.mjs
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import * as url from "node:url";
import { queryObjects } from "node:v8";
import { createContext, SourceTextModule, SyntheticModule } from "node:vm";
import { compareSnapshots } from "./verification.js";

const sourceURL = new URL("./run-compare.mjs", import.meta.url);
const source = fs.readFileSync(sourceURL, "utf8");
const frameworks = ["preact", "solidjs", "selectui"];

class Snapshot {
	label = "initial";
	structure = "tree";
	text = "text";
}
class VerificationResult {
	snapshots = [new Snapshot()];
}

for (const failure of [null, "mismatch", "run", "dispose"]) {
	const calls = [];
	const imports = [];
	const output = [];
	let closed = 0;
	let removed = 0;
	let disposed = 0;
	let heapChecks = 0;
	let finish;
	const finished = new Promise((resolve) => {
		finish = resolve;
	});
	class Window {
		document = {
			createElement: () => ({
				remove() {
					removed++;
				},
			}),
			body: { appendChild() {} },
		};
		requestAnimationFrame() {}
		happyDOM = {
			async close() {
				closed++;
			},
		};
	}
	const context = createContext({
		console: { log: (line) => output.push(line), error() {} },
		process: {
			execArgv: ["--conditions=browser"],
			exit: finish,
			memoryUsage() {
				assert.deepEqual(
					calls.slice(0, 3),
					frameworks.map((name) => [name, true]),
				);
				assert.deepEqual(imports, frameworks);
				// queryObjects forces GC and counts live instances, without WeakRef keep-alive.
				globalThis.gc();
				assert.equal(
					queryObjects(VerificationResult),
					0,
					"verification result retained",
				);
				assert.equal(
					queryObjects(Snapshot),
					0,
					"verification snapshot retained",
				);
				heapChecks++;
				return process.memoryUsage();
			},
		},
		gc: globalThis.gc,
	});
	context.global = context;
	const modules = new Map();
	async function load(specifier) {
		if (modules.has(specifier)) return modules.get(specifier);
		let exports;
		if (specifier.startsWith("./frameworks/")) {
			assert(context.document, "adapter import must follow window setup");
			const name = path.basename(specifier, ".js");
			imports.push(name);
			exports = {
				async createApp() {
					return {
						dispose() {
							disposed++;
							if (failure === "dispose" && name === "solidjs")
								throw new Error("dispose");
						},
					};
				},
			};
		} else {
			exports = {
				"node:fs": { default: fs },
				"node:path": { default: path },
				"node:url": url,
				"happy-dom": { Window },
				"./verification.js": { compareSnapshots },
				"./runner.js": {
					createBenchmarkRunner: ({ framework, root, createApp }) => ({
						async run({ captureSnapshots }) {
							calls.push([framework, captureSnapshots]);
							await createApp(root, {});
							if (failure === "run" && framework === "solidjs")
								throw new Error("run");
							if (captureSnapshots) {
								const result = new VerificationResult();
								if (failure === "mismatch" && framework === "solidjs")
									result.snapshots[0].text = "wrong";
								return result;
							}
							return {
								dataset: { logCount: 1000 },
								initial: { duration: 1, nodeCount: 42 },
								patches: {
									totalDuration: 2,
									phases: [{ name: "patch", totalDuration: 2 }],
								},
								snapshots: [],
							};
						},
					}),
				},
			}[specifier];
		}
		assert(exports, `Unexpected import: ${specifier}`);
		const module = new SyntheticModule(
			Object.keys(exports),
			function () {
				for (const [name, value] of Object.entries(exports))
					this.setExport(name, value);
			},
			{ context },
		);
		modules.set(specifier, module);
		await module.link(load);
		await module.evaluate();
		return module;
	}
	const module = new SourceTextModule(source, {
		context,
		initializeImportMeta(meta) {
			meta.url = sourceURL.href;
		},
		importModuleDynamically: load,
	});
	await module.link(load);
	await module.evaluate();
	assert.equal(await finished, failure ? 1 : 0);
	assert.equal(context._benchmarkApp, null);
	assert.equal(closed, calls.length);
	assert.equal(removed, calls.length);
	assert.equal(disposed, calls.length);
	if (failure) {
		assert.deepEqual(calls, [
			["preact", true],
			["solidjs", true],
		]);
		assert.equal(heapChecks, 0, "failed verification must not measure");
		assert(!output.includes("\n=== Benchmark Comparison ===\n"));
	} else {
		assert.deepEqual(
			calls.slice(3),
			frameworks.flatMap((name) =>
				Array.from({ length: 5 }, () => [name, false]),
			),
		);
		assert.equal(heapChecks, 33);
		const summary = JSON.parse(
			output[output.indexOf("\n=== Benchmark Comparison ===\n") + 1],
		);
		assert.deepEqual(
			summary.map(({ framework, runs, phases }) => [framework, runs, phases]),
			[
				["preact", 5, { patch: 2 }],
				["solidjs", 5, { patch: 2 }],
				["ui", 5, { patch: 2 }],
			],
		);
	}
}
console.log(
	"Verification release (explicit GC), ordering, five-run summaries, and failure cleanup passed",
);
// EOF
