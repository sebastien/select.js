import http from "node:http";
import { mkdir, readFile, readdir, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const INSPECTOR_RESULTS_DIR = path.join(repoRoot, "tests", "data");
const INSPECTOR_RESULTS_PREFIX = "benchmark-inspector";

const MIME_TYPES = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".mjs": "text/javascript; charset=utf-8",
	".svg": "image/svg+xml",
	".xml": "application/xml; charset=utf-8",
};

const FRAMEWORKS = ["preact", "solidjs", "selectui"];
const FRAMEWORK_LABELS = {
	preact: "preact",
	solidjs: "solidjs",
	selectui: "select.ui",
};

const round = (value) => Number(value.toFixed(2));
const roundNullable = (value) =>
	Number.isFinite(value) ? Number(value.toFixed(2)) : null;
const bytesToMb = (value) => value / (1024 * 1024);

const compareSnapshots = (baseline, candidate) => {
	const baselineByLabel = new Map(
		(baseline.snapshots || []).map((snapshot) => [snapshot.label, snapshot]),
	);
	const candidateByLabel = new Map(
		(candidate.snapshots || []).map((snapshot) => [snapshot.label, snapshot]),
	);
	const labels = [...baselineByLabel.keys()];
	const mismatches = [];
	for (const label of labels) {
		const expected = baselineByLabel.get(label);
		const actual = candidateByLabel.get(label);
		if (!actual) {
			mismatches.push({ label, reason: "missing checkpoint" });
			continue;
		}
		if (
			expected.structureHash !== actual.structureHash ||
			expected.textHash !== actual.textHash
		) {
			mismatches.push({
				label,
				reason: "hash mismatch",
				expected: {
					structureHash: expected.structureHash,
					textHash: expected.textHash,
				},
				actual: {
					structureHash: actual.structureHash,
					textHash: actual.textHash,
				},
			});
		}
	}
	return {
		ok: mismatches.length === 0,
		mismatches,
	};
};

const parseArgs = (argv) => {
	const options = {
		runs: 5,
		headed: false,
		save: true,
	};
	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		if (arg === "--runs" && argv[i + 1]) {
			options.runs = Number.parseInt(argv[++i], 10);
		} else if (arg === "--headed") {
			options.headed = true;
		} else if (arg === "--save") {
			options.save = true;
		} else if (arg === "--no-save") {
			options.save = false;
		}
	}
	return options;
};

const isoTimestampForFile = (date = new Date()) => {
	const pad = (value) => `${value}`.padStart(2, "0");
	return `${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(date.getUTCDate())}${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(date.getUTCSeconds())}`;
};

const readJson = async (filePath) =>
	JSON.parse(await readFile(filePath, "utf8"));

const writeJson = async (filePath, value) =>
	writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");

const getLatestInspectorSnapshotPath = async () => {
	let files;
	try {
		files = await readdir(INSPECTOR_RESULTS_DIR);
	} catch {
		return null;
	}
	const candidates = files
		.filter(
			(file) =>
				file.startsWith(`${INSPECTOR_RESULTS_PREFIX}-`) &&
				file.endsWith(".json"),
		)
		.sort();
	if (!candidates.length) {
		return null;
	}
	return path.join(INSPECTOR_RESULTS_DIR, candidates[candidates.length - 1]);
};

const ensureInsideRoot = (pathname) => {
	const filePath = path.resolve(repoRoot, `.${pathname}`);
	if (!filePath.startsWith(repoRoot)) {
		throw new Error("Path escapes repository root");
	}
	return filePath;
};

const serveFile = async (pathname) => {
	let filePath = ensureInsideRoot(pathname);
	let fileStat = await stat(filePath).catch(() => null);
	if (fileStat?.isDirectory()) {
		filePath = path.join(filePath, "index.html");
		fileStat = await stat(filePath).catch(() => null);
	}
	if (!fileStat?.isFile()) {
		return null;
	}
	return {
		body: await readFile(filePath),
		contentType:
			MIME_TYPES[path.extname(filePath)] || "application/octet-stream",
	};
};

