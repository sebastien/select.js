PROJECT:=select
VERSION:=$(shell grep 'VERSION' src/js/$(PROJECT).js | cut -d'"' -f2 | tail -n1)
PORT?=8001
SOURCES_JS=$(wildcard src/js/*.js)
BUILD_ALL:=\
	$(SOURCES_JS:src/js/%.js=dist/%.js)\
	$(SOURCES_JS:src/js/%.js=dist/%.min.js)\

all: $(BUILD_ALL)
	@echo "OK"

run:
	@python3 -m http.server $(PORT)

clean:
	@for FILE in $(BUILD_ALL); do
		if [ -e "$$FILE" ]; then unlink "$$FILE"; fi
	done

dist/%.js: src/js/%.js
	@mkdir -p $(dir $@); true
	cat src/js/$(PROJECT).js > "$@"

dist/%.min.js: dist/%.js
	@mkdir -p $(dir $@); true
	esbuild "$<" > "$@"

.ONESHELL:

# EOF
