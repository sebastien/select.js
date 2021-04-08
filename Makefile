PROJECT:=select
VERSION:=$(shell grep 'VERSION' src/js/$(PROJECT).js | cut -d'"' -f2 | tail -n1)

ALL: dist/$(PROJECT)-$(VERSION).js dist/$(PROJECT)-$(VERSION).min.js README.md
	@echo "OK"

dist/$(PROJECT)-$(VERSION).js: src/js/$(PROJECT).js dist
	cat src/js/$(PROJECT).js > "$@"

dist/%.min.js: dist/%.js
	uglifyjs "$<" > "$@"

dist:
	mkdir dist

run:
	python3 -m http.server

# EOF