const createServer = () =>
	http.createServer(async (request, response) => {
		const url = new URL(request.url, "http://127.0.0.1");
		const file = await serveFile(url.pathname).catch(() => null);
		if (!file) {
			response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
			response.end("Not found");
			return;
		}
		response.writeHead(200, { "content-type": file.contentType });
		response.end(file.body);
	});

const average = (values) =>
	values.length
		? values.reduce((total, value) => total + value, 0) / values.length
		: 0;

const averageDefined = (values) => {
	const numericValues = values.filter((value) => Number.isFinite(value));
	return numericValues.length ? average(numericValues) : null;
};

const getUsedHeapBytes = async (cdpSession) => {
	try {
		const heapUsage = await cdpSession.send("Runtime.getHeapUsage");
		if (Number.isFinite(heapUsage?.usedSize)) {
			return heapUsage.usedSize;
		}
	} catch {
		// Ignore and fallback to Performance metrics.
	}

	try {
		await cdpSession.send("Performance.enable").catch(() => null);
		const metrics = await cdpSession.send("Performance.getMetrics");
		const heapMetric = metrics?.metrics?.find(
			(metric) => metric.name === "JSHeapUsedSize",
		);
		if (Number.isFinite(heapMetric?.value)) {
			return heapMetric.value;
		}
	} catch {
		// Ignore: metrics are optional and benchmark should continue.
	}

	return null;
};

const collectGarbage = async (cdpSession) => {
	try {
		await cdpSession.send("HeapProfiler.collectGarbage");
	} catch {
		// Ignore: GC trigger is best-effort.
	}
};

const runBenchmarkWithHeap = async (page) => {
	const cdpSession = await page
		.context()
		.newCDPSession(page)
		.catch(() => null);
	if (cdpSession) {
		await collectGarbage(cdpSession);
	}
	const heapBeforeBytes = cdpSession
		? await getUsedHeapBytes(cdpSession)
		: null;
	const result = await page.evaluate(() => window.runInspectorBenchmark());
	// Measure peak heap while the rendered tree is still alive
	const heapPeakBytes = cdpSession ? await getUsedHeapBytes(cdpSession) : null;
	// Dispose and force GC to measure retained (leaked) memory
	await page.evaluate(() => globalThis._benchmarkApp?.dispose?.());
	if (cdpSession) {
		await collectGarbage(cdpSession);
	}
	const heapAfterBytes = cdpSession ? await getUsedHeapBytes(cdpSession) : null;
	if (cdpSession) {
		await cdpSession.detach().catch(() => null);
	}
	const heapDeltaBytes =
		Number.isFinite(heapBeforeBytes) && Number.isFinite(heapPeakBytes)
			? heapPeakBytes - heapBeforeBytes
			: null;
	return {
		...result,
		heap: {
			beforeBytes: heapBeforeBytes,
			peakBytes: heapPeakBytes,
			afterBytes: heapAfterBytes,
			deltaBytes: heapDeltaBytes,
		},
	};
};

const summarizeRuns = (framework, runs) => {
	const phaseNames = runs[0]?.patches.phases.map((phase) => phase.name) || [];
	const phases = Object.fromEntries(
		phaseNames.map((name) => [
			name,
			round(
				average(
					runs.map(
						(run) =>
							run.patches.phases.find((phase) => phase.name === name)
								?.totalDuration || 0,
					),
				),
			),
		]),
	);
	return {
		framework: FRAMEWORK_LABELS[framework] || framework,
		runs: runs.length,
		logs: runs[0]?.dataset.logCount || 0,
		initialMs: round(average(runs.map((run) => run.initial.duration))),
		patchTotalMs: round(average(runs.map((run) => run.patches.totalDuration))),
		heapBeforeMB: roundNullable(
			bytesToMb(averageDefined(runs.map((run) => run.heap?.beforeBytes))),
		),
		heapPeakMB: roundNullable(
			bytesToMb(averageDefined(runs.map((run) => run.heap?.peakBytes))),
		),
		heapAfterMB: roundNullable(
			bytesToMb(averageDefined(runs.map((run) => run.heap?.afterBytes))),
		),
		heapDeltaMB: roundNullable(
			bytesToMb(averageDefined(runs.map((run) => run.heap?.deltaBytes))),
		),
		nodeCount: round(average(runs.map((run) => run.initial.nodeCount))),
		phases,
	};
};

