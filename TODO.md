📊 Full-Scale Analysis of src/js/select/
Overview Stats
Metric	Count
Total files	48
Source lines (estimated)	~20,000+
Top-level modules	12
Utility submodules	17
Interaction submodules	5
UI submodules	7
1. Architecture Overview
The codebase is a batteries-included browser application framework (named "Select.js") structured as a layered monolith with clear module boundaries:
select.js  (the library)
├── query.js        → jQuery-like DOM selection (Selection class, ~1650 lines)
├── cells.js        → Reactive state management (Cell, Derivation, Switched, ~1930 lines)
├── browser.js      → Browser URL/localStorage state + pub/sub messaging (~1200 lines)
├── icons.js        → SVG icon loader with sanitization (~500 lines)
├── routing.js      → Path/Hash router with parameterized routes (~400 lines)
├── formats.js      → String/datetime/number formatters (~560 lines)
├── fastdom.js      → Batched DOM reads/writes scheduler (~160 lines)
├── workflows.js    → Generator-based workflow runner with caching/retries (~600 lines)
├── ui/             → Template engine + UI component runtime (~4800 lines across 7 files)
├── interaction/    → Drag/drop, sort, keyboard, placement helpers (~1100 lines across 5 files)
├── utils/          → General-purpose utility library (~5000+ lines across 17 files)
└── index.js        → Aggregation barrel (~48 lines)
Dependency Hierarchy
Level 0 (foundational): utils/values.js, utils/logger.js
Level 1 (basic): utils/compare.js, utils/text.js, utils/iter.js, utils/func.js
Level 2 (data): utils/transform.js, utils/traverse.js, utils/update.js, utils/sanitize.js
Level 3 (domain): utils/selection.js, utils/search.js, utils/dom.js, utils/html.js
Level 4 (serialization): utils/hashfmt.js
Level 5 (infrastructure): utils/dates.js, utils/math.js, utils/storage.js, utils/http.js, utils/shape.js
Level 6 (core): cells.js, query.js (independent), fastdom.js (independent)
Level 7 (integration): browser.js (depends on cells.js, hashfmt.js, routing.js)
Level 8 (application): ui/*, interaction/*, icons.js, formats.js, workflows.js
Level 9 (aggregation): index.js
Notable: query.js (Selection) and cells.js (Reactive) are the two independent pillars of the framework. They don't depend on each other, which is good architectural separation. browser.js bridges them with the DOM.
2. Module-by-Module Analysis
query.js — DOM Selection & Manipulation (1654 lines)
Purpose: jQuery-like DOM wrapper for modern browsers.
Core types:
- Selection extends Array — the central DOM wrapper class with ~40 methods
- query(selector, scope) — querySelectorAll wrapper with > child selector and :first support
- match(selector, node) — CSS selector matching (with browser capability detection)
- filter(selector, nodes) — subset filtering
Key design choices:
- Extends native Array rather than wrapping it — good for memory/performance but risks Array method conflicts
- Has __class__ marker for instance detection (not instanceof due to cross-realm concerns)
- The select factory function doubles as the module default export and carries static properties (VERSION, STATUS, etc.)
- The $ and S aliases are both exported
cells.js — Reactive State (1937 lines)
Purpose: Observable data containers with derivation and path selection.
Core types:
- Reactive — base class with value, subscribers, revision tracking, pending support
- Cell — mutable reactive container (writeable)
- Derivation — computed from template of source cells (read-only by default)
- Switched — dynamically follows a target resolved from inputs
- Selected — reactive view into a nested property of a parent cell
- Deferred — debounced cell with delay
- Selections — internal registry tree for tracking nested path observers
Key design choices:
- Path-based nested updates (cell.set(value, ["user", "name"]))
- Promise-aware: cells support .then() values with isPending state
- Batch mode: batch(fn) defers subscriber notifications
- effect(inputs, effector) — standalone function for setting up reactive effects
- Acquire/release ref-counting on selected views
- Three update strategies for Derivations: "join" (wait all), "immediate" (per source), "incremental"
browser.js — Browser State & Messaging (1206 lines)
Purpose: Bridge between reactive cells and browser APIs (URL, localStorage, messaging).
Core types:
- Browser — main class exposing path, query, hash, local, internal, option, ref, val, parse, fetch, routes, pub/sub, put/get/send/receive
- LocationState — wraps window.location with reactive cells for path, query, hash
- LocationValueCell extends Cell — write-through cell that syncs to URL
- LocalStorageCell extends Cell — write-through cell that syncs to localStorage
- PathFormat, QueryFormat, HashFormat — serialization classes
Key design choices:
- Singleton pattern with browser() function
- selectable() helper creates callable cell wrappers (e.g., state.hash("key") returns Selected)
- Reference syntax: @name, ?name, #name, *name for cross-referencing state
- Channel-based in-memory messaging with TTL support
- Option sources backed by a global property on window with reactive binding
ui/ — Template Engine & Component Runtime (~4800 lines across 7 files)
Core types:
- UITemplate — parsed template from HTML with discovered slots and bindings
- UIInstance — mounted instance of a template (1675 lines, the largest single file)
- UITemplateSlot, UIAttributeTemplateSlot, UIEventTemplateSlot — slot descriptors
- UISlot, UIAttributeSlot, UIEventSlot, UIContentSlot — mounted slot renderers
- TemplateParser — parses out, when, on: binding expressions
- TemplateRegistry — per-document template lookup
- UIWebComponent — custom element bridge
- AppliedUITemplate — lazy template+data wrapper
Key design choices:
- Template syntax uses HTML attributes: out="slot", out:class="expr", on:click="!event", when="condition", in="field", inout="field"
- Pipe-based processor chaining: out="items|*Component|Formatter"
- Behavior functions are closure-based methods on the template
- Event system: pub() bubbles up component tree, on()/sub() for handlers
- provide()/inject() for context passing through component tree
- WebComponent bridge with observed attributes, automatic ui-parent injection
- Template resources loaded via fetch with caching
utils/ — General Purpose Library (~5000+ lines across 17 files)
This is essentially a standard library for JavaScript, providing:
Submodule	Purpose	Lines
values.js	Type checks, sentinels, access(), jsonkey(), clone()	584
transform.js	Immutable collection transforms (map, filter, reduce, sorted, etc.)	1138
iter.js	Generator-based iteration (iitems, iquery, iwalk, etc.)	567
traverse.js	Read-only traversal (get, has, find, remap(), etc.)	437
update.js	In-place structural updates (insert, assign, remove, etc.)	213
math.js	Numeric helpers, interpolation, statistics, ranges	937
dates.js	Custom DateNum arithmetic (no native Date needed)	720
text.js	Case conversion, compression, regex helpers	490
html.js	Class name generation, HTML highlighting, DOM factory proxy	183
compare.js	Deep equality (eq), comparison (cmp)	148
func.js	Function composition (pipeline, ary, memo)	266
search.js	Predicate combinators, text search	223
selection.js	Selection helpers (add, remove, toggle, wrapindex)	186
dom.js	DOM manipulation (mount, unmount, replace, attr)	396
hashfmt.js	Compact URL-safe serialization format	699
sanitize.js	Recursive data sanitizer	173
logger.js	Scoped console logging	108
Other Major Modules
routing.js (394 lines): Tree-based path router with parameterized routes. Supports {name:type} pattern slots, * wildcards, ** descendants, and priority-based handler dispatch.
workflows.js (602 lines): Generator-based async workflow runner. Features TTL caching (memory or IndexedDB), automatic retries with backoff, lifecycle events with call stack tracking.
icons.js (508 lines): SVG icon loader with security-focused sanitization. Supports multiple icon packs, inline and reference rendering modes, custom element integration.
fastdom.js (164 lines): Batched DOM read/write scheduler following the FastDOM pattern to reduce layout thrashing.
formats.js (560 lines): String formatters for dates, numbers, currency, durations with a pluggable registry (FORMATS object).
interaction/ (~1100 lines): Drag-and-drop, sortable lists, keyboard helpers, and placement algorithms. All mouse-based.
3. Patterns and Anti-patterns
Strengths ✅
1. Clean module boundaries: Each file has a clear purpose and well-defined exports. The ~17 utility submodules are granular and individually small-to-medium sized.
2. Reactive-first architecture: The cells.js module is sophisticated — supporting derivation, switching, path selection, promise values, and batched updates. This is a solid foundation.
3. Performance consciousness:
- Explicit for loops instead of forEach/reduce in hot paths
- FastDOM for batched DOM mutations
- Flyweight/recycle pattern in values.js
- Caching of compiled slot appliers in UIInstance
4. Security awareness: SVG sanitization in icons.js, CSS selector validation, hashfmt key sanitization against __proto__ pollution.
5. Comprehensive serialization: The hashfmt format is a well-designed compact notation with parser, formatter, and RecordFormat abstraction.
6. Documentation quality: NaturalDocs-style comments throughout with examples — excellent for a solo-project.
Duplications & Overlaps ⚠️
1. Duplicate iter functions: Both utils/transform.js:iter() and utils/traverse.js:iter() implement nearly identical collection iteration logic (Array, Map, Set, Object, Iterable dispatch). The transform version adds done/emptyValue semantics; the traverse version adds string iteration. They share ~70% of their logic.
2. Duplicate append functions: utils/transform.js:append() (immutable, returns new collection), utils/update.js:append() (mutates in-place). Same for prepend, insert, remove, swap.
3. Duplicate predicate functions: utils/search.js:predicate() and utils/func.js:predicate() — different implementations doing similar things.
4. Triplicate match functions: query.js:match() (CSS selector matching), utils/search.js:match() (criteria matching), and local match() in interaction/draggable.js (CSS selector matching). The names collide.
5. Duplicate toCamelCase/toKebabCase: Both in formats.js and utils/text.js.
6. Duplicate isInputNode: Both in ui/templates.js and utils/dom.js.
7. Duplicate isPlainObject/isObject: Appears in utils/values.js, utils/logger.js, and cells.js. They check the same thing but have slightly different implementations.
8. Duplicate collection iteration patterns: The iitems() generator, each() in traverse, iter() in transform, and ivalues() all implement the same type-dispatch logic (Array → Map → Set → Object → Iterable → Scalar) in subtly different ways.
9. Double remap functions: ui/index.js:remap() and ui/components/template.js:remapCollection() are identical implementations for mapping over Map/Set/Array/Object.
Inconsistencies ⚠️
1. Export style inconsistency: Some files have a default export and named exports (e.g., cells.js exports both cell and a default Object.assign(cell, {derived, ...})). Some are export-all barrels (utils.js). Some are single-default (query.js).
2. Naming conventions: Some submodules use generator-style i prefix (iitems, iquery), some don't. The utils/selection.js module has functions like add, remove, has that shadow native Array methods.
3. Path handling: Multiple path representations exist — dot-separated strings, arrays, Nothing/pathify from cells, the path() function from utils/traverse that returns null vs Nothing.
4. DOM vs data methods: utils/dom.js has its own attr(), append(), replace() functions that operate on raw DOM nodes, while query.js's Selection class has same-named methods with richer semantics. Easy to confuse.
5. Error handling: Some modules use try/catch, some just let errors propagate. Some log to console, some use the scoped logger. Inconsistent.
4. Technical Debt — FIXME/TODO Inventory
query.js
- "Should have a clear strategy on selecting text and nodes"
- "Test length of arguments instead of typeof"
- "The $.selector property is not working properly"
- "Add a 'virtual' mode so that all the changes are made virtually, then pooled, then applied" (big feature)
- "Add flyweight pattern in order to recycle selections"
- redo() is commented out entirely
- after() notes "Really not sure about that" for the append-to-parent fallback
- contents(): "Not sure if that's the best behaviour... should we clone other nodes, or warn?"
- scrollTop/scrollLeft not implemented for SVG
- data(): "Hopefully this won't produce a weird reference issue"
ui/components/instance.js
- "FIXME: Remove, use pub() instead" on send() and emit()
- "I'm not sure this condition is good" in render() regarding granular update check
- "Speedup: if the first node is not mounted, the rest is not" in unmount()
- "Some root slots would have their node replaced by a placeholder"
ui/components/template.js
- "Should be on" on sub() method (naming issue)
- "There's a question whether we should have Instance instead of clone"
ui/components/runtime.js
- "Edge case when the slot is a direct node in the instance .nodes"
ui/components/slots.js
- "We may want to ensure the order is as expected" in _renderMapped()
- "Edge case when the slot is a direct node in the instance .nodes" in show()/hide()
ui/templates.js
- Multiple error messages reference [when] attribute but the attribute is named when not [when] (confusing)
icons.js
- "Not sure why this happens" in inline mode for missing SVG children
utils/transform.js
- prune() and pruned() marked "Deprecated/remove"
cells.js
- "TODO: Revisit pub and how it works" in Reactive.pub()
- "TODO: Maybe patch?" in Cell._update()
- "TODO: Should detect a change" in Cell.set()
workflows.js
- The accepts and backoff properties on WorkflowRuntime are poorly named (conflict with method names)
5. Suggested Simplifications
High-Impact
1. Unify collection iteration: The 4+ different iteration implementations (iitems, iter in transform, iter in traverse, ivalues, each) could be consolidated into a single dispatch function with strategy parameters.
2. Merge immutable/mutable transforms: utils/transform.js (immutable) and utils/update.js (mutable) have parallel APIs. Could be one module with an options flag.
3. Consolidate predicate/match functions: The three different match functions and two predicate functions across the codebase should be unified.
4. Extract path utilities: Path handling is scattered across cells.js, utils/traverse.js, utils/values.js, and ui/components/runtime.js. A single path module would help.
5. Remove deprecated code: send()/emit() methods, prune()/pruned() functions, and the commented-out redo() hold no value.
Medium-Impact
6. Consolidate case/format functions: toCamelCase, toKebabCase exist in both formats.js and utils/text.js. The format.js versions call utils/text.js but add no extra value.
7. Unify isInputNode: Now exists in three places. Make utils/dom.js the canonical location.
8. Deduplicate remap/remapCollection: Identical implementations in ui/index.js and ui/components/template.js.
9. Standardize default export pattern: Some modules use Object.assign(fn, {...}) as default, some export a plain object, some export a single class. Consistency would help maintainability.
6. Summary Assessment
This is a mature, production-quality codebase (~20K lines) that demonstrates deep JavaScript expertise. The reactive system (cells.js) and the UI template engine (ui/) are particularly well-designed — the slot/template/instance architecture with compiled appliers, behavior tracking proxies, and reactive dependency snapshots shows careful performance engineering.
The main area for improvement is consolidation of overlapping utilities. The 17 utility submodules have grown organically, leading to the duplication issues noted above. The convention of prefixing generator-based functions with i (from "iterator") is used inconsistently.
The framework covers an impressive surface area: reactive state, DOM selection, template rendering, event handling, routing, browser state sync, drag-and-drop, icon loading, workflow orchestration, math/date libraries, text formatting, and serialization — all without external dependencies.
Health score: 7.5/10 — solid architecture with accumulated maintenance debt in the utility layer.
