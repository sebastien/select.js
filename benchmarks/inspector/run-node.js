const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");

const PORT = 8765;
const ROOT = path.resolve(__dirname, "../..");

const framework = process.argv[2] || "selectui";
const supported = new Set(["preact", "solidjs", "selectui"]);

const logBenchmark = (level, scope, message, details = {}) => {
	console[level](`[bench.inspector] ${scope}: ${message}, details`, details);
};

if (!supported.has(framework)) {
	logBenchmark("error", "run-node.main", "unsupported framework", {
		framework,
		supported: [...supported],
	});
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

	const filePath = path.join(ROOT, url.pathname);
	fs.stat(filePath, (err, stats) => {
		if (err || !stats.isFile()) {
			res.writeHead(404);
			res.end("Not found");
			return;
		}
		const ext = path.extname(filePath);
		res.writeHead(200, {
			"Content-Type": mimeTypes[ext] || "application/octet-stream",
		});
		fs.createReadStream(filePath).pipe(res);
	});
});

server.listen(PORT, () => {
	const benchmarkUrl = `http://localhost:${PORT}/benchmarks/inspector/bench-autorun.html?framework=${framework}`;
	logBenchmark("log", "run-node.main", "starting benchmark", {
		benchmarkUrl,
		framework,
		port: PORT,
	});

	const chromeCmd =
		process.platform === "darwin"
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
		logBenchmark("error", "run-node.main", "failed to start chrome", {
			error: err.message,
			chromeCmd,
			args,
		});
		server.close();
		process.exit(1);
	});

	const waitForResult = () => {
		if (resultReceived) {
			logBenchmark("log", "run-node.waitForResult", "benchmark result header", {
				framework,
			});
			logBenchmark("log", "run-node.waitForResult", "benchmark result payload", {
				resultData,
			});
			logBenchmark("log", "run-node.waitForResult", "benchmark result footer", {
				framework,
			});
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
	logBenchmark("error", "run-node.main", "benchmark timed out", {
		timeoutMs: 90000,
		framework,
	});
	process.exit(1);
}, 90000);
