import { readFile, stat } from "node:fs/promises";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const mimeTypes = {
	".css": "text/css; charset=utf-8",
	".html": "text/html; charset=utf-8",
	".js": "text/javascript; charset=utf-8",
	".json": "application/json; charset=utf-8",
	".svg": "image/svg+xml",
};

const parseArgs = (args) => {
	const options = { runs: 10, warmup: 2, headed: false };
	for (let index = 0; index < args.length; index += 1) {
		if (args[index] === "--runs") options.runs = Number.parseInt(args[++index], 10);
		else if (args[index] === "--warmup") options.warmup = Number.parseInt(args[++index], 10);
		else if (args[index] === "--headed") options.headed = true;
		else if (args[index] === "--help" || args[index] === "-h") options.help = true;
		else throw new Error(`Unknown option: ${args[index]}`);
	}
	if (!Number.isInteger(options.runs) || options.runs < 1) throw new Error("--runs must be a positive integer");
	if (!Number.isInteger(options.warmup) || options.warmup < 0) throw new Error("--warmup must be a non-negative integer");
	return options;
};

const serve = async (pathname) => {
	let filePath = path.resolve(repoRoot, `.${decodeURIComponent(pathname)}`);
	if (filePath !== repoRoot && !filePath.startsWith(`${repoRoot}${path.sep}`)) return null;
	const info = await stat(filePath).catch(() => null);
	if (info?.isDirectory()) filePath = path.join(filePath, "index.html");
	const file = await readFile(filePath).catch(() => null);
	return file && {
		body: file,
		contentType: mimeTypes[path.extname(filePath)] ?? "application/octet-stream",
	};
};

const main = async () => {
	const options = parseArgs(process.argv.slice(2));
	if (options.help) {
		console.log("Usage: node benchmarks/document-properties/run.mjs [--runs N] [--warmup N] [--headed]");
		return;
	}
	const playwright = await import("playwright").catch(() => null);
	if (!playwright) throw new Error("Missing dependency: install the select.js dev dependencies (bun install) to use Playwright.");

	const server = http.createServer(async (request, response) => {
		const { pathname } = new URL(request.url, "http://127.0.0.1");
		const file = await serve(pathname);
		if (!file) {
			response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
			response.end("Not found");
			return;
		}
		response.writeHead(200, { "content-type": file.contentType });
		response.end(file.body);
	});
	await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
	let browser;
	try {
		browser = await playwright.chromium.launch({ headless: !options.headed, args: ["--disable-gpu"] });
		const page = await browser.newPage();
		const errors = [];
		page.on("pageerror", (error) => errors.push(error.message));
		const { port } = server.address();
		await page.goto(`http://127.0.0.1:${port}/benchmarks/document-properties/`, { waitUntil: "networkidle" });
		await page.waitForFunction(() => typeof window.runDocumentPropertiesRenderBenchmark === "function");
		const result = await page.evaluate(({ runs, warmup }) => window.runDocumentPropertiesRenderBenchmark({ runs, warmup }), options);
		if (errors.length) throw new Error(`Browser error: ${errors.join("; ")}`);
		console.log(JSON.stringify(result, null, 2));
	} finally {
		await browser?.close();
		await new Promise((resolve) => server.close(resolve));
	}
};

main().catch((error) => {
	console.error(error.message);
	process.exitCode = 1;
});