const summarizeVerification = (results) =>
	results.map((result) => ({
		framework: result.framework,
		ok: result.ok,
		mismatches: result.mismatches.length,
		firstMismatch: result.mismatches[0] || null,
	}));

const compareSummarySets = (currentSummaries, previousSummaries) => {
	if (!Array.isArray(previousSummaries) || !previousSummaries.length) {
		return [];
	}
	const previousByFramework = new Map(
		previousSummaries.map((_) => [_.framework, _]),
	);
	const rows = [];
	for (const current of currentSummaries) {
		const previous = previousByFramework.get(current.framework);
		if (!previous) {
			continue;
		}
		rows.push({
			framework: current.framework,
			patchTotalMsDelta: round(current.patchTotalMs - previous.patchTotalMs),
			initialMsDelta: round(current.initialMs - previous.initialMs),
			heapDeltaMbDelta: roundNullable(
				(current.heapDeltaMB ?? NaN) - (previous.heapDeltaMB ?? NaN),
			),
		});
	}
	return rows;
};

const formatDeltaTable = (rows) => {
	if (!rows.length) {
		return "No previous inspector snapshot to compare.";
	}
	const headers = [
		"framework",
		"patchTotalMsDelta",
		"initialMsDelta",
		"heapDeltaMbDelta",
	];
	const normalizedRows = rows.map((row) => ({
		framework: `${row.framework}`,
		patchTotalMsDelta: `${row.patchTotalMsDelta}`,
		initialMsDelta: `${row.initialMsDelta}`,
		heapDeltaMbDelta: `${row.heapDeltaMbDelta ?? "n/a"}`,
	}));
	const widths = Object.fromEntries(
		headers.map((header) => [
			header,
			Math.max(
				header.length,
				...normalizedRows.map((row) => `${row[header] ?? ""}`.length),
			),
		]),
	);
	return [
		headers.map((header) => header.padEnd(widths[header])).join("  "),
		headers.map((header) => "-".repeat(widths[header])).join("  "),
		...normalizedRows.map((row) =>
			headers
				.map((header) => `${row[header] ?? ""}`.padEnd(widths[header]))
				.join("  "),
		),
	].join("\n");
};

const formatSummaryTable = (summaries) => {
	const phaseNames = [
		...new Set(summaries.flatMap((summary) => Object.keys(summary.phases))),
	];
	const rows = summaries.map((summary) => ({
		framework: summary.framework,
		initialMs: `${summary.initialMs}`,
		patchTotalMs: `${summary.patchTotalMs}`,
		heapBeforeMB: `${summary.heapBeforeMB ?? "n/a"}`,
		heapPeakMB: `${summary.heapPeakMB ?? "n/a"}`,
		heapAfterMB: `${summary.heapAfterMB ?? "n/a"}`,
		heapDeltaMB: `${summary.heapDeltaMB ?? "n/a"}`,
		nodeCount: `${summary.nodeCount}`,
		...Object.fromEntries(
			phaseNames.map((name) => [name, `${summary.phases[name] ?? 0}`]),
		),
	}));
	const headers = [
		"framework",
		"initialMs",
		"patchTotalMs",
		"heapBeforeMB",
		"heapPeakMB",
		"heapAfterMB",
		"heapDeltaMB",
		...phaseNames,
		"nodeCount",
	];
	const widths = Object.fromEntries(
		headers.map((header) => [
			header,
			Math.max(
				header.length,
				...rows.map((row) => `${row[header] ?? ""}`.length),
			),
		]),
	);
	return [
		headers.map((header) => header.padEnd(widths[header])).join("  "),
		headers.map((header) => "-".repeat(widths[header])).join("  "),
		...rows.map((row) =>
			headers
				.map((header) => `${row[header] ?? ""}`.padEnd(widths[header]))
				.join("  "),
		),
	].join("\n");
};

