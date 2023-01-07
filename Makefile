PROJECT:=select
VERSION:=$(shell grep 'VERSION' src/js/$(PROJECT).js | cut -d'"' -f2 | tail -n1)
PORT?=8001
BUILD_ALL:=\
	dist/$(PROJECT)-$(VERSION).js\
	dist/$(PROJECT)-$(VERSION).min.js

all: $(BUILD_ALL)
	@echo "OK"

run:
	@python3 -m http.server $(PORT)

dist/$(PROJECT)-$(VERSION).js: src/js/$(PROJECT).js dist
	@mkdir -p $(dir $@); true
	cat src/js/$(PROJECT).js > "$@"

dist/%.min.js: dist/%.js
	@mkdir -p $(dir $@); true
	uglifyjs "$<" > "$@"

.ONESHELL:

# EOF
