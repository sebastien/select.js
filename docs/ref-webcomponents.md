# Select Web Components Reference Guide

The Select Web Components module (`select/ui/webcomponents.js`) provides an elegant, lightweight bridge between Select templates (or pure render functions) and native browser Custom Elements (Web Components). 

This guide describes how to register, configure, and use web components with Select, including attribute parsing, styles inheritance, parent event bubbling, and native slot content projection.

---

## The `webcomponent` Function

The main entry point is the `webcomponent()` factory function. It defines and registers a custom element with the browser's `customElements` registry.

```javascript
import { webcomponent } from "./ui.js"

webcomponent(name, componentFactory, initial?, options?)
```

### Parameters

- **`name`** (string): The kebab-case tag name for the custom element (e.g., `"x-card"`). Must contain a hyphen.
- **`componentFactory`** (Function|UITemplate): 
  - A Select template created using `ui(...)`.
  - Or a pure render function of the form `(data, element) => Node|NodeList|string`.
- **`initial`** (Object, optional): Configures default property values and custom attribute processors.
- **`options`** (Object, optional): Custom element behavioral options.

---

## Core Features & Behavior

### 1. Shadow DOM Mounting
By default, web components created with Select use Shadow DOM.
- **`options.shadow`** (boolean, default: `true`): Controls whether a shadow root is attached. When `false`, the component mounts directly to the light DOM (itself).
- **`options.mode`** (string, default: `"open"`): The encapsulation mode (`"open"` or `"closed"`) for the shadow root.

#### Global / Default Options
You can configure the global defaults for all registered web components via **`webcomponent.options`**:

```javascript
import { webcomponent } from "./ui.js"

// Disable Shadow DOM globally (components will mount to Light DOM by default)
webcomponent.options.shadow = false

// Change the default Shadow DOM mode globally
webcomponent.options.mode = "closed"
```

---

### 2. Automatic Document Style Synchronization
Shadow DOM elements are encapsulated from document-level CSS styles by default. Select solves this elegantly by **automatically synchronizing and injecting** the host document head styles into the component's shadow root:

- **How it works:** It queries the host's `<head>` for `<style>` blocks and `<link rel="stylesheet">` elements.
- **Modern Adoption:** On browsers supporting Constructable StyleSheets, it adopts the styles natively via `shadowRoot.adoptedStyleSheets`.
- **Fallback:** In older browsers or testing environments (like Happy DOM), it safely clones and appends style elements to the shadow root.
- **Dynamic Updates:** Select sets up a `MutationObserver` on the host document head to automatically synchronize stylesheet additions, removals, or edits in real-time.
- **Disabling:** If you do not want your web components to inherit global page styles, set `documentStyles: false` in the options:
  ```javascript
  webcomponent("x-isolated", MyTemplate, {}, { documentStyles: false })
  ```

---

### 3. Attribute Parsing & Normalization
Attributes set on the custom element's DOM node are automatically parsed, typed, and bound to the template's data object.

- **Normalization:** Kebab-case attributes are automatically converted to camelCase properties (e.g., `user-name="Ada"` becomes `data.userName = "Ada"`).
- **Type Coercion:** Strings are parsed into corresponding JS types where appropriate:
  - `"true"` and `"false"` become booleans.
  - Numeric strings (e.g. `"42"`, `"3.14"`) become numbers.
- **Attribute Processors:** If a key in the `initial` object is associated with a function, that function acts as an **attribute processor** instead of a default value. It receives `(value, attributeName, componentInstance)` and returns the processed value.
  ```javascript
  webcomponent("x-user", UserTemplate, {
    // Plain property with default value
    role: "guest",
    // Custom attribute processor function
    tags: (val) => val ? val.split(",") : []
  })
  ```
  *Usage in HTML:*
  ```html
  <x-user role="admin" tags="developer,moderator,owner"></x-user>
  ```
- **Explicit Attribute Bindings:** You can map custom attributes to specific data keys or declare extra observed attributes using the options object:
  ```javascript
  webcomponent("x-custom", CustomTemplate, {}, {
    attributes: {
      "user-profile-id": "userId" // maps 'user-profile-id' attribute to 'userId' data
    },
    observedAttributes: ["extra-attribute"]
  })
  ```

For Select UI-backed components created with `ui(...)`, the attribute-derived
data is preloaded before the inner instance runs `init(self, data)`. This means
host markup like `<x-user role="admin"></x-user>` can be read immediately from
the `data` argument inside `init(...)` on first mount.

---

### 4. Reactivity and Cell Bindings
If a `Cell` or other reactive instance from `select/cells.js` is passed as a property or bound to a tracked attribute of the custom element, Select automatically subscribes to its updates and triggers a re-render of the component when the reactive value changes.

When the component is disconnected from the DOM, all active reactive subscriptions are cleaned up automatically to prevent memory leaks.

---

