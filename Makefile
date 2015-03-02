VERSION=$(shell grep select.VERSION src/select.js | cut -d'"' -f2)

ALL: build/select-$(VERSION).js README.md
	

build/select-$(VERSION).js: src/sizzle.js src/select.js build
	cat src/sizzle.js >  $@
	cat src/select.js >> $@
	cd lib/js ; ln -sf ../../build/select-$(VERSION).js select.js

README.md: src/select.js
	python litterate.py $< > $@

src/sizzle.js:
	curl https://raw.githubusercontent.com/jquery/sizzle/master/src/sizzle.js -o $@

build:
	mkdir build
run:
	pamela-web

# EOF
