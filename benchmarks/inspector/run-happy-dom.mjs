import { Window } from "happy-dom";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "../..");

const window = new Window({
	url: "http://localhost:8001/benchmarks/inspector/",
});
const document = window.document;

// Expose globals so select.ui.js can work — MUST be done before any module imports
global.window = window;
global.document = document;
global.Node = window.Node;
global.Element = window.Element;
global.DocumentFragment = window.DocumentFragment;
global.Text = window.Text;
global.Comment = window.Comment;
global.Document = window.Document;
global.DOMParser = window.DOMParser;
global.MutationObserver = window.MutationObserver;
global.requestAnimationFrame = window.requestAnimationFrame.bind(window);
global.NodeFilter = window.NodeFilter;

// Patch fetch to resolve relative URLs against project root for JSON files
const originalFetch = global.fetch;
global.fetch = (url, ...args) => {
	if (typeof url === "string" && url.startsWith("../../")) {
		const filePath = path.join(ROOT, url.replace(/^\.\.\/\.\.\//, ""));
		return Promise.resolve({
			json: () => Promise.resolve(JSON.parse(fs.readFileSync(filePath, "utf-8"))),
		});
	}
	return originalFetch(url, ...args);
};

// Now import modules that depend on DOM globals
const { createBenchmarkRunner, formatBenchmarkResult } = await import("./runner.js");
const { createApp } = await import("./frameworks/selectui.js");

const framework = process.argv[2] || "selectui";

async function main() {
	const root = document.createElement("div");
	document.body.appendChild(root);

	const runner = createBenchmarkRunner({
		framework,
		root,
		createApp,
	});

	const result = await runner.run();
	console.log(formatBenchmarkResult(result));

	// Exit cleanly
	process.exit(0);
}

main().catch((err) => {
	console.error(err);
	process.exit(1);
});
