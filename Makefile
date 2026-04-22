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
