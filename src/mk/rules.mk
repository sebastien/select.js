# -----------------------------------------------------------------------------
#
# SELECT.JS MAKE RULES
#
# -----------------------------------------------------------------------------

.PHONY: all
all: build
	@

.PHONY: run-http
run-http:
	@$(call rule_pre_cmd)
	if [ -d "deps/extra" ]; then
		PORT=$(PORT) PYTHONPATH=$(realpath deps/extra/src/py) $(CMD) python3 -m extra
	else
		$(CMD) python3 -m http.server $(PORT)
	fi
	$(call rule_post_cmd)

.PHONY: check-biome
check-biome:
	@$(call rule_pre_cmd)
	$(CMD) bunx @biomejs/biome check src/js src/html examples
	$(call rule_post_cmd)

.PHONY: fmt-biome
fmt-biome:
	@$(call rule_pre_cmd)
	$(CMD) bunx @biomejs/biome format --write src/js src/html examples
	$(call rule_post_cmd)

.PHONY: bench
bench:
	@$(call rule_pre_cmd)
	$(CMD) bun run bench:inspector
	$(call rule_post_cmd)

.PHONY: bench-stats
bench-stats:
	@node scripts/bench-stats.mjs

.PHONY: update-version
update-version: $(PROJECT_VERSION_TASK) ## Syncs tracked version strings with PROJECT_VERSION
	@

