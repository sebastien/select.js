lib/js/select.js: src/sizzle.js src/select.js
	cat src/sizzle.js >  $@
	cat src/select.js >> $@
	
src/sizzle.js:
	curl https://raw.githubusercontent.com/jquery/sizzle/master/src/sizzle.js -o $@

run:
	pamela-web

# EOF
