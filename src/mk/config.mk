# -----------------------------------------------------------------------------
#
# SELECT.JS MAKE CONFIGURATION
#
# -----------------------------------------------------------------------------

PROJECT:=select
PORT?=8001
EXAMPLE?=
SDK_MODULES:=std js mise
DIST_MODE:=
PROJECT_VERSION:=$(shell node -p "require('./package.json').version")
PROJECT_VERSION_TASK:=$(PATH_RUN_TASK)/project-version-$(PROJECT_VERSION).task

# Version sync runs only where it matters (`dist`, `release`, `update-version`),
# not on every phase, so `make check`/`test` never rewrite tracked files.
RELEASE_HOST?=agent@stage
RELEASE_PATH?=/mnt/www/sebastienpierre.me/dist/select

# Release metrics (`metrics` rule in src/mk/rules.mk): record performance vs
# SolidJS and test coverage with git-kv on the tagged commit. Set
# `RELEASE_METRICS=0` to skip during `release`, and `METRICS_PUSH=0` to keep the
# recorded notes local instead of pushing them to the origin.
RELEASE_METRICS?=1
METRICS_BENCH_RUNS?=5
METRICS_PUSH?=1

SOURCES_JS:=$(shell find src/js/select -name "*.js")
DIST_ROOT?=dist
# Files carrying pinned jsDelivr icon package versions, kept in sync by
# `update-icons` and verified by `check-icons`.
ICON_PIN_FILES:=src/js/select/features/icons.js tests/icons-load.test.js
CHECK_ALL+=check-icons
PATH_DIST_WWW:=$(DIST_ROOT)/www

BUNDLE_JS=$(DIST_ROOT)/selectjs.js $(DIST_ROOT)/selectjs.min.js

DIST_FILES=$(SOURCES_JS:src/js/select/%.js=$(DIST_ROOT)/select/%.js) $(DIST_ROOT)/select/index.min.js $(BUNDLE_JS)

BUILD_ALL+=$(DIST_FILES)
CLEAN_ALL+=$(DIST_FILES)

RUN_ALL+=run-http

# EOF