const main = async () => {
	const options = parseArgs(process.argv.slice(2));
	const playwright = await import("playwright").catch(() => null);
	if (!playwright) {
		console.error(
			"Missing dependency: playwright. Run `npm install` before `npm run bench:inspector`.",
		);
		process.exitCode = 1;
		return;
	}

	const server = createServer();
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	const address = server.address();
	const baseUrl = `http://127.0.0.1:${address.port}`;
	const browser = await playwright.chromium.launch({
		headless: !options.headed,
	});

	try {
		const previousSnapshotPath = await getLatestInspectorSnapshotPath();
		const previousSnapshot = previousSnapshotPath
			? await readJson(previousSnapshotPath).catch(() => null)
			: null;
		const summaries = [];
		const verificationRuns = [];
		for (const framework of FRAMEWORKS) {
			const runs = [];
			for (let i = 0; i < options.runs; i++) {
				const page = await browser.newPage();
				await page.goto(
					`${baseUrl}/benchmarks/inspector/index.html?framework=${framework}`,
					{ waitUntil: "networkidle" },
				);
				await page.waitForFunction(() => window.runInspectorBenchmark);
				const result = await runBenchmarkWithHeap(page);
				runs.push(result);
				await page.close();
			}
			summaries.push(summarizeRuns(framework, runs));

			const verificationPage = await browser.newPage();
			await verificationPage.goto(
				`${baseUrl}/benchmarks/inspector/index.html?framework=${framework}`,
				{ waitUntil: "networkidle" },
			);
			await verificationPage.waitForFunction(
				() => window.runInspectorBenchmark,
			);
			const verification = await verificationPage.evaluate(() =>
				window.runInspectorBenchmark({ captureSnapshots: true }),
			);
			verificationRuns.push(verification);
			await verificationPage.close();
		}

		const baseline = verificationRuns.find(
			(result) => result.framework === "preact",
		);
		const verificationSummary = verificationRuns.map((result) => ({
			framework: FRAMEWORK_LABELS[result.framework] || result.framework,
			...compareSnapshots(baseline, result),
		}));
		const summaryVerification = summarizeVerification(verificationSummary);
		const comparison = compareSummarySets(summaries, previousSnapshot?.summary);
		const report = {
			meta: {
				generatedAt: new Date().toISOString(),
				runs: options.runs,
				frameworks: FRAMEWORKS,
			},
			summary: summaries,
			verification: summaryVerification,
			comparison,
		};

		console.log(
			`Inspector benchmark across ${summaries[0]?.logs || 0} logs, ${options.runs} run(s) per framework.\n`,
		);
		console.log(formatSummaryTable(summaries));
		console.log("\nVerification:");
		console.log(JSON.stringify(summaryVerification, null, 2));
		console.log("\nDelta vs previous inspector snapshot:");
		console.log(formatDeltaTable(comparison));
		console.log("\nRaw summary:");
		console.log(JSON.stringify(summaries, null, 2));

		if (options.save) {
			await mkdir(INSPECTOR_RESULTS_DIR, { recursive: true });
			const stamp = isoTimestampForFile(new Date(report.meta.generatedAt));
			const outputPath = path.join(
				INSPECTOR_RESULTS_DIR,
				`${INSPECTOR_RESULTS_PREFIX}-${stamp}.json`,
			);
			await writeJson(outputPath, report);
			console.log(
				`\nSaved inspector snapshot to ${path.relative(repoRoot, outputPath)}`,
			);
		}
	} finally {
		await browser.close();
		await new Promise((resolve, reject) =>
			server.close((error) => (error ? reject(error) : resolve())),
		);
	}
};

await main();