# Node program shared by `check-icons` and `update-icons`. Collects every pinned
# jsDelivr icon package from ICON_PIN_FILES, resolves the latest npm version,
# then reports drift (`ICONS_CHECK=1`) or rewrites the pins in place.
define ICONS_SCRIPT
import fs from "node:fs";
const files=(process.env.ICON_PIN_FILES||"").split(" ").filter(Boolean);
const check=process.env.ICONS_CHECK==="1";
const re=/npm\/(@?[^@\s"]+)@(\d+\.\d+\.\d+)/g;
const pins=new Map();
for (const f of files) for (const m of fs.readFileSync(f,"utf8").matchAll(re)) pins.set(m[1],m[2]);
const drift=[];
for (const [pkg,cur] of pins) {
	const res=await fetch("https://registry.npmjs.org/"+pkg.replaceAll("/","%2F")+"/latest");
	if (!res.ok) { console.error("[ICONS] "+pkg+": registry status "+res.status); process.exitCode=1; continue }
	const latest=(await res.json()).version;
	if (latest!==cur) drift.push([pkg,cur,latest]);
}
if (check && drift.length) {
	for (const [p,c,l] of drift) console.error("[ICONS] "+p+": "+c+" -> "+l);
	console.error("[ICONS] "+drift.length+" icon package(s) out of date");
	process.exit(1);
}
if (!check && drift.length) {
	for (const f of files) {
		let t=fs.readFileSync(f,"utf8");
		for (const [p,c,l] of drift) t=t.replaceAll("npm/"+p+"@"+c,"npm/"+p+"@"+l);
		fs.writeFileSync(f,t);
	}
}
for (const [p,c,l] of drift) console.log("[ICONS] "+(check?"stale":"updated")+" "+p+": "+c+" -> "+l);
if (!drift.length) console.log("[ICONS] all icon packages up to date");
endef
export ICONS_SCRIPT

.PHONY: check-icons
check-icons:
	@$(call rule_pre_cmd)
	ICON_PIN_FILES="$(ICON_PIN_FILES)" ICONS_CHECK=1 $(CMD) node --input-type=module -e "$$ICONS_SCRIPT"
	$(call rule_post_cmd)

.PHONY: update-icons
update-icons:
	@$(call rule_pre_cmd)
	@out=$$(ICON_PIN_FILES="$(ICON_PIN_FILES)" $(CMD) node --input-type=module -e "$$ICONS_SCRIPT") || exit $$?; \
	echo "$$out"; \
	if echo "$$out" | grep -q "^\[ICONS\] updated"; then \
		echo "[ICONS] pins changed; regenerating example fixtures"; \
		$(MAKE) update-fixtures; \
	fi
	$(call rule_post_cmd)

# Regenerates the HTML snapshots in tests/fixtures/examples used by
# tests/int-examples.test.ts. Run it after any change to rendered output
# (markup, attributes, styles) and review the fixture diff before committing:
# the fixtures encode the expected rendering. Builds `dist` first so the src
# and dist bundle passes record the same output. Use `EXAMPLE=<name>` to
# regenerate a single example's fixtures.
.PHONY: update-fixtures
update-fixtures: dist ## Regenerates examples integration fixtures (EXAMPLE=<name> for one example)
	@$(call rule_pre_cmd)
	@if [ -n "$(EXAMPLE)" ]; then \
		echo "[FIXTURES] updating fixtures for example: $(EXAMPLE)"; \
		UPDATE_FIXTURES=1 $(CMD) bun test tests/int-examples.test.ts -t "$(EXAMPLE)"; \
	else \
		echo "[FIXTURES] updating all example fixtures"; \
		UPDATE_FIXTURES=1 $(CMD) bun test tests/int-examples.test.ts; \
	fi
	$(call rule_post_cmd)

# Node program shared by `metrics` and `metrics-report`. In `record` mode it
# reads the inspector benchmark report and the Bun lcov file, then stores the
# performance vs SolidJS and the test coverage on the given commit with git-kv
# (`refs/notes/kv`). In `report` mode it prints a table of the metrics recorded
# for every `v*` tag. Kept inline so no separate script is needed.
define METRICS_SCRIPT
import fs from "node:fs";
import { execFileSync } from "node:child_process";
const round = (value) => Math.round(value * 100) / 100;
const gitKv = (args) => execFileSync("git", ["kv", ...args], { encoding: "utf8" });
if ((process.env.METRICS_MODE || "record") === "report") {
	const parseVersion = (tag) => tag.replace(/^v/, "").split(".").map((part) => Number(part));
	const tags = execFileSync("git", ["tag", "-l", "v*"], { encoding: "utf8" }).split("\n").filter(Boolean);
	tags.sort((a, b) => {
		const left = parseVersion(a);
		const right = parseVersion(b);
		for (let i = 0; i < 3; i++) {
			const delta = (left[i] || 0) - (right[i] || 0);
			if (delta !== 0) return delta;
		}
		return 0;
	});
	const rows = [];
	for (const tag of tags) {
		let data = {};
		try {
			data = JSON.parse(gitKv(["show", tag, "-tjson"]));
		} catch {
			data = {};
		}
		const overall = data["metrics.benchmark.overall"];
		const coverage = data["metrics.coverage.test"];
		if (overall === undefined && coverage === undefined) continue;
		rows.push({
			release: tag,
			init: data["metrics.benchmark.init"] || "-",
			apply: data["metrics.benchmark.apply"] || "-",
			heap: data["metrics.benchmark.heap"] || "-",
			overall: overall === undefined ? "-" : overall + "%",
			coverage: coverage === undefined ? "-" : coverage + "%",
		});
	}
	if (!rows.length) {
		console.log("No metrics recorded yet; run make metrics once a release is tagged.");
	} else {
		const headers = ["release", "init(ms)", "apply(ms)", "heap(MB)", "overall(%)", "coverage(%)"];
		const keys = ["release", "init", "apply", "heap", "overall", "coverage"];
		const widths = headers.map((header, index) => Math.max(header.length, ...rows.map((row) => String(row[keys[index]]).length)));
		const format = (values) => values.map((value, index) => String(value).padEnd(widths[index])).join("  ");
		console.log(format(headers));
		console.log(format(widths.map((width) => "-".repeat(width))));
		for (const row of rows) console.log(format(keys.map((key) => row[key])));
	}
} else {
	const commit = process.env.METRICS_COMMIT;
	const report = JSON.parse(fs.readFileSync(process.env.METRICS_BENCH_JSON, "utf8"));
	const findFramework = (label) => report.summary.find((entry) => entry.framework === label);
	const select = findFramework("select.ui");
	const solid = findFramework("solidjs");
	if (!select || !solid) {
		console.error("[METRICS] missing select.ui or solidjs benchmark summary");
		process.exit(1);
	}
	const overall = round((0.5 * (select.patchTotalMs / solid.patchTotalMs) + 0.3 * (select.initialMs / solid.initialMs) + 0.2 * (select.heapPeakMB / solid.heapPeakMB)) * 100);
	const lcov = fs.readFileSync(process.env.METRICS_LCOV, "utf8").split("\n");
	let linesFound = 0;
	let linesHit = 0;
	let selected = false;
	for (const line of lcov) {
		if (line.startsWith("SF:")) selected = line.indexOf("src/js/select/") !== -1;
		if (!selected) continue;
		if (line.startsWith("LF:")) linesFound += Number(line.slice(3));
		if (line.startsWith("LH:")) linesHit += Number(line.slice(3));
	}
	const coverage = linesFound ? round((linesHit / linesFound) * 100) : 0;
	const entries = [
		["metrics.benchmark.init", select.initialMs],
		["metrics.benchmark.apply", select.patchTotalMs],
		["metrics.benchmark.heap", select.heapPeakMB],
		["metrics.benchmark.solid.init", solid.initialMs],
		["metrics.benchmark.solid.apply", solid.patchTotalMs],
		["metrics.benchmark.solid.heap", solid.heapPeakMB],
		["metrics.benchmark.overall", overall],
		["metrics.coverage.test", coverage],
	];
	for (const [key, value] of entries) {
		if (!Number.isFinite(value)) continue;
		gitKv(["set", key, String(value), commit]);
		console.log("[METRICS] " + key + " = " + value);
	}
	if (process.env.METRICS_PUSH !== "0") gitKv(["push"]);
	console.log("[METRICS] recorded on commit " + commit);
}
endef
export METRICS_SCRIPT

.PHONY: metrics
metrics: ## Records performance vs SolidJS and coverage for the current release
	@$(call rule_pre_cmd)
	@set -eu; \
	tmp=$$(mktemp -d); \
	trap 'rm -rf "$$tmp"' EXIT; \
	version="$(PROJECT_VERSION)"; \
	commit=$$(git rev-parse --verify -q "v$$version^{commit}" || git rev-parse HEAD); \
	echo "[METRICS] measuring $$version ($$commit)"; \
	$(CMD) node scripts/bench-inspector.mjs --json --no-save --runs $(METRICS_BENCH_RUNS) > "$$tmp/bench.json"; \
	$(CMD) bun test --coverage --coverage-reporter=lcov --coverage-dir="$$tmp/cov" > /dev/null; \
	METRICS_MODE=record METRICS_VERSION="$$version" METRICS_COMMIT="$$commit" METRICS_BENCH_JSON="$$tmp/bench.json" METRICS_LCOV="$$tmp/cov/lcov.info" METRICS_PUSH="$(METRICS_PUSH)" $(CMD) node --input-type=module -e "$$METRICS_SCRIPT"
	$(call rule_post_cmd)

.PHONY: metrics-report
metrics-report: ## Prints recorded performance and coverage metrics across releases
	@METRICS_MODE=report $(CMD) node --input-type=module -e "$$METRICS_SCRIPT"

.PHONY: release
release: $(PROJECT_VERSION_TASK)
	@set -eu; \
	description=$$(jj log --no-graph -r @ -T 'description.first_line()'); \
	if [ -z "$$description" ]; then \
		echo "[RELEASE] current JJ revision has no description"; \
		exit 1; \
	fi; \
	$(MAKE) check; \
	$(MAKE) test; \
	$(MAKE) dist; \
	package_version=$$(node -p "require('./package.json').version"); \
	test "$$package_version" = "$(PROJECT_VERSION)"; \
	version="$(PROJECT_VERSION)"; \
	release_revision="@"; \
	if jj tag list -T 'name ++ "\n"' | grep -qxF "v$$version"; then \
		IFS=. read -r major minor patch <<< "$$version"; \
		minor=$$((minor + 1)); \
		version="$$major.$$minor.$$patch"; \
		while jj tag list -T 'name ++ "\n"' | grep -qxF "v$$version"; do \
			minor=$$((minor + 1)); \
		version="$$major.$$minor.$$patch"; \
		done; \
		node -e 'const fs=require("fs"), v=process.argv[1]; const config=fs.readFileSync("src/mk/config.mk", "utf8").replace(/^PROJECT_VERSION:=.*$$/m, "PROJECT_VERSION:="+v); fs.writeFileSync("src/mk/config.mk", config)' "$$version"; \
		$(MAKE) PROJECT_VERSION="$$version" dist; \
		jj commit src/mk/config.mk package.json src/js/select/features/query.js README.md -m "[Release] $(PROJECT): version $$version"; \
		release_revision="@-"; \
	fi; \
	jj tag set "v$$version" --revision="$$release_revision"; \
	if [ "$(RELEASE_METRICS)" != "0" ]; then $(MAKE) PROJECT_VERSION="$$version" metrics; fi; \
	git push origin "v$$version"; \
	ssh $(RELEASE_HOST) "mkdir -p $(RELEASE_PATH)/$$version"; \
	scp dist/selectjs.js dist/selectjs.min.js "$(RELEASE_HOST):$(RELEASE_PATH)/$$version/"

$(PATH_RUN_TASK)/project-version-%.task: src/mk/config.mk package.json src/js/select/features/query.js README.md
	@mkdir -p "$(dir $@)"
	@VERSION="$*" node --input-type=module -e 'import fs from "node:fs"; const version=process.env.VERSION; const packageData=JSON.parse(fs.readFileSync("package.json")); packageData.version=version; fs.writeFileSync("package.json", JSON.stringify(packageData, null, "\t")+"\n"); const replacements=[["src/js/select/features/query.js", /VERSION: "[^"]+"/, `VERSION: "$${version}"`],["README.md", /select\.js@v[0-9]+\.[0-9]+\.[0-9]+/, `select.js@v$${version}`]]; for (const [path, pattern, value] of replacements) { const source=fs.readFileSync(path, "utf8"); fs.writeFileSync(path, source.replace(pattern, value)) }'
	@touch "$@"


.PHONY: _dist-files select-dist ci

_dist-files: $(DIST_FILES)

.PHONY: dist
dist: select-dist

select-dist: $(PROJECT_VERSION_TASK)
	@set -eu; \
	stage=$$(mktemp -d ".dist.stage.XXXXXX"); \
	backup="$$stage.previous"; \
	trap 'rm -rf "$$stage" "$$backup"' EXIT; \
	$(MAKE) --no-print-directory _dist-files DIST_ROOT="$$stage"; \
	if find "$$stage" -type f \( -name "*.gz" -o -path "*/www/*" \) | grep -q .; then \
		echo "[DIST] unexpected deployment artifact"; \
		exit 1; \
	fi; \
	if find "$$stage/select" -type f -name "*.min.js" ! -name "index.min.js" | grep -q .; then \
		echo "[DIST] unexpected leaf minified module"; \
		exit 1; \
	fi; \
	if [ -d dist ]; then mv dist "$$backup"; fi; \
	mv "$$stage" dist; \
	stage=""; \
	rm -rf "$$backup"

.PHONY: ci
ci:
	@set -eu
	@$(MAKE) check
	@bun test
	@bun run test:dist
	@TMP_DIR=$$(mktemp -d); \
	FMT_SNAPSHOT_1=$$(mktemp); \
	FMT_SNAPSHOT_2=$$(mktemp); \
	DIST_SNAPSHOT_1=$$(mktemp); \
	DIST_SNAPSHOT_2=$$(mktemp); \
	trap 'mise trust --untrust -y "$$TMP_DIR/repo/mise.toml" >/dev/null 2>&1 || true; rm -rf "$$TMP_DIR" "$$FMT_SNAPSHOT_1" "$$FMT_SNAPSHOT_2" "$$DIST_SNAPSHOT_1" "$$DIST_SNAPSHOT_2"' EXIT; \
	mkdir -p "$$TMP_DIR/repo"; \
	tar --exclude=.git -cf - . | tar -C "$$TMP_DIR/repo" -xf -; \
	mise trust -y "$$TMP_DIR/repo/mise.toml"; \
	echo "[CI] checking fmt idempotence"; \
	$(MAKE) -C "$$TMP_DIR/repo" fmt; \
	find "$$TMP_DIR/repo" -type f -print0 | sort -z | xargs -0 sha256sum > "$$FMT_SNAPSHOT_1"; \
	$(MAKE) -C "$$TMP_DIR/repo" fmt; \
	find "$$TMP_DIR/repo" -type f -print0 | sort -z | xargs -0 sha256sum > "$$FMT_SNAPSHOT_2"; \
	if ! cmp -s "$$FMT_SNAPSHOT_1" "$$FMT_SNAPSHOT_2"; then \
		echo "[CI] make fmt is not idempotent"; \
		exit 1; \
	fi; \
	echo "[CI] checking dist idempotence"; \
	$(MAKE) -C "$$TMP_DIR/repo" dist; \
	if [ -d "$$TMP_DIR/repo/dist" ]; then find "$$TMP_DIR/repo/dist" -type f -print0 | sort -z | xargs -0 sha256sum > "$$DIST_SNAPSHOT_1"; else : > "$$DIST_SNAPSHOT_1"; fi; \
	touch "$$TMP_DIR/repo/dist/select/stale.js"; \
	$(MAKE) -C "$$TMP_DIR/repo" dist; \
	if [ -e "$$TMP_DIR/repo/dist/select/stale.js" ]; then \
		echo "[CI] make dist retained a stale artifact"; \
		exit 1; \
	fi; \
	if [ -d "$$TMP_DIR/repo/dist" ]; then find "$$TMP_DIR/repo/dist" -type f -print0 | sort -z | xargs -0 sha256sum > "$$DIST_SNAPSHOT_2"; else : > "$$DIST_SNAPSHOT_2"; fi; \
	if ! cmp -s "$$DIST_SNAPSHOT_1" "$$DIST_SNAPSHOT_2"; then \
		echo "[CI] make dist is not idempotent"; \
		exit 1; \
	fi
	@echo "[CI] OK"

$(DIST_ROOT)/select/%.js: src/js/select/%.js
	@mkdir -p $(dir $@); true
	cat src/js/select/$*.js > "$@"
	echo "[DIST] $$(du -hs $@)"

$(DIST_ROOT)/select/index.js: src/js/select/index.js $(SOURCES_JS)
	@mkdir -p $(dir $@); true
	@printf 'export * from "../selectjs.js";\n' > "$@"
	echo "[DIST] $$(du -hs $@)"

$(DIST_ROOT)/select/index.min.js: src/js/select/index.js $(SOURCES_JS)
	@mkdir -p $(dir $@); true
	@printf 'export*from"../selectjs.min.js";\n' > "$@"
	echo "[DIST] $$(du -hs $@)"

$(DIST_ROOT)/selectjs.js: src/js/select/index.js $(SOURCES_JS)
	@mkdir -p $(dir $@); true
	@$(CMD) bun build --bundle --format=esm --outfile="$@" "$<"
	echo "[DIST] $$(du -hs $@)"

$(DIST_ROOT)/selectjs.min.js: src/js/select/index.js $(SOURCES_JS)
	@mkdir -p $(dir $@); true
	@tmp="$@.bundle.js"; \
	rm -f "$$tmp"; \
	$(call shell_try,$(CMD) bun build --bundle --format=esm --outfile="$$tmp" "$<",Unable to build JavaScript bundle: $<); \
	$(call shell_try,$(call js_minify,$$tmp,$@),Unable to minify JavaScript bundle: $<); \
	rm -f "$$tmp"
	echo "[DIST] $$(du -hs $@)"

# EOF
