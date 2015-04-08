VERSION=$(shell grep select.VERSION src/select.js | cut -d'"' -f2)
LITTERATE=litterate.py

ALL: build/select-$(VERSION).js README.html
	

build/select-$(VERSION).js: src/select.js build
	cat src/select.js > $@
	cd lib/js ; ln -sf ../../build/select-$(VERSION).js select.js

README.md: src/select.js
	$(LITTERATE) $< > $@

README.html: README.md
	pandoc -o $@ README.md

build:
	mkdir build
run:
	pamela-web

# EOF
