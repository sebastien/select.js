const http = require("http");
const fs = require("fs");
const path = require("path");
const { spawn } = require("child_process");

const PORT = 8765;
const ROOT = path.resolve(__dirname, "../..");

const framework = process.argv[2] || "selectui";
const supported = new Set(["preact", "solidjs", "selectui"]);
if (!supported.has(framework)) {
	console.error(`Unsupported framework "${framework}". Supported: ${[...supported].join(", ")}`);
	process.exit(1);
}

const framework = process.argv[2] || "selectui";
const supported = new Set(["preact", "solidjs", "selectui"]);
if (!supported.has(framework)) {
	console.error(`Unsupported framework "${framework}". Supported: ${[...supported].join(", ")}`);
	process.exit(1);
}

const mimeTypes = {
	".html": "text/html",
	".js": "application/javascript",
	".css": "text/css",
	".json": "application/json",
	".map": "application/json",
};

let resultData = null;
let resultReceived = false;

const server = http.createServer((req, res) => {
	const url = new URL(req.url, `http://localhost:${PORT}`);

	if (url.pathname === "/result" && req.method === "POST") {
		let body = "";
		req.on("data", (chunk) => (body += chunk));
		req.on("end", () => {
			resultData = body;
			resultReceived = true;
			res.writeHead(200, { "Content-Type": "text/plain" });
			res.end("OK");
		});
		return;
	}

	let filePath = path.join(ROOT, url.pathname);
	fs.stat(filePath, (err, stats) => {
		if (err || !stats.isFile()) {
			res.writeHead(404);
			res.end("Not found");
			return;
		}
		const ext = path.extname(filePath);
		res.writeHead(200, { "Content-Type": mimeTypes[ext] || "application/octet-stream" });
		fs.createReadStream(filePath).pipe(res);
	});
});

server.listen(PORT, () => {
	const benchmarkUrl = `http://localhost:${PORT}/benchmarks/inspector/bench-autorun.html?framework=${framework}`;
	console.log(`Starting benchmark: ${benchmarkUrl}`);

	const chromeCmd = process.platform === "darwin"
		? "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
		: "google-chrome";

	const args = [
		"--headless=new",
		"--disable-gpu",
		"--no-sandbox",
		"--disable-dev-shm-usage",
		"--disable-web-security",
		benchmarkUrl,
	];

	const child = spawn(chromeCmd, args, { detached: false });

	child.on("error", (err) => {
		console.error("Failed to start Chrome:", err.message);
		server.close();
		process.exit(1);
	});

	const waitForResult = () => {
		if (resultReceived) {
			console.log("\n=== Benchmark Result ===\n");
			console.log(resultData);
			console.log("\n========================\n");
			child.kill("SIGKILL");
			server.close();
			process.exit(0);
		} else {
			setTimeout(waitForResult, 500);
		}
	};
	setTimeout(waitForResult, 1500);
});

setTimeout(() => {
	console.error("Benchmark timed out after 90 seconds");
	process.exit(1);
}, 90000);
