# -----------------------------------------------------------------------------
#
# SELECT.JS MAKE CONFIGURATION
#
# -----------------------------------------------------------------------------

PROJECT:=select
PORT?=8001
MODULES:=std js mise
DIST_MODE:=

# Keep SDK prep side effects disabled for this project.
# PREP_ALL:=

SOURCES_JS:=$(wildcard src/js/*.js)
SOURCES_JS:=$(filter-out src/js/select.all.js,$(SOURCES_JS))

BUNDLE_JS:=dist/selectjs.js dist/selectjs.min.js

BUILD_ALL+=\
	$(SOURCES_JS:src/js/%.js=dist/%.js)\
	$(SOURCES_JS:src/js/%.js=dist/%.min.js)\
	$(BUNDLE_JS)

DIST_ALL+=$(BUILD_ALL)
CLEAN_ALL+=$(BUILD_ALL)

RUN_ALL+=run-http

# EOF
