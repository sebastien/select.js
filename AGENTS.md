# AGENTS.md - Agentic Coding Guidelines

## Build Commands

```bash
# Build all files and minified versions
make all

# Build distribution files only
make dist

# Run all checks (Biome + project checks)
make check

# Apply formatting fixes
make fmt

# Run repository CI checks locally
make ci

# Start HTTP server on port 8001
make run

# Remove build artifacts
make clean
```

## Code Style Guidelines

### Language & Modules
- **Pure JavaScript (ES2021+)**, no TypeScript
- **ES6 modules** with import/export syntax (no CommonJS)
- Target: Modern browsers (IE10+)
- Module aliases: Use `@./` prefix with import maps

### Formatting
- **Tab indentation**, size 4 for JavaScript/CSS
- Tab indentation, size 2 for HTML/XML
- No semicolons required
- Use `const` and `let`, avoid `var`

### Imports
```javascript
// Good - ES6 named imports
import { walk, expand, cell, derived } from "./select.cells.js"

// Good - Default imports with aliases
import S from "../js/select.js"
import ui from "@./select.ui.js"

// Good - Multiple exports
import { ui, remap } from "@./select.ui.js"

// HTML import map setup
<script type="importmap">
    {"imports": {"@./": "../src/js/" } }
</script>
```

### Naming Conventions

| Type | Convention | Examples |
|------|------------|----------|
| **Files** | `select.*.js` | `select.js`, `select.cells.js` |
| **Classes** | PascalCase | `Selection`, `UIInstance`, `Cell`, `Reactive` |
| **Functions** | camelCase | `find()`, `filter()`, `append()` |
| **Static methods** | PascalCase on class | `Selection.Is()`, `Selection.AsElementList()` |
| **Constants/Sentinels** | UPPER_SNAKE_CASE or PascalCase | `MAX_SIZE`, `Nothing`, `Something` |
| **Variables** | camelCase | `selector`, `scope`, `nodes` |
| **Private/internal** | underscore prefix | `_match`, `_update`, `_createTrackingProxy` |
| **Short vars** | Common abbreviations | `n` (node), `i` (index), `k` (key), `v` (value) |
| **Module aliases** | Single letters | `$` and `S` for select, `ui` for UI |

### Exports

Exports are consolidated at the end of each file, not inline.

```javascript
// Named exports for utilities
const query = (selector, scope, limit) => { ... }
class Selection extends Array { ... }

// Default export (one per module)
export default select
// export default ui

// Multiple exports at end of file
export { query, filter, match, Selection, select, S, $ }

// EOF marker required
// EOF
```

### Error Handling
- No try/catch blocks unless necessary
- Return `undefined` or `null` for missing values
- Use early returns for guard clauses

### Performance Patterns
- Use explicit `for` loops instead of higher-order functions (forEach, map, etc.)
- Avoid function calls in tight loops
- Minimize DOM manipulation by batching changes
- Cache selector queries when possible

```javascript
// Preferred - explicit for loop
for (let i = offset; i < n; i++) {
    context = context[path[i]]
}

// Avoid - functional approach
path.forEach(key => {
    context = context[key]
})
```

### Documentation Style

NaturalDocs-style with markdown support.

#### File Template

```javascript
// Project: {{project name}}
// Author:  {{author name}}
// License: {{license}}
// Created: YYYY-MM-DD

// Module: {{module name}}
// {{description of the module, concepts, short examples}}

// ----------------------------------------------------------------------------
//
// SECTION
//
// ----------------------------------------------------------------------------
// ============================================================================
// SUBSECTION
// ============================================================================

// Type: {{name}}
// {{description}}
// {{attribute_list}}

// Function: {{name}}
// {{description with embedded parameters}}

export { {{name}} }

// EOF
```

#### Rules

- **Project headers**: Include project, author, license, and creation date at file top
- **Section delimiters**: Use `// SECTION` and `// SUBSECTION` headers with separators
- **Imports**: Use absolute `@module` when possible, relative `./` and `../` allowed
- **Module-level docs**: Define concepts, keywords, and provide overview
- **Type/Class docs**: Describe purpose; list attributes as bullet points with types
- **Function/Method docs**: Embed parameters in description using backticks; include examples for factory functions and complex APIs
- **Exports**: Named exports listed at file end with explicit `// EOF` marker
- **Examples**: Always use fenced code blocks with language specifier; comment style for examples matches the surrounding code
- **Visibility**: Don't use private/protected, but group internal operations together with a SUBSECTION

#### Example

```javascript
// Project: LittleMake
// Author:  Sebastien Pierre
// License: MIT
// Created: 2024-01-01

// Module: math
// Provides basic arithmetic operations for numeric values. Operations are
// immutable and do not modify input values.

// Function: mul
// Multiplies `a` with `b` and returns the result.
function mul(a, b) {
  return a * b
}

// Class: Point
// Represents a 2D coordinate with `x` and `y` values.
// - x: number - horizontal position
// - y: number - vertical position
class Point {
  constructor(x, y) {
    this.x = x
    this.y = y
  }
}

// Function: createCalculator
// Factory that returns a calculator instance with the given `precision`.
//
// Example:
// ```javascript
// const calc = createCalculator(2)
// calc.add(1.234, 5.678) // returns 6.91
// ```
function createCalculator(precision) {
  return new Calculator(precision)
}

// Class: Calculator
// Provides arithmetic operations with configurable precision.
// - precision: number - decimal places for rounding
class Calculator {
  add(a, b) { ... }
}

export { mul, Point, createCalculator, Calculator }

// EOF
```

### Special Constants
```javascript
// Frozen object singletons for sentinel values
const Nothing = Object.freeze(new Object())
const Something = Object.freeze(new Object())
```

## Tool Versions

Managed via `mise.toml` and SDK make modules.

## Linting

```bash
# Check formatting/linting with Biome
make check-biome

# Auto-format with Biome
make fmt-biome

# Or run all project checks/formatters
make check
make fmt
```

Biome config is in `biome.jsonc`.

## Testing

**No automated testing framework configured.**
- Manual testing via HTML files in `examples/` and `src/html/`
- Run `make run` to start server and test in browser
- Open `examples/todo.html`, `examples/ui-javascript.html`, etc.

## Architecture

Three main modules that work independently:
1. **select.js** - Core DOM/SVG manipulation (jQuery-like API)
2. **select.cells.js** - Reactive state management (cells/derivations)
3. **select.ui.js** - UI templating library

## Distribution

Built files go to `/dist/` as both regular and minified versions:
- `select.js` / `select.min.js`
- `select.cells.js` / `select.cells.min.js`
- `select.ui.js` / `select.ui.min.js`

## Important
- DO NOT use version control, let the user manage commits
- DO NOT start a web server, ask the user to run one for you
- DO NOT remove FIXME, TODO, NOTE, SEE comments unless FIXME and TODO are resolved.
- This is a high-performance library, ensure there's no regression (`bun run bench:inspector`) and minimise memory footprint.
