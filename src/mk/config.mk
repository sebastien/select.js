# -----------------------------------------------------------------------------
#
# SELECT.JS MAKE CONFIGURATION
#
# -----------------------------------------------------------------------------

PROJECT:=select
PORT?=8001
SDK_MODULES:=std js mise
DIST_MODE:=
PROJECT_VERSION:=$(shell grep version < package.json | cut -d: -f2 | sed 's|[", ]||g')

# Keep SDK prep side effects disabled for this project.
# PREP_ALL:=

SOURCES_JS:=$(shell find src/js/select -name "*.js")
DIST_ROOT?=dist
PATH_DIST_WWW:=$(DIST_ROOT)/www

BUNDLE_JS=$(DIST_ROOT)/selectjs.js $(DIST_ROOT)/selectjs.min.js

DIST_FILES=$(SOURCES_JS:src/js/select/%.js=$(DIST_ROOT)/select/%.js) $(DIST_ROOT)/select/index.min.js $(BUNDLE_JS)

BUILD_ALL+=$(DIST_FILES)
CLEAN_ALL+=$(DIST_FILES)

RUN_ALL+=run-http

# EOF
