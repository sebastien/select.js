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
	$(CMD) python3 -m http.server $(PORT)
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
