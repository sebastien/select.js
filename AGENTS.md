# AGENTS.md - Agentic Coding Guidelines

## Build Commands

```bash
# Build all files and minified versions
make all

# Build distribution files only
make dist

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
| **Constants** | UPPER_SNAKE_CASE | `Nothing`, `Something` |
| **Variables** | camelCase | `selector`, `scope`, `nodes` |
| **Private/internal** | underscore prefix | `_match`, `_update`, `_createTrackingProxy` |
| **Short vars** | Common abbreviations | `n` (node), `i` (index), `k` (key), `v` (value) |
| **Module aliases** | Single letters | `$` and `S` for select, `ui` for UI |

### Exports
```javascript
// Named exports for utilities
export const query = (selector, scope, limit) => { ... }
export class Selection extends Array { ... }

// Default exports for main functionality
export default select;
export default ui;

// Multiple exports
export const S = select;
export const $ = select;
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
    context = context[path[i]];
}

// Avoid - functional approach
path.forEach(key => {
    context = context[key];
});
```

### Documentation Style
- Use header comments with title and description
- Include version, URL, and update date
- Document public methods with inline comments
- Use markdown formatting in comments

```javascript
/**
 *
 * # ModuleName
 * ## Description
 *
 * ```
 * Version :  ${VERSION}
 * URL     :  http://github.com/sebastien/select.js
 * Updated :  2021-04-06
 * ```
 *
 * Description text...
 */
```

### Special Constants
```javascript
// Frozen object singletons for sentinel values
const Nothing = Object.freeze(new Object());
const Something = Object.freeze(new Object());
```

## Tool Versions

Managed via mise.toml:
- Python 3
- Bun 1 (for minification)

## Linting

```bash
# Run ESLint (uses .eslintrc.js)
npx eslint src/js/
```

ESLint config: `eslint:recommended`, browser environment, ES2021.

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
