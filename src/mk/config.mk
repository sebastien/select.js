# -----------------------------------------------------------------------------
#
# SELECT.JS MAKE CONFIGURATION
#
# -----------------------------------------------------------------------------

PROJECT:=select
PORT?=8001
MODULES:=std js mise
DIST_MODE:=
PROJECT_VERSION:=$(shell grep version < package.json | cut -d: -f2 | sed 's|[", ]||g')

# Keep SDK prep side effects disabled for this project.
# PREP_ALL:=

SOURCES_JS:=$(shell find src/js/select -name "*.js")

BUNDLE_JS:=dist/selectjs.js dist/selectjs.min.js dist/selectjs.min.js.gz

BUILD_ALL+=\
	$(SOURCES_JS:src/js/select/%.js=dist/select/%.js)\
	$(SOURCES_JS:src/js/select/%.js=dist/select/%.min.js)\
	$(BUNDLE_JS)

DIST_ALL+=$(BUILD_ALL)
CLEAN_ALL+=$(BUILD_ALL)

RUN_ALL+=run-http

# EOF