### 5. `ui-parent` and Event Bubbling
Select's Pub/Sub system uses a hierarchical component tree for event bubbling. Native custom elements normally break this chain. 

Select solves this using the special **`ui-parent`** host attribute:
- **Automatic Ingestion:** When a parent Select template contains a kebab-case custom element tag (such as `<x-counter>`), Select **automatically detects and injects** `ui-parent="<parent-instance-id>"` onto the element.
- **Manual Attachment:** If you are mounting a web component in HTML outside a Select template, you can manually set `ui-parent` to keep it linked:
  ```html
  <x-stepper ui-parent="ui-42" count="3"></x-stepper>
  ```
- **Pub/Sub Rebinding:** In `connectedCallback`, the component resolves this ID back to the parent `UIInstance`. Any events triggered via `self.pub("EventName", data)` within the custom element will bubble up seamlessly to the parent component.

---

## Slots & Children Projection

One of the most powerful features of Select Web Components is how standard browser content projection via **`<slot>`** works.

### How it works
Normally, Select templates compile placeholder-based template slots. However, when wrapped as a custom element with a Shadow DOM root, `UIWebComponent` passes `{ nativeSlots: true }` to the underlying `UIInstance`. 

This has two major implications:
1. **No template-based compilation of slots:** Select's compiler does not mutate or replace `<slot>` tags.
2. **Native Slot Delegation:** The browser's native custom element slot delegation mechanism takes over entirely. Standard host children are projected into the Shadow DOM root's `<slot>` elements natively.

This ensures host children are **not adopted or removed** from the host element, allowing parent-side DOM manipulation or templating to work flawlessly on the custom element's children.

---

### Default (Unnamed) Slots

To project all children of your web component into a specific location, simply use an unnamed `<slot>` inside your template.

#### 1. Define the Template
```javascript
import ui, { webcomponent } from "./ui.js"

const Panel = ui(`
  <div class="panel">
    <div class="panel-header">
      <span out="title"></span>
    </div>
    <div class="panel-body">
      <!-- Standard HTML slot for children projection -->
      <slot></slot>
    </div>
  </div>
`).does({
  title: (_self, { title }) => title ?? "Standard Panel"
})

// Register the web component
webcomponent("x-panel", Panel, { title: "My Panel" })
```

#### 2. Declare in HTML
Any children placed inside `<x-panel>` in the host document will be natively projected into the `<div class="panel-body">` wrapper within the Shadow DOM:

```html
<x-panel title="User Details">
  <p>This paragraph is projected into the panel-body slot.</p>
  <button>Click Action</button>
</x-panel>
```

---

### Named Slots

To project specific children into designated areas, use named slots (`<slot name="slotName">`) in your template, and tag host children with the corresponding `slot="slotName"` attribute.

#### 1. Define the Template
```javascript
import ui, { webcomponent } from "./ui.js"

const Card = ui(`
  <article class="card">
    <header class="card-header">
      <slot name="header">Fallback Default Header</slot>
    </header>
    <main class="card-body">
      <!-- Default slot for body -->
      <slot></slot>
    </main>
    <footer class="card-footer">
      <slot name="footer"></slot>
    </footer>
  </article>
`)

// Register the web component
webcomponent("x-card", Card)
```

#### 2. Declare in HTML
```html
<x-card>
  <!-- Projects to slot name="header" -->
  <h2 slot="header">Custom Card Title</h2>

  <!-- Projects to the default slot -->
  <p>This body content will go directly into the card-body element.</p>
  <p>Multiple children in the default slot work seamlessly.</p>

  <!-- Projects to slot name="footer" -->
  <div slot="footer">
    <a href="/docs">Read Documentation</a>
  </div>
</x-card>
```

### Key Advantages of Native Slots in Select
- **Native Browser Performance:** The browser handles content projection directly in the rendering pipeline, yielding excellent performance.
- **Style Isolation/Encapsulation:** Projected elements remain in the light DOM but are rendered inside the shadow DOM layout, meaning they can still be styled by global CSS while being laid out neatly by the web component's local styles.
- **Dynamic Content:** If the parent updates, re-renders, or modifies the children inside `<x-card>`, the browser handles the slot update automatically without needing a template compilation pass or re-render within the custom element itself.

---

## Lifecycle Symbols and Events

The module exports lifecycle symbols that represent custom element state changes:

- **`Disconnect`**: Dispatched when the custom element is disconnected from the DOM.
- **`Adopted`**: Dispatched when the custom element is adopted into a new document.

You can listen to lifecycle changes or attribute changes externally. The custom element dispatches standard custom DOM events prefixed with `wc:`:

```javascript
const element = document.querySelector("x-card")

// Listen to attribute changes (e.g. when 'title' attribute changes)
element.addEventListener("wc:title", (event) => {
  const { name, previous, current } = event.detail
  console.log(`Attribute ${name} changed from ${previous} to ${current}`)
})
```

// EOF
