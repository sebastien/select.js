import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

const dataDirectory = path.join("tests", "data")
const frameworkNames = {
	preact: "preact",
	solidjs: "solid",
	"select.ui": "select",
	selectui: "select",
	ui: "select",
}
const metrics = ["initialMs", "patchTotalMs", "content", "type", "add-remove"]
const metricLabels = ["initial", "patch", "content", "type", "add-remove"]

function metricValue(summary, metric) {
	return metric === "initialMs" || metric === "patchTotalMs"
		? summary?.[metric]
		: summary?.phases?.[metric]
}

function formatMilliseconds(value) {
	return Number.isFinite(value) ? `${value.toFixed(2)}ms` : "-"
}

function formatRatio(value, baseline) {
	return Number.isFinite(value) && Number.isFinite(baseline) && baseline
		? `${(value / baseline).toFixed(2)}x`
		: "-"
}

const files = (await readdir(dataDirectory))
	.filter((file) => /^benchmark-inspector-.*\.json$/.test(file))
	.sort()
	.reverse()

const rows = []
for (const file of files) {
	const data = JSON.parse(
		await readFile(path.join(dataDirectory, file), "utf8"),
	)
	const date = data.meta?.generatedAt?.replace("T", " ").slice(0, 19) || file
	const summaries = Object.fromEntries(
		(data.summary || []).map((summary) => [
			frameworkNames[summary.framework] || summary.framework,
			summary,
		]),
	)
	const solid = summaries.solid

	for (const framework of ["preact", "solid", "select"]) {
		const summary = summaries[framework]
		if (!summary) continue
		const values = metrics.map((metric) => metricValue(summary, metric))
		const ratios = framework === "select"
			? values.map((value, index) =>
					formatRatio(value, metricValue(solid, metrics[index])),
			  )
			: []
		rows.push([
			date,
			framework,
			...values.map(formatMilliseconds),
			framework === "select" ? ratios.join(" ") : "",
		])
	}
}

const header = ["benchmark", "framework", ...metricLabels, "select / solid"]
const widths = header.map((name, index) =>
	Math.max(name.length, ...rows.map((row) => String(row[index] || "").length)),
)
const line = (row) =>
	`| ${row.map((value, index) => String(value || "").padEnd(widths[index])).join(" | ")} |`

console.log(line(header))
console.log(`|-${widths.map((width) => "-".repeat(width)).join("-|-")}-|`)
for (const row of rows) console.log(line(row))
if (!rows.length) console.error("No benchmark snapshots found in tests/data")
