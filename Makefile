PROJECT:=select
VERSION:=$(shell grep 'VERSION' src/js/$(PROJECT).js | cut -d'"' -f2 | tail -n1)
PORT?=8001
SOURCES_JS=$(wildcard src/js/*.js)
SOURCES_JS:=$(filter-out src/js/select.all.js,$(SOURCES_JS))
BUNDLE_JS:=dist/selectjs.js dist/selectjs.min.js
BUILD_ALL:=\
	$(SOURCES_JS:src/js/%.js=dist/%.js)\
	$(SOURCES_JS:src/js/%.js=dist/%.min.js)\
	$(BUNDLE_JS)
DIST_ALL:=$(BUILD_ALL)

all: $(BUILD_ALL)
	@echo "OK"

run:
	@mise x -- python3 -m http.server $(PORT)

check:
	@mise x -- bunx @biomejs/biome check .

fmt:
	@mise x -- bunx @biomejs/biome format --write .

clean:
	@for FILE in $(BUILD_ALL); do
		if [ -e "$$FILE" ]; then unlink "$$FILE"; fi
	done
	echo "[clean] $(BUILD_ALL)"

.PHONY: dist check fmt
dist: $(DIST_ALL)
	@

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
	@mise x -- bun build --minify --outfile="$@" "$<"
	echo "[DIST] $$(du -hs $@)"

dist/selectjs.js: src/js/select.all.js $(SOURCES_JS)
	@mkdir -p $(dir $@); true
	@mise x -- bun build --bundle --format=esm --outfile="$@" "$<"
	echo "[DIST] $$(du -hs $@)"

dist/selectjs.min.js: src/js/select.all.js $(SOURCES_JS)
	@mkdir -p $(dir $@); true
	@mise x -- bun build --bundle --format=esm --minify --outfile="$@" "$<"
	echo "[DIST] $$(du -hs $@)"

.ONESHELL:

# EOF
