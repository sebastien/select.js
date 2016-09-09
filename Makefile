VERSION=$(shell grep select.VERSION src/select.js | cut -d'"' -f2)
LITTERATE=litterate

ALL: dist/select-$(VERSION).js dist/select-$(VERSION).min.js README.md

dist/select-$(VERSION).js: src/select.js dist
	cat src/select.js > $@
	cd lib/js ; ln -sf ../../build/select-$(VERSION).js select.js

dist/%.min.js: dist/%.js
	uglifyjs $< > $@

README.md: src/select.js
	$(LITTERATE) $< > $@

dist:
	mkdir dist

run:
	pamela-web

# EOF
