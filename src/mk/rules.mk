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

.PHONY: ci
ci:
	@set -eu
	@$(MAKE) check
	@TMP_DIR=$$(mktemp -d); \
	FMT_SNAPSHOT_1=$$(mktemp); \
	FMT_SNAPSHOT_2=$$(mktemp); \
	DIST_SNAPSHOT_1=$$(mktemp); \
	DIST_SNAPSHOT_2=$$(mktemp); \
	trap 'rm -rf "$$TMP_DIR" "$$FMT_SNAPSHOT_1" "$$FMT_SNAPSHOT_2" "$$DIST_SNAPSHOT_1" "$$DIST_SNAPSHOT_2"' EXIT; \
	mkdir -p "$$TMP_DIR/repo"; \
	tar --exclude=.git -cf - . | tar -C "$$TMP_DIR/repo" -xf -; \
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
	$(MAKE) -C "$$TMP_DIR/repo" dist; \
	if [ -d "$$TMP_DIR/repo/dist" ]; then find "$$TMP_DIR/repo/dist" -type f -print0 | sort -z | xargs -0 sha256sum > "$$DIST_SNAPSHOT_2"; else : > "$$DIST_SNAPSHOT_2"; fi; \
	if ! cmp -s "$$DIST_SNAPSHOT_1" "$$DIST_SNAPSHOT_2"; then \
		echo "[CI] make dist is not idempotent"; \
		exit 1; \
	fi
	@echo "[CI] OK"

dist/%.js: src/js/%.js
	@mkdir -p $(dir $@); true
	cat src/js/$*.js > "$@"
	echo "[DIST] $$(du -hs $@)"

dist/%.min.js: dist/%.js
	@mkdir -p $(dir $@); true
	@$(CMD) bun build --minify --outfile="$@" "$<"
	echo "[DIST] $$(du -hs $@)"

dist/selectjs.js: src/js/select.all.js $(SOURCES_JS)
	@mkdir -p $(dir $@); true
	@$(CMD) bun build --bundle --format=esm --outfile="$@" "$<"
	echo "[DIST] $$(du -hs $@)"

dist/selectjs.min.js: src/js/select.all.js $(SOURCES_JS)
	@mkdir -p $(dir $@); true
	@$(CMD) bun build --bundle --format=esm --minify --outfile="$@" "$<"
	echo "[DIST] $$(du -hs $@)"

# EOF
