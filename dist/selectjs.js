// src/js/select.cells.js
var Nothing = Object.freeze(new Object);
var Something = Object.freeze(new Object);
var logSelectCells = (level, scope, message, details = {}) => {
  console[level](`[select.cells] ${scope}: ${message}, details`, details);
};
var access = (context, path, offset = 0) => {
  if (path?.length && context !== undefined) {
    const n = path.length;
    for (let i = offset;i < n && context !== undefined && context !== null; i++) {
      context = context[path[i]];
    }
  }
  return context;
};
var assign = (scope, path, value, merge = undefined, offset = 0) => {
  const n = path.length;
  if (n === 0) {
    return merge ? merge(scope, value) : value;
  }
  let root = n > offset && !(scope && scope instanceof Object) ? typeof path[offset] === "number" ? new Array(path[offset]) : {} : scope;
  let s = root;
  let sp = null;
  for (let i = offset;i < n - 1; i++) {
    const k2 = path[i];
    if (!(s && s instanceof Object)) {
      s = typeof k2 === "number" ? new Array(k2) : {};
      if (i === 0) {
        root = s;
      } else {
        sp[path[i - 1]] = s;
      }
    }
    if (typeof k2 === "number" && Array.isArray(s)) {
      while (s.length <= k2) {
        s.push(undefined);
      }
    }
    sp = s;
    s = s[k2];
  }
  const k = path[n - 1];
  s[k] = merge ? merge(s[k], value) : value;
  return root;
};
var normpath = (path) => {
  if (path === Nothing) {
    return null;
  } else if (Array.isArray(path)) {
    return path;
  } else if (path !== undefined) {
    return [path];
  }
  return null;
};

class Selections {
  constructor() {
    this.selections = new Map;
  }
  *iter(path) {
    if (path instanceof Map) {
      for (const [k, v] of path.entries()) {
        if (k !== Something) {
          for (const _ of this.iter(v)) {
            yield _;
          }
        }
      }
      const l = path.get(Something);
      if (l) {
        for (const _ of l) {
          yield _;
        }
      }
    } else {
      const scope = this.scope(path);
      if (scope) {
        for (const _ of this.iter(scope)) {
          yield _;
        }
      }
    }
  }
  scope(path, create = false) {
    path = Array.isArray(path) ? path : path !== undefined && path !== null ? [path] : [];
    let scope = this.selections;
    for (const key of path) {
      if (scope.has(key)) {
        scope = scope.get(key);
      } else if (create) {
        const s = new Map;
        scope.set(key, s);
        scope = s;
      } else {
        return;
      }
    }
    return scope;
  }
  get(path) {
    const scope = this.scope(path);
    return scope ? scope.get(Something) : undefined;
  }
  add(path, value) {
    const scope = this.scope(path, true);
    if (scope.has(Something)) {
      scope.get(Something).push(value);
    } else {
      scope.set(Something, [value]);
    }
    return this;
  }
  remove(path, value) {
    const scope = this.scope(path);
    if (!scope) {
      return false;
    }
    const l = scope ? scope.get(Something) : undefined;
    if (!l) {
      return false;
    }
    const i = l.indexOf(value);
    if (i === -1) {
      return false;
    }
    l.splice(i, 1);
    return true;
  }
}

class Reactive {
  static *Walk(value, path = []) {
    if (value === null || value === undefined || typeof value !== "object") {} else if (value instanceof Reactive) {
      yield [value, path];
    } else if (Array.isArray(value)) {
      for (let i = 0;i < value.length; i++) {
        for (const _ of Reactive.Walk(value[i], [...path, i])) {
          yield _;
        }
      }
    } else if (Object.getPrototypeOf(value) === Object.prototype) {
      for (const k in value) {
        for (const _ of Reactive.Walk(value[k], [...path, k])) {
          yield _;
        }
      }
    }
  }
  static Expand(value) {
    if (value === undefined || value === null || typeof value !== "object") {
      return value;
    } else if (value instanceof Reactive) {
      return value.value;
    } else if (Array.isArray(value)) {
      return value.map((_) => Reactive.Expand(_));
    } else if (Object.getPrototypeOf(value) === Object.prototype) {
      const res = {};
      for (const k in value) {
        res[k] = Reactive.Expand(value[k]);
      }
      return res;
    } else {
      return value;
    }
  }
  constructor(value = Nothing) {
    this.isReactive = true;
    this.value = value === Nothing ? undefined : value;
    this.previous = undefined;
    this.isPending = false;
    this.revision = value === Nothing ? -1 : 0;
    this.subs = [];
    this.selections = undefined;
  }
  select(path) {
    path = Array.isArray(path) ? path : [path];
    this.selections = this.selections ?? new Selections;
    const sel = new Selected(this.value, path);
    sel.parent = this;
    sel.path = path;
    this.selections.add(path, sel);
    return sel;
  }
  sub(handler) {
    this.subs.push(handler);
    return this;
  }
  unsub(handler) {
    const i = this.subs.indexOf(handler);
    if (i >= 0) {
      this.subs.splice(i, 1);
    }
    return this;
  }
  pub(value, path, origin) {
    for (const handler of this.subs) {
      handler(value, path, origin);
    }
    return this;
  }
  refresh() {
    throw new Error(`${this.constructor.name}.refresh()} not implemented`);
  }
  get length() {
    if (this.revision === -1 || this.value === null || this.value === undefined) {
      return 0;
    } else if (Array.isArray(this.value)) {
      return this.value.length;
    } else if (Object.getPrototypeOf(this.value) === Object.prototype) {
      return Object.keys(this.value).length;
    } else {
      return 1;
    }
  }
  map(functor) {
    if (this.revision === -1) {
      return null;
    } else if (this.value === undefined) {
      return null;
    } else if (Array.isArray(this.value)) {
      return this.value.map(functor);
    } else if (Object.getPrototypeOf(this.value) === Object.prototype) {
      const res = [];
      for (const k in this.value) {
        res[k] = functor(this.value[k]);
      }
      return res;
    } else {
      return [functor(this.value)];
    }
  }
  get(key = Nothing) {
    if (key === Nothing) {
      return this.value;
    }
    return access(this.value, normpath(key));
  }
}

class Selected extends Reactive {
  constructor(parent, path) {
    super(access(parent, path));
    this.parent = parent;
    this.path = path;
  }
  dispose() {
    this.parent?.selections?.remove(this.path, this);
    this.parent = undefined;
    this.path = undefined;
    this.subs.length = 0;
    return this;
  }
  refresh() {
    const value = access(this.parent.value, this.path);
    this.previous = this.value;
    this.value = value;
    this.isPending = !!(value && typeof value.then === "function");
    this.revision++;
    this.pub(value, this.path, this.parent);
  }
  set(value, path = Nothing, force = false) {
    path = normpath(path);
    return this.parent.set(value, path ? [...this.path, ...path] : this.path, force);
  }
}

class Cell extends Reactive {
  constructor(value = Nothing) {
    super(value);
  }
  _update(value, path, _force = false) {
    path = normpath(path);
    const updated = path ? assign(this.value, path, value) : value;
    this.previous = this.value;
    this.value = updated;
    this.isPending = !!(updated && typeof updated.then === "function");
    this.revision++;
    if (this.selections) {
      for (const r of this.selections.iter(path)) {
        r.refresh();
      }
    }
    this.pub(value, path, this);
  }
  set(value, path = Nothing, force = false) {
    this._update(value, path, force);
    return this;
  }
  push(value) {
    const updated = this.revision === -1 ? [value] : Array.isArray(this.value) ? [...this.value, value] : [this.value, value];
    this._update(updated, Nothing);
    return this;
  }
}

class Deferred extends Cell {
  constructor(value = Nothing, delay = 0) {
    super(value);
    this.delay = delay;
    this._timer = null;
  }
  set(value, path = Nothing, force = false) {
    if (this._timer) {
      clearTimeout(this._timer);
    }
    this._timer = setTimeout(() => {
      this._timer = null;
      this._update(value, path, force);
    }, this.delay);
  }
  dispose() {
    if (this._timer) {
      clearTimeout(this._timer);
      this._timer = null;
    }
    return this;
  }
}

class Derivation extends Reactive {
  constructor(template, processor = undefined, initial = true) {
    super();
    this.template = template;
    this.processor = processor;
    this.reactors = [];
    this.sources = [];
    this.isBound = false;
    this.expanded = Reactive.Expand(template);
    this._promiseToken = 0;
    this.revision = initial ? 0 : -1;
    if (initial) {
      this._apply(this._compute(), false);
    } else {
      this.value = undefined;
    }
    this.bind();
  }
  _compute() {
    return this.processor ? Array.isArray(this.expanded) ? this.processor(...this.expanded) : this.processor(this.expanded) : this.expanded;
  }
  _apply(value, publish = true) {
    const token = ++this._promiseToken;
    this.previous = this.value;
    this.value = value;
    this.isPending = !!(value && typeof value.then === "function");
    if (publish) {
      this.revision++;
      this.pub();
    }
    if (value && typeof value.then === "function") {
      value.then((resolved) => {
        if (token !== this._promiseToken) {
          return;
        }
        this.previous = this.value;
        this.value = resolved;
        this.isPending = false;
        this.revision++;
        this.pub();
      }, (error) => {
        if (token !== this._promiseToken) {
          return;
        }
        this.isPending = false;
        logSelectCells("error", "Derivation._apply", "derived promise rejected", { error });
      });
    }
  }
  bind() {
    if (this.isBound) {
      return this;
    }
    this.isBound = true;
    for (const [cell, path] of Reactive.Walk(this.template)) {
      const reactor = (value, sourcePath) => {
        const fullPath = sourcePath === undefined || sourcePath === null ? path : Array.isArray(sourcePath) ? [...path, ...sourcePath] : [...path, sourcePath];
        this.expanded = assign(this.expanded, fullPath, value);
        this._apply(this._compute());
      };
      cell.sub(reactor);
      this.sources.push(cell);
      this.reactors.push(reactor);
    }
    return this;
  }
  unbind() {
    if (!this.isBound) {
      return this;
    }
    for (let i = 0;i < this.sources.length; i++) {
      this.sources[i].unsub(this.reactors[i]);
    }
    while (this.reactors.length) {
      this.reactors.pop();
    }
    while (this.sources.length) {
      this.sources.pop();
    }
    this.isBound = false;
    return this;
  }
  dispose() {
    this.unbind();
    this._promiseToken++;
    this.subs.length = 0;
    this.template = undefined;
    return this;
  }
  refresh() {
    this._apply(this._compute());
    return this;
  }
}
function cell(value) {
  return new Cell(value);
}
function deferred(value, delay) {
  return new Deferred(value, delay);
}
function derived(template, processor, initial) {
  return new Derivation(template, processor, initial);
}
var walk = Reactive.Walk;
var expand = Reactive.Expand;
var select_cells_default = Object.assign(cell, { deferred, derived, walk, expand });
// src/js/select.js
var _match = Element.prototype.matches ? 1 : Element.prototype.mozMatchesSelector ? 2 : Element.prototype.webkitMatchesSelector ? 3 : null;
var logSelect = (level, scope, message, details = {}) => {
  console[level](`[select] ${scope}: ${message}, details`, details);
};
var match = _match ? (selector, node) => {
  let index;
  if (selector.startsWith(":first")) {
    selector = selector.substring(0, selector.length - 6);
    index = 0;
  }
  if (index === undefined) {
    try {
      switch (_match) {
        case 1:
          return node?.matches?.(selector);
        case 2:
          return node?.mozMatchesSelector?.(selector);
        case 3:
          return node?.webkitMatchesSelector?.(selector);
        default:
          logSelect("error", "match", "browser not supported", {
            selector,
            node,
            match: _match
          });
          select.STATUS = "FAILED";
          return node.matches(selector);
      }
    } catch (e) {
      logSelect("error", "match", "exception occurred with selector", {
        selector,
        node,
        error: e
      });
      return null;
    }
  } else {
    const matches = query(selector, undefined, index);
    return matches[index] === node;
  }
} : (selector, node) => {
  if (selector.endsWith(":first")) {
    return query(selector, node) === node;
  } else {
    const parent = node.parentNode;
    if (parent) {
      const matching = parent.querySelectorAll(selector);
      for (let i = 0;i < matching.length; i++) {
        if (matching[i] === node) {
          return true;
        }
      }
    }
    return false;
  }
};
var query = (selector, scope, _limit) => {
  selector = selector.trim();
  if (!selector || selector.length === 0) {
    return [scope];
  } else if (selector[0] === ">") {
    selector = selector.substr(1).trim();
    const i = Math.min(Math.max(selector.indexOf(">"), 0), Math.max(selector.indexOf(" "), 0));
    const selector_node = i > 0 ? selector.substring(0, i) : selector;
    const selector_child = i > 0 ? selector.substring(i, selector.length) : null;
    const matching = [];
    const nodes = (scope || document).childNodes;
    let result = null;
    for (let j = 0;j < nodes.length; j++) {
      const n = nodes[j];
      if (match(selector_node, n) && n.nodeType === Node.ELEMENT_NODE) {
        matching.push(n);
      }
    }
    if (selector_child) {
      result = [];
      for (let j = 0;j < matching.length; j++) {
        result = result.concat(select.query(selector_child, matching[j]));
      }
    } else {
      result = matching;
    }
    return result;
  } else {
    let index;
    if (selector.endsWith(":first")) {
      selector = selector.substring(0, selector.length - 6);
      index = 0;
    }
    const result = [];
    const nodes = (scope || document).querySelectorAll(selector);
    let count = 0;
    for (let i = 0;i < nodes.length; i++) {
      const node = nodes[i];
      if (node.nodeType === Node.ELEMENT_NODE) {
        if (index === undefined) {
          result.push(node);
          count += 1;
        } else if (index === count) {
          result.push(node);
          break;
        } else {
          count += 1;
        }
      }
    }
    return result;
  }
};
var filter = (selector, nodes) => {
  const result = [];
  for (let i = 0;i < nodes.length; i++) {
    const node = nodes[i];
    if (match(selector, node)) {
      result.push(node);
    }
  }
  return result;
};

class Selection extends Array {
  constructor(selector, scope) {
    super();
    let nodes = null;
    if (typeof selector === "string") {
      if (!scope) {
        nodes = query(selector);
      } else {
        scope = select(scope);
        nodes = scope.find(selector);
      }
    } else if (Selection.Is(selector)) {
      nodes = selector;
      scope = selector.scope;
      selector = selector.selector;
      if (selector.scope && scope !== selector.scope) {
        logSelect("error", "Selection.new", "given scope differs from first argument's", { scope, selectorScope: selector.scope });
      }
    } else if (selector) {
      nodes = Selection.AsElementList(selector);
    }
    this.selector = selector;
    this.scope = scope;
    this.isSelection = true;
    this.expand(nodes);
  }
  static Is(s) {
    return s && s.__class__ === Selection;
  }
  static IsList(s) {
    return s instanceof Selection || Array.isArray(s) || s instanceof NodeList;
  }
  static IsElement(node) {
    return node && typeof node.nodeType !== "undefined" && node.nodeType === Node.ELEMENT_NODE;
  }
  static IsText(node) {
    return node && typeof node.nodeType !== "undefined" && node.nodeType === Node.TEXT_NODE;
  }
  static IsNode(node) {
    return node && typeof node.nodeType !== "undefined";
  }
  static IsDOM(node) {
    return node && typeof node.getBBox === "undefined";
  }
  static IsSVG(node) {
    return typeof node.getBBox !== "undefined";
  }
  static IsSelection(value) {
    return value instanceof Selection;
  }
  static AsElementList(value) {
    if (!value) {
      return value;
    } else if (value.nodeType === Node.ELEMENT_NODE) {
      return [value];
    } else if (value.nodeType === Node.DOCUMENT_FRAGMENT_NODE || value.nodeType === Node.DOCUMENT_NODE) {
      const res = [];
      let child = value.firstElementChild;
      while (child) {
        res.push(child);
        child = child.nextSibling;
      }
      return res;
    } else if (value === window) {
      return Selection.AsElementList(window.document);
    } else if (Selection.IsList(value)) {
      let res = [];
      for (let i = 0;i < value.length; i++) {
        res = res.concat(Selection.AsElementList(value[i]));
      }
      return res;
    } else {
      return [];
    }
  }
  static Ensure(node) {
    return Selection.Is(node) ? node : new Selection(node);
  }
  find(selector) {
    if (this.length === 0) {
      return new Selection;
    }
    const nodes = [];
    for (let i = 0;i < this.length; i++) {
      const node = this[i];
      const q = query(selector, node);
      for (let j = 0;j < q.length; j++) {
        nodes.push(q[j]);
      }
    }
    return new Selection(nodes, this);
  }
  filter(selector) {
    if (typeof selector === "string") {
      return new Selection(filter(selector, this), this.length > 0 ? this : undefined);
    } else if (typeof selector === "function") {
      return new Selection(Array.prototype.filter.apply(this, [selector]));
    } else {
      logSelect("error", "Selection.filter", "selector string or predicate expected", { selector });
      return None;
    }
  }
  iterate(callback) {
    for (let i = 0;i < this.length; i++) {
      if (callback(new Selection(this[i]), i) === false) {
        break;
      }
    }
    return this;
  }
  like(selector) {
    return this.is(selector);
  }
  is(selector) {
    if (typeof selector === "string") {
      let result = this.length > 0;
      for (let i = 0;i < this.length; i++) {
        if (!match(selector, this[i])) {
          result = false;
          break;
        }
      }
      return result;
    } else {
      return this.equals(selector);
    }
  }
  list() {
    return this.map(Selection.Ensure);
  }
  first() {
    return this.length <= 1 ? this : select([this[0]], this);
  }
  last() {
    return this.length <= 1 ? this : select([this[this.length - 1]], this);
  }
  get(index) {
    index = index < 0 ? this.length + index : index;
    if (this.length === 1 && index === 0) {
      return this;
    } else {
      return 0 <= index && index < this.length ? select([this[index]], this) : new Selection;
    }
  }
  eq(index) {
    return this.get(index);
  }
  next(selector) {
    const nodes = [];
    for (let i = 0;i < this.length; i++) {
      const node = this[i];
      const sibling = node.nextElementSibling;
      if (sibling && (!selector || match(selector, sibling))) {
        nodes.push(sibling);
      }
    }
    return nodes.length > 0 ? select(nodes, this) : new Selection;
  }
  prev(selector) {
    return this.previous(selector);
  }
  previous(selector) {
    const nodes = [];
    for (let i = 0;i < this.length; i++) {
      const node = this[i];
      const sibling = node.previousElementSibling;
      if (sibling && (!selector || match(selector, sibling))) {
        nodes.push(sibling);
      }
    }
    return nodes.length > 0 ? select(nodes, this) : new Selection;
  }
  parent(selector) {
    const nodes = [];
    for (let i = 0;i < this.length; i++) {
      const node = this[i].parentNode;
      if (node && (!selector || match(selector, node))) {
        nodes.push(node);
      }
    }
    return nodes.length > 0 ? select(nodes, this) : new Selection;
  }
  ancestors(selector, limit) {
    return this.parents(selector, limit);
  }
  parents(selector, limit) {
    const nodes = [];
    const depth_limit = typeof limit === "number" ? limit : -1;
    const node_limit = limit && typeof limit !== "number" ? select(limit) : null;
    const is_function = typeof selector === "function";
    const is_string = typeof selector === "string";
    if (is_string && selector.endsWith(":first")) {
      selector = selector.substring(0, selector.length - 6);
      const _index = 0;
    }
    for (let i = 0;i < this.length; i++) {
      let node = this[i].parentNode;
      while (node) {
        let matches = true;
        if (selector) {
          if (is_function) {
            matches = selector(node, i);
          } else if (is_string) {
            matches = match(selector, node);
          }
        }
        if (matches) {
          nodes.push(node);
          if (depth_limit >= 0 && nodes.length >= depth_limit) {
            return select(nodes, this);
          }
        }
        node = node.parentNode;
        if (node_limit?.contains(node)) {
          node = null;
        }
      }
    }
    return nodes.length > 0 ? select(nodes, this) : new Selection;
  }
  children(selector) {
    const nodes = [];
    for (let i = 0;i < this.length; i++) {
      const node = this[i];
      for (let j = 0;j < node.childNodes.length; j++) {
        const child = node.childNodes[j];
        if (Selection.IsElement(child) && (!selector || match(selector, child))) {
          nodes.push(child);
        }
      }
    }
    return nodes.length > 0 ? select(nodes, this) : new Selection;
  }
  nodes(callback) {
    const nodes = [];
    for (let i = 0;i < this.length; i++) {
      const node = this[i];
      for (let j = 0;j < node.childNodes.length; j++) {
        const child = node.childNodes[j];
        if (!callback || callback(child, i, node) !== false) {
          nodes.push(child);
        } else {
          return nodes;
        }
      }
    }
    return nodes;
  }
  walk(callback) {
    if (!callback) {
      return this;
    }
    const to_walk = [];
    let count = 0;
    for (let i = 0;i < this.length; i++) {
      const node = this[i];
      to_walk.push(node);
      while (to_walk.length > 0) {
        const node2 = to_walk.pop();
        if (callback && callback(node2, count++) === false) {
          return this;
        }
        for (let j = 0;j < node2.childNodes.length; j++) {
          to_walk.push(node2.childNodes[j]);
        }
      }
    }
    return this;
  }
  append(value) {
    if (this.length === 0) {
      return this;
    }
    const node = this[0];
    if (Selection.Is(value)) {
      for (let i = 0;i < value.length; i++) {
        node.appendChild(value[i]);
      }
    } else if (value && typeof value.nodeType !== "undefined") {
      node.appendChild(value);
    } else if (Selection.IsList(value)) {
      for (let i = 0;i < value.length; i++) {
        this.append(value[i]);
      }
    } else if (typeof value === "string") {
      for (let i = 0;i < this.length; i++) {
        this[i].appendChild(document.createTextNode(value));
      }
    } else if (typeof value === "number") {
      for (let i = 0;i < this.length; i++) {
        this[i].appendChild(document.createTextNode(value));
      }
    } else if (value) {
      logSelect("error", "Selection.append", "value is expected to be Number, String, Node, [Node] or Selection", { value });
    }
    return this;
  }
  prepend(value) {
    if (this.length === 0) {
      return this;
    }
    const node = this[0];
    const child = node.firstChild;
    if (!child) {
      return this.append(value);
    }
    if (Selection.Is(value)) {
      for (let i = 0;i < value.length; i++) {
        node.insertBefore(value[i], child);
      }
    } else if (value && typeof value.nodeType !== "undefined") {
      node.insertBefore(value, child);
    } else if (Selection.IsList(value)) {
      for (let i = 0;i < value.length; i++) {
        this.prepend(value[i]);
      }
    } else if (typeof value === "string") {
      for (let i = 0;i < this.length; i++) {
        this[i].insertBefore(document.createTextNode(value), child);
      }
    } else if (typeof value === "number") {
      for (let i = 0;i < this.length; i++) {
        this[i].insertBefore(document.createTextNode(value), child);
      }
    } else if (value) {
      logSelect("error", "Selection.prepend", "value is expected to be Number, String, Node, [Node] or Selection", { value });
    }
    return this;
  }
  remove() {
    for (let i = 0;i < this.length; i++) {
      const node = this[i];
      if (node.parentNode) {
        node.parentNode.removeChild(node);
      }
    }
    return this;
  }
  extend(value) {
    if (Selection.IsNode(value)) {
      this.push(value);
    } else if (Selection.IsList(value)) {
      for (let i = 0;i < value.length; i++) {
        this.extend(value[i]);
      }
    } else {
      logSelect("error", "Selection.extend", "value must be a node, selection or list", { value });
    }
    return this;
  }
  after(value) {
    if (this.length === 0) {
      return this;
    }
    const node = this[0];
    let scope = node;
    while (scope && !Selection.IsElement(scope.nextSibling)) {
      scope = scope.nextSibling;
    }
    if (scope) {
      if (Selection.Is(value)) {
        for (let i = 0;i < value.length; i++) {
          scope.parentNode.insertBefore(value[i], scope);
        }
      } else if (typeof value.length !== "undefined") {
        for (let i = 0;i < value.length; i++) {
          scope.parentNode.insertBefore(value[i], scope);
        }
      } else if (typeof value.nodeType !== "undefined") {
        scope.parentNode.insertBefore(value, scope);
      } else {
        logSelect("error", "Selection.after", "value is expected to be Node, [Node] or Selection", { value });
      }
    } else {
      scope = node.parentNode;
      if (Selection.Is(value)) {
        for (let i = 0;i < value.length; i++) {
          scope.appendChild(value[i]);
        }
      } else if (typeof value.length !== "undefined") {
        for (let i = 0;i < value.length; i++) {
          scope.appendChild(value[i]);
        }
      } else if (typeof value.nodeType !== "undefined") {
        scope.appendChild(value);
      } else {
        logSelect("error", "Selection.after", "value is expected to be Node, [Node] or Selection", { value });
      }
    }
    return this;
  }
  before(value) {
    if (this.length === 0) {
      return this;
    }
    const node = this[0];
    const scope = node;
    const parent = scope.parentNode;
    if (Selection.Is(value)) {
      for (let i = 0;i < value.length; i++) {
        parent.insertBefore(value[i], scope);
      }
    } else if (typeof value.length !== "undefined") {
      for (let i = 0;i < value.length; i++) {
        parent.insertBefore(value[i], scope);
      }
    } else if (typeof value.nodeType !== "undefined") {
      parent.insertBefore(value, scope);
    } else {
      logSelect("error", "Selection.before", "value is expected to be Node, [Node] or Selection", { value });
    }
    return this;
  }
  replaceWith(value) {
    if (this.length === 0) {
      logSelect("warn", "Selection.replaceWith", "current selection is empty, so given nodes will be removed", { value });
      if (Selection.IsNode(value)) {
        if (value.parentNode) {
          value.parentNode.removeChild(value);
        }
      } else if (Selection.IsSelection(value) || Selection.IsList(value)) {
        for (let i = 0;i < value.length; i++) {
          const node = value[i];
          if (node.parentNode) {
            node.parentNode.removeChild(node);
          }
        }
      }
      return this;
    } else {
      const scope = this[0];
      const parent = scope.parentNode;
      const added = [];
      if (Selection.IsNode(value)) {
        if (parent) {
          parent.insertBefore(value, scope);
        }
        added.push(value);
      } else if (Selection.IsSelection(value) || Selection.IsList(value)) {
        const added2 = [];
        for (let i = 0;i < value.length; i++) {
          const n = value[i];
          if (parent) {
            parent.insertBefore(n, scope);
          }
          added2.push(n);
        }
      } else {
        logSelect("error", "Selection.replaceWith", "value is expected to be Node, [Node] or Selection", { value });
      }
      while (this.length > 0) {
        const n = this.pop();
        if (n.parentNode) {
          n.parentNode.removeChild(n);
        }
      }
      while (added.length > 0) {
        this.push(added.pop());
      }
    }
    return this;
  }
  equals(node) {
    if (typeof node === "string") {
      return this.equals(query(node));
    } else if (Array.isArray(node)) {
      if (node.length !== this.length) {
        return false;
      }
      for (let i = 0;i < this.length; i++) {
        if (node[i] !== this[i]) {
          return false;
        }
      }
      return true;
    } else if (Selection.IsElement(node)) {
      return this.length === 1 && this[0] === node;
    } else {
      return false;
    }
  }
  contains(node) {
    if (Array.isArray(node) || Selection.IsElement(node)) {
      let found = true;
      for (let i = 0;found && i < this.length; i++) {
        found = this.indexOf(node[i]) >= 0;
      }
      return found;
    } else {
      return this.indexOf(node) >= 0;
    }
  }
  wrap(node) {
    node = $(node);
    node.add(this);
    return node;
  }
  clone() {
    if (this.length === 0) {
      return new (Object.getPrototypeOf(this)).constructor;
    }
    let res;
    for (const child of this) {
      if (res === undefined) {
        res = new (Object.getPrototypeOf(this)).constructor(child.cloneNode(true));
      } else {
        res.push(child.cloneNode(true));
      }
    }
    return res;
  }
  empty() {
    for (let i = 0;i < this.length; i++) {
      const node = this[i];
      while (node.firstChild) {
        node.removeChild(node.firstChild);
      }
    }
    return this;
  }
  isEmpty() {
    return this.length === 0;
  }
  val(value) {
    return this.value(value);
  }
  value(value) {
    if (typeof value === "undefined") {
      for (let i = 0;i < this.length; i++) {
        const node = this[i];
        if (typeof node.value !== "undefined") {
          return node.value;
        } else if (node.hasAttribute("contenteditable")) {
          return node.textContent;
        }
      }
      return;
    } else {
      value = `${value}`;
      for (let i = 0;i < this.length; i++) {
        const node = this[i];
        if (typeof node.value !== "undefined") {
          node.value = value;
        } else if (node.hasAttribute("contenteditable")) {
          node.textContent = value;
        }
      }
      return this;
    }
  }
  text(value) {
    let result;
    if (typeof value === "undefined") {
      for (let i = 0;i < this.length; i++) {
        const node = this[i];
        result = node.textContent;
        if (result) {
          return result;
        }
      }
      return result;
    } else {
      value = value === null || value === undefined ? "" : typeof value === "number" ? `${value}` : typeof value === "string" ? value : JSON.stringify(value);
      for (let i = 0;i < this.length; i++) {
        const node = this[i];
        switch (node.nodeName) {
          case "INPUT":
          case "TEXTAREA":
          case "SELECT":
            if (node.value !== value) {
              node.value = value;
            }
            break;
          default:
            node.textContent = value;
        }
      }
      return this;
    }
  }
  html(value) {
    return this.contents(value);
  }
  contents(value) {
    let result;
    if (typeof value === "undefined") {
      for (let i = 0;i < this.length; i++) {
        const node = this[i];
        result = node.innerHTML;
        if (result) {
          return result;
        }
      }
      return result;
    } else {
      if (!value || typeof value === "string" || typeof value === "number") {
        value = value || "";
        for (let i = 0;i < this.length; i++) {
          const node = this[i];
          node.innerHTML = value;
        }
        return this;
      } else {
        return this.empty().append(value);
      }
    }
  }
  attr(name, ...rest) {
    if (typeof name === "string") {
      if (rest.length === 0) {
        for (let i = 0;i < this.length; i++) {
          const node = this[i];
          if (node.hasAttribute(name)) {
            return node.getAttribute(name);
          }
        }
        return;
      } else {
        let value = rest[0];
        value = typeof value === "string" ? value : value === null ? value : JSON.stringify(value);
        for (let i = 0;i < this.length; i++) {
          const node = this[i];
          if (value === null) {
            if (node.hasAttribute(name)) {
              node.removeAttribute(name);
            }
          } else {
            node.setAttribute(name, value);
          }
        }
        return this;
      }
    } else if (name) {
      for (const k in name) {
        this.attr(k, name[k]);
      }
      return this;
    }
    return this;
  }
  data(name, value, _serialize) {
    if (!name) {
      const node = this[0];
      if (!node) {
        return;
      }
      if (node.dataset) {
        const r2 = {};
        for (const k in node.dataset) {
          let v = node.dataset[k];
          try {
            v = JSON.parse(v);
          } catch (_e) {}
          r2[k] = v;
        }
        return r2;
      }
      const a = node.attributes;
      let r;
      for (let j = 0;j < a.length; j++) {
        const _ = a[j];
        const n = _.name;
        if (n.startsWith("data-")) {
          let v = _.value;
          try {
            v = JSON.parse(v);
          } catch (_e) {}
          r = r || {};
          r[n.substring(5, n.length)] = v;
        }
      }
      return r;
    } else if (typeof name === "string") {
      const data_name = `data-${name}`;
      let serialized;
      if (typeof value === "undefined") {
        for (let i = 0;i < this.length; i++) {
          const node = this[i];
          let attr_value;
          if (node.hasAttribute(data_name)) {
            attr_value = node.getAttribute(data_name);
          }
          let value2 = typeof node.dataset !== "undefined" ? node.dataset[name] : attr_value;
          try {
            value2 = JSON.parse(value2);
          } catch (_e) {}
          if (typeof value2 !== "undefined") {
            return value2;
          }
        }
        return;
      } else {
        serialized = typeof value === "string" ? value : JSON.stringify(value);
        for (let i = 0;i < this.length; i++) {
          const node = this[i];
          if (typeof node.dataset !== "undefined") {
            node.dataset[name] = serialized;
          } else {
            node.setAttribute(data_name, serialized);
          }
        }
        return this;
      }
    } else {
      for (const k in name) {
        this.data(k, name[k]);
      }
      return this;
    }
  }
  addClass(...classNames) {
    if (classNames.length > 1) {
      for (let i = 0;i < classNames.length; i++) {
        this.addClass(classNames[i]);
      }
      return this;
    }
    const className = classNames[0];
    if (Array.isArray(className)) {
      for (let i = 0;i < className.length; i++) {
        this.addClass(className[i]);
      }
      return this;
    }
    for (let i = 0;i < this.length; i++) {
      const node = this[i];
      if (node.classList) {
        node.classList.add(className);
      } else {
        const c = node.getAttribute("class");
        if (c && c.length > 0) {
          const m = c.indexOf(className);
          const la = c.length || 0;
          const lc = className.length;
          const n = m + lc;
          const p = m - 1;
          if (!((m === 0 || c[p] === " ") && (n === la || c[n] === " "))) {
            node.setAttribute(`${c} ${className}`);
          }
        } else {
          node.setAttribute(className);
        }
      }
    }
    return this;
  }
  removeClass(className) {
    for (let i = 0;i < this.length; i++) {
      const node = this[i];
      if (node.classList) {
        node.classList.remove(className);
      } else {
        let c = node.getAttribute("class");
        if (c && c.length > 0) {
          const m = c.indexOf(className);
          if (m >= 0) {
            const la = c.length || 0;
            const lc = className.length;
            let nc = "";
            while (m >= 0) {
              const n = m + lc;
              const p = m - 1;
              if ((m === 0 || c[p] === " ") && (n === la || c[n] === " ")) {
                nc += c.substr(0, m);
              } else {
                nc += c.substr(0, m + lc);
              }
              c = c.substr(m + lc);
            }
            nc += c;
            node.setAttribute("class", nc);
          }
        }
      }
    }
    return this;
  }
  hasClass(name) {
    const lc = (name || "").length;
    for (let i = 0;i < this.length; i++) {
      const node = this[i];
      if (typeof node.classList !== "undefined") {
        return node.classList.contains(name);
      } else {
        const c = node.className || "";
        if (c && c.length > 0) {
          const m = c.indexOf(name);
          if (m >= 0) {
            const la = c.length || 0;
            const p = m - 1;
            const n = m + lc + 1;
            if ((m === 0 || c[p] === " ") && (m === la || c[n] === " ")) {
              return true;
            }
          }
        }
      }
    }
    return false;
  }
  toggleClass(name, value) {
    const sel = select();
    const is_function = value instanceof Function;
    for (let i = 0;i < this.length; i++) {
      const node = this[i];
      const v = is_function ? value(node, i) : value;
      sel.set(this[i]);
      if (typeof value === "undefined") {
        if (sel.hasClass(name)) {
          sel.removeClass(name);
        } else {
          sel.addClass(name);
        }
      } else if (v && !sel.hasClass(name)) {
        sel.addClass(name);
      } else if (!v && sel.hasClass(name)) {
        sel.removeClass(name);
      }
    }
    return this;
  }
  css(name, value) {
    if (typeof name === "string") {
      if (typeof value === "undefined") {
        for (let i = 0;i < this.length; i++) {
          const style = document.defaultView.getComputedStyle(this[i], null)[name];
          if (typeof style !== "undefined") {
            return style;
          }
        }
        return;
      } else {
        value = typeof value === "string" ? value : `${value}px`;
        for (let i = 0;i < this.length; i++) {
          this[i].style[name] = value;
        }
        return this;
      }
    } else {
      for (const k in name) {
        this.css(k, name[k]);
      }
      return this;
    }
  }
  width() {
    const node = this[0];
    if (!node) {
      return 0;
    }
    const nb = node.getBoundingClientRect();
    return nb.right - nb.left;
  }
  height() {
    const node = this[0];
    if (!node) {
      return 0;
    }
    const nb = node.getBoundingClientRect();
    return nb.bottom - nb.top;
  }
  offset() {
    const node = this[0];
    if (!node) {
      return;
    }
    if (Selection.IsDOM(node)) {
      return { left: node.offsetLeft, top: node.offsetTop };
    }
    const nb = node.getBoundingClientRect();
    const pb = node.parentNode.getBoundingClientRect();
    return { left: nb.left - pb.left, top: nb.top - pb.top };
  }
  scrollTop(value) {
    const has_value = value !== undefined && value !== null;
    for (let i = 0;i < this.length; i++) {
      const node = this[i];
      if (Selection.IsDOM(node)) {
        if (has_value) {
          node.scrollTop = value;
        } else {
          return node.scrollTop;
        }
      } else {
        logSelect("error", "Selection.scrollTop", "not implemented for SVG", {
          node,
          value
        });
      }
    }
    return;
  }
  scrollLeft(value) {
    const has_value = value !== undefined && value !== null;
    for (let i = 0;i < this.length; i++) {
      const node = this[i];
      if (Selection.IsDOM(node)) {
        if (has_value) {
          node.scrollLeft = value;
        } else {
          return node.scrollLeft;
        }
      } else {
        logSelect("error", "Selection.scrollLeft", "not implemented for SVG", {
          node,
          value
        });
      }
    }
    return;
  }
  focus(callback) {
    if (typeof callback === "undefined") {
      for (let i = 0;i < this.length; i++) {
        const node = this[i];
        if (node.focus) {
          node.focus();
          if (document.activeElement === node) {
            return this;
          }
        }
      }
      return this;
    } else {
      return this.bind("focus", callback);
    }
  }
  select(callback) {
    if (typeof callback === "undefined") {
      const s = window.getSelection();
      s.removeAllRanges();
      for (let i = 0;i < this.length; i++) {
        const node = this[i];
        if (node.select) {
          node.select();
        } else {
          const r = new Range;
          if (node.nodeType === node.TEXT_NODE) {
            r.selectNode(node);
          } else {
            r.selectNodeContents(node);
          }
          s.removeAllRanges();
          s.addRange(r);
        }
      }
      return this;
    } else {
      return this.bind("select", callback);
    }
  }
  bind(event, callback, capture) {
    capture = capture && true;
    for (let i = 0;i < this.length; i++) {
      const node = this[i];
      node.addEventListener(event, callback, capture);
    }
    return this;
  }
  unbind(event, callback) {
    for (let i = 0;i < this.length; i++) {
      const node = this[i];
      node.removeEventListener(event, callback);
    }
    return this;
  }
  trigger(event) {
    if (typeof event === "string") {
      event = new CustomEvent(event, { bubbles: true, cancelable: true });
    }
    for (let i = 0;i < this.length; i++) {
      const node = this[i];
      node.dispatchEvent(event);
    }
    return this;
  }
  node(index) {
    index = index === undefined ? 0 : index;
    index = index < 0 ? this.length - index : index;
    if (index >= 0 && index < this.length) {
      return this[index];
    } else {
      return;
    }
  }
  set(value) {
    return this.clear().expand(value);
  }
  copy(value) {
    return new Selection().expand(value);
  }
  clear(length) {
    length = length || 0;
    super.splice(length, this.length - length);
    return this;
  }
  expand(element) {
    if (element === window || element === document) {
      element = document.firstElementChild;
    }
    if (!element || element.length === 0) {
      return this;
    } else if (typeof element === "string") {
      return this.expand(query(element));
    } else if (Selection.IsElement(element)) {
      this.push(element);
    } else if (element.nodeType === Node.DOCUMENT_NODE) {
      this.expand(element.firstElementChild);
    } else if (element instanceof NodeList || Selection.IsList(element)) {
      for (let i = 0;i < element.length; i++) {
        this.expand(element[i]);
      }
    } else {
      logSelect("error", "Selection.expand", "unsupported argument", {
        element
      });
    }
    return this;
  }
}
var select = (selector, scope) => {
  return Selection.Is(selector) && !scope ? selector : new Selection(selector, scope);
};
Object.assign(select, {
  Selection,
  VERSION: "1.0.0b0",
  NAME: "select",
  STATUS: "LOADED",
  isNode: Selection.IsNode,
  isText: Selection.IsText,
  filter,
  match,
  query,
  select
});
var S = select;
var $ = select;
var select_default = select;
// src/js/select.ui.js
var len = (v) => {
  if (v === undefined || v === null) {
    return 0;
  } else if (Array.isArray(v)) {
    return v.length;
  } else if (typeof v === "string") {
    return v.length;
  } else if (v instanceof Map || v instanceof Set) {
    return v.size;
  } else if (Object.getPrototypeOf(v) === Object.prototype) {
    return Object.keys(v).length;
  }
  return 1;
};
var parser = new DOMParser;
var _templateRegistries = new WeakMap;
var _templateKey = (value) => {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  const key = normalized.startsWith("#") ? normalized.slice(1) : normalized;
  return key.length ? key : null;
};
var _registerTemplateKey = (registry, key, template, scope) => {
  if (!key) {
    return;
  }
  const existing = registry.get(key);
  if (existing && existing !== template) {
    logSelectUI("warn", "ui", "duplicate template key, keeping first registration", { key, scope, existing, ignored: template });
    return;
  }
  registry.set(key, template);
};
var _registerTemplateNode = (template, registry, scope) => {
  if (!template || template.nodeName !== "TEMPLATE") {
    return;
  }
  _registerTemplateKey(registry, template.id, template, scope);
  _registerTemplateKey(registry, template.getAttribute("name"), template, scope);
  if (!template.content?.querySelectorAll) {
    return;
  }
  for (const nested of template.content.querySelectorAll("template")) {
    _registerTemplateNode(nested, registry, scope);
  }
};
var _templateRegistryFor = (scope = document) => {
  let registry = _templateRegistries.get(scope);
  if (registry) {
    return registry;
  }
  registry = new Map;
  _templateRegistries.set(scope, registry);
  const isTemplate = scope?.nodeName === "TEMPLATE";
  if (isTemplate) {
    _registerTemplateNode(scope, registry, scope);
  } else if (scope?.querySelectorAll) {
    for (const template of scope.querySelectorAll("template")) {
      _registerTemplateNode(template, registry, scope);
    }
  }
  return registry;
};
var _registerTemplatesInNodes = (nodes, registry, scope) => {
  for (let i = 0;i < nodes.length; i++) {
    const node = nodes[i];
    if (node?.nodeName === "TEMPLATE") {
      _registerTemplateNode(node, registry, scope);
    }
    if (node?.querySelectorAll) {
      for (const template of node.querySelectorAll("template")) {
        _registerTemplateNode(template, registry, scope);
      }
    }
  }
};
var _createComponent = (tmpl) => {
  const component = (...args) => tmpl.apply(...args);
  Object.assign(component, {
    isTemplate: true,
    template: tmpl,
    new: (...args) => tmpl.new(...args),
    init: (...args) => {
      tmpl.init(...args);
      return component;
    },
    map: (...args) => {
      return tmpl.map(...args);
    },
    apply: (...args) => {
      return tmpl.apply(...args);
    },
    does: (...args) => {
      tmpl.does(...args);
      return component;
    },
    on: (...args) => {
      tmpl.sub(...args);
      return component;
    },
    sub: (...args) => {
      tmpl.sub(...args);
      return component;
    }
  });
  return component;
};
var logSelectUI = (level, scope, message, details = {}) => {
  console[level](`[select.ui] ${scope}: ${message}, details`, details);
};
var WHEN_MODE_TRUTHY = 1;
var WHEN_MODE_FALSY = 2;
var WHEN_MODE_DEFINED = 3;
var WHEN_MODE_UNDEFINED = 4;
var _parseWhenShorthand = (expr) => {
  const source = typeof expr === "string" ? expr.trim() : "";
  let i = 0;
  let negate = false;
  let queryDefined = false;
  if (source[i] === "!") {
    negate = true;
    i++;
  }
  if (source[i] === "?") {
    queryDefined = true;
    i++;
  }
  const key = source.slice(i).trim();
  if (key && !/^[A-Za-z0-9_$-]+$/.test(key)) {
    return null;
  }
  if (!key && source.length > 0 && i === 0) {
    return null;
  }
  const mode = queryDefined ? negate ? WHEN_MODE_UNDEFINED : WHEN_MODE_DEFINED : negate ? WHEN_MODE_FALSY : WHEN_MODE_TRUTHY;
  return { key: key || undefined, mode };
};
var _evaluateWhen = (mode, value) => {
  switch (mode) {
    case WHEN_MODE_TRUTHY:
      return !!value;
    case WHEN_MODE_FALSY:
      return !value;
    case WHEN_MODE_DEFINED:
      return value !== undefined;
    case WHEN_MODE_UNDEFINED:
      return value === undefined;
    default:
      return false;
  }
};
var _resolveWhenValue = (self, data, key) => {
  const behavior = self?.template?.behavior;
  const b = behavior?.[key];
  if (b) {
    return b(self, data, null);
  }
  if (data && key in data) {
    return expand(data[key]);
  }
  return;
};
var _createWhenPredicate = (mode, key) => (self, data) => _evaluateWhen(mode, _resolveWhenValue(self, data, key));
var SLOT_DEFAULT_KEY = "_";
var _isPrunableWhitespaceText = (node) => node && node.nodeType === Node.TEXT_NODE && !/\S/.test(node.data) && /[\n\r\t]/.test(node.data);
var _pruneTemplateWhitespace = (node) => {
  if (!node?.childNodes || node.childNodes.length === 0) {
    return;
  }
  for (let i = node.childNodes.length - 1;i >= 0; i--) {
    const child = node.childNodes[i];
    if (_isPrunableWhitespaceText(child)) {
      node.removeChild(child);
    } else {
      _pruneTemplateWhitespace(child);
    }
  }
};
var type = Object.assign((value) => value === undefined || value === null ? type.Null : Array.isArray(value) ? type.List : Object.getPrototypeOf(value) === Object.prototype ? type.Dict : typeof value === "number" ? type.Number : typeof value === "string" ? type.String : typeof value === "boolean" ? type.Boolean : type.Object, {
  Null: 1,
  Number: 2,
  Boolean: 3,
  String: 4,
  Object: 5,
  List: 10,
  Dict: 11
});
var remap = (value, f) => {
  if (value === null || value === undefined || typeof value === "number" || typeof value === "string") {
    return value;
  } else if (Array.isArray(value)) {
    const n = value.length;
    const res = new Array(n);
    for (let i = 0;i < n; i++) {
      res[i] = f(value[i], i);
    }
    return res;
  } else if (value instanceof Map) {
    const res = new Map;
    for (const [k, v] of value.entries()) {
      res.set(k, f(v, k));
    }
    return res;
  } else if (value instanceof Set) {
    const res = new Set;
    for (const v of value) {
      res.add(f(v, undefined));
    }
    return res;
  } else {
    const res = {};
    for (const k in value) {
      res[k] = f(value[k], k);
    }
    return res;
  }
};
var isPlainObject = (v) => v !== null && v !== undefined && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype;
var eq = (a, b) => {
  if (a === b) {
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    return shallowEq(a, b);
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0;i < a.length; i++) {
      if (a[i] !== b[i]) {
        return false;
      }
    }
    return true;
  }
  return false;
};
var shallowEq = (a, b) => {
  if (a === b) {
    return true;
  }
  if (a === null || a === undefined || b === null || b === undefined || typeof a !== "object" || typeof b !== "object" || Array.isArray(a) || Array.isArray(b)) {
    return false;
  }
  let count = 0;
  for (const k in a) {
    if (!Object.hasOwn(a, k)) {
      continue;
    }
    count++;
    if (!Object.hasOwn(b, k) || a[k] !== b[k]) {
      return false;
    }
  }
  let countB = 0;
  for (const k in b) {
    if (Object.hasOwn(b, k)) {
      countB++;
    }
  }
  return count === countB;
};
var asText = (value) => {
  value = expand(value);
  return value === null || value === undefined ? "" : typeof value === "number" ? `${value}` : typeof value === "string" ? value : JSON.stringify(value);
};
var isInputNode = (node) => {
  switch (node.nodeName) {
    case "INPUT":
    case "TEXTAREA":
    case "SELECT":
      return true;
    default:
      return false;
  }
};
var setNodeText = (node, text) => {
  switch (node.nodeType) {
    case Node.TEXT_NODE:
      if (node.data !== text) {
        node.data = text;
      }
      break;
    case Node.ELEMENT_NODE:
      if (isInputNode(node)) {
        if (node.value !== text) {
          node.value = text;
        }
      } else {
        if (node.textContent !== text) {
          node.textContent = text;
        }
      }
      break;
  }
  return node;
};
var _createTrackingProxy = (data) => {
  const accessed = new Set;
  return [
    new Proxy(data, {
      get(target, property) {
        accessed.add(property);
        return target[property];
      }
    }),
    accessed
  ];
};

class UIEvent {
  constructor(name, data, origin) {
    this.name = name;
    this.data = data;
    this.origin = origin;
    this.current = undefined;
  }
  stopPropagation() {
    return null;
  }
}

class AppliedUITemplate {
  constructor(template, data) {
    this.template = template;
    this.data = data;
  }
}

class UITemplateSlot {
  static Path(node, parent, path) {
    const res = [];
    while (node !== parent) {
      res.splice(0, 0, Array.prototype.indexOf.call(node.parentNode.childNodes, node));
      node = node.parentNode;
    }
    return path ? path.concat(res) : res;
  }
  static Find(name, nodes, processor = undefined) {
    const res = {};
    let count = 0;
    const selector = `[${name}]`;
    const add = (node, parent, i) => {
      const k = node.getAttribute(name);
      node.removeAttribute(name);
      let v = new UITemplateSlot(node, parent, UITemplateSlot.Path(node, parent, [i]));
      v = processor ? processor(v, k) : v;
      if (res[k] === undefined) {
        res[k] = [v];
      } else {
        res[k].push(v);
      }
      count++;
      return res;
    };
    for (let i = 0;i < nodes.length; i++) {
      const parent = nodes[i];
      if (parent.matches?.(selector)) {
        add(parent, parent, i);
      }
      if (parent.querySelectorAll) {
        for (const node of parent.querySelectorAll(`[${name}]`)) {
          add(node, parent, i);
        }
      }
    }
    return count ? res : null;
  }
  static FindWhen(nodes) {
    const res = {};
    let count = 0;
    const selector = `[when]`;
    const add = (node, parent, i) => {
      const expr = node.getAttribute("when") || "";
      const parsed = _parseWhenShorthand(expr);
      const slot = new UITemplateSlot(node, parent, UITemplateSlot.Path(node, parent, [i]));
      if (parsed) {
        let whenKey = parsed.key;
        if (!whenKey) {
          const outKey = node.getAttribute("out")?.trim();
          if (!outKey) {
            logSelectUI("error", "UITemplate", "unable to infer [when] key from [out]", {
              expression: expr,
              node,
              supported: [
                'when out="slot"',
                'when="?" out="slot"',
                'when="!" out="slot"',
                'when="!?" out="slot"'
              ]
            });
            return;
          }
          whenKey = outKey;
        }
        node.removeAttribute("when");
        slot.predicate = _createWhenPredicate(parsed.mode, whenKey);
        slot.predicatePlaceholder = document.createComment(expr || "when");
        const groupKey = `${parsed.mode}:${whenKey}`;
        if (res[groupKey] === undefined) {
          res[groupKey] = [slot];
        } else {
          res[groupKey].push(slot);
        }
        count++;
        return;
      }
      node.removeAttribute("when");
      slot.predicate = new Function(`return ((self,data,event)=>(${expr}))`)();
      slot.predicatePlaceholder = document.createComment(expr);
      if (res[expr] === undefined) {
        res[expr] = [slot];
      } else {
        res[expr].push(slot);
      }
      count++;
    };
    for (let i = 0;i < nodes.length; i++) {
      const parent = nodes[i];
      if (parent.matches?.(selector)) {
        add(parent, parent, i);
      }
      if (parent.querySelectorAll) {
        for (const node of parent.querySelectorAll(selector)) {
          add(node, parent, i);
        }
      }
    }
    return count ? res : null;
  }
  constructor(node, parent, path) {
    this.node = node;
    this.parent = parent;
    this.path = path;
    this.rootIndex = path[0];
    this.tailPath = path.length > 1 ? path.slice(1) : null;
    this.predicate = undefined;
    this.predicatePlaceholder = undefined;
  }
  _resolve(nodes) {
    let node = nodes[this.rootIndex];
    if (this.tailPath) {
      for (let i = 0;i < this.tailPath.length; i++) {
        node = node ? node.childNodes[this.tailPath[i]] : node;
      }
    }
    return node;
  }
  apply(nodes, parent, raw = false) {
    const node = this._resolve(nodes);
    return node ? raw ? node : new UISlot(node, this, parent) : null;
  }
  static FindAttr(prefix, nodes) {
    const res = {};
    let count = 0;
    for (let i = 0;i < nodes.length; i++) {
      const parent = nodes[i];
      const processNode = (node) => {
        if (!node.attributes)
          return;
        const toRemove = [];
        for (const attr of node.attributes) {
          if (attr.name.startsWith(prefix)) {
            const attrName = attr.name.slice(prefix.length);
            const slotName = attr.value || attrName;
            const originalValue = node.getAttribute(attrName);
            toRemove.push(attr.name);
            const slot = new UIAttributeTemplateSlot(node, parent, UITemplateSlot.Path(node, parent, [i]), attrName, slotName, originalValue);
            if (!res[slotName])
              res[slotName] = [];
            res[slotName].push(slot);
            count++;
          }
        }
        for (const name of toRemove)
          node.removeAttribute(name);
      };
      processNode(parent);
      if (parent.querySelectorAll) {
        for (const node of parent.querySelectorAll("*"))
          processNode(node);
      }
    }
    return count ? res : null;
  }
  static FindEvent(prefix, nodes) {
    const res = {};
    let count = 0;
    for (let i = 0;i < nodes.length; i++) {
      const parent = nodes[i];
      const processNode = (node) => {
        if (!node.attributes)
          return;
        const toRemove = [];
        for (const attr of node.attributes) {
          if (attr.name.startsWith(prefix)) {
            const eventType = attr.name.slice(prefix.length);
            const handlerName = attr.value || eventType;
            toRemove.push(attr.name);
            const slot = new UIEventTemplateSlot(node, parent, UITemplateSlot.Path(node, parent, [i]), eventType, handlerName);
            if (!res[handlerName])
              res[handlerName] = [];
            res[handlerName].push(slot);
            count++;
          }
        }
        for (const name of toRemove)
          node.removeAttribute(name);
      };
      processNode(parent);
      if (parent.querySelectorAll) {
        for (const node of parent.querySelectorAll("*"))
          processNode(node);
      }
    }
    return count ? res : null;
  }
}

class UIAttributeTemplateSlot {
  constructor(node, parent, path, attrName, slotName, originalValue) {
    this.node = node;
    this.parent = parent;
    this.path = path;
    this.rootIndex = path[0];
    this.tailPath = path.length > 1 ? path.slice(1) : null;
    this.attrName = attrName;
    this.slotName = slotName;
    this.originalValue = originalValue;
  }
  _resolve(nodes) {
    let node = nodes[this.rootIndex];
    if (this.tailPath) {
      for (let i = 0;i < this.tailPath.length; i++) {
        node = node ? node.childNodes[this.tailPath[i]] : node;
      }
    }
    return node;
  }
  apply(nodes, parent) {
    const node = this._resolve(nodes);
    return node ? new UIAttributeSlot(node, this, parent) : null;
  }
}

class UIAttributeSlot {
  constructor(node, template, parent) {
    this.node = node;
    this.template = template;
    this.parent = parent;
    this.attrName = template.attrName;
    this.originalClasses = template.attrName === "class" ? new Set((template.originalValue || "").split(/\s+/).filter(Boolean)) : null;
    this.originalStyle = template.attrName === "style" ? template.originalValue || "" : null;
    this.appliedClasses = new Set;
    this.appliedStyles = new Map;
  }
  render(value) {
    if (this.attrName === "class") {
      this._renderClass(value);
    } else if (this.attrName === "style") {
      this._renderStyle(value);
    } else {
      this._renderAttr(value);
    }
  }
  _renderClass(...values) {
    for (const cls of this.appliedClasses) {
      if (!this.originalClasses.has(cls)) {
        this.node.classList.remove(cls);
      }
    }
    this.appliedClasses.clear();
    const classes = [];
    const flatten = (value) => {
      if (value == null)
        return;
      if (typeof value === "boolean")
        return;
      if (typeof value === "string") {
        const parts = value.trim().split(/\s+/);
        for (const part of parts) {
          if (part)
            classes.push(part);
        }
        return;
      }
      if (Array.isArray(value)) {
        for (const item of value) {
          flatten(item);
        }
        return;
      }
      if (typeof value === "object") {
        for (const [cls, enabled] of Object.entries(value)) {
          if (enabled && cls && typeof cls === "string") {
            const trimmed = cls.trim();
            if (trimmed)
              classes.push(trimmed);
          }
        }
      }
    };
    for (const value of values) {
      flatten(value);
    }
    for (const cls of classes) {
      this.node.classList.add(cls);
      this.appliedClasses.add(cls);
    }
  }
  _renderStyle(value) {
    for (const prop of this.appliedStyles.keys()) {
      this.node.style.removeProperty(prop);
    }
    this.appliedStyles.clear();
    if (this.originalStyle) {
      const tempDiv = document.createElement("div");
      tempDiv.style.cssText = this.originalStyle;
      for (const prop of tempDiv.style) {
        if (!this.node.style.getPropertyValue(prop)) {
          this.node.style.setProperty(prop, tempDiv.style.getPropertyValue(prop));
        }
      }
    }
    if (value == null)
      return;
    if (typeof value === "object") {
      for (const [prop, val] of Object.entries(value)) {
        if (val != null) {
          const kebabProp = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
          this.node.style.setProperty(kebabProp, val);
          this.appliedStyles.set(kebabProp, val);
        }
      }
    } else {
      const tempDiv = document.createElement("div");
      tempDiv.style.cssText = value;
      for (const prop of tempDiv.style) {
        const val = tempDiv.style.getPropertyValue(prop);
        this.node.style.setProperty(prop, val);
        this.appliedStyles.set(prop, val);
      }
    }
  }
  _renderAttr(value) {
    if (value == null || value === false) {
      this.node.removeAttribute(this.attrName);
    } else if (value === true) {
      this.node.setAttribute(this.attrName, "");
    } else {
      this.node.setAttribute(this.attrName, String(value));
    }
  }
}

class UIEventTemplateSlot {
  constructor(node, parent, path, eventType, handlerName) {
    this.node = node;
    this.parent = parent;
    this.path = path;
    this.rootIndex = path[0];
    this.tailPath = path.length > 1 ? path.slice(1) : null;
    this.eventType = eventType;
    this.handlerName = handlerName;
  }
  _resolve(nodes) {
    let node = nodes[this.rootIndex];
    if (this.tailPath) {
      for (let i = 0;i < this.tailPath.length; i++) {
        node = node ? node.childNodes[this.tailPath[i]] : node;
      }
    }
    return node;
  }
  apply(nodes, parent) {
    const node = this._resolve(nodes);
    return node ? new UIEventSlot(node, this, parent) : null;
  }
}

class UIEventSlot {
  constructor(node, template, parent) {
    this.node = node;
    this.template = template;
    this.parent = parent;
    this.eventType = template.eventType;
    this.handlerName = template.handlerName;
  }
}

class UITemplate {
  constructor(nodes) {
    this.nodes = nodes;
    this.on = UITemplateSlot.FindEvent("on:", nodes);
    this.in = UITemplateSlot.Find("in", nodes);
    this.when = UITemplateSlot.FindWhen(nodes);
    this.out = UITemplateSlot.Find("out", nodes);
    this.inout = UITemplateSlot.Find("inout", nodes);
    this.hasBindings = !!(this.on || this.in || this.inout);
    this.ref = UITemplateSlot.Find("ref", nodes);
    this.outAttr = UITemplateSlot.FindAttr("out:", nodes);
    this.slots = this._findSlots(nodes);
    this.initializer = undefined;
    this.behavior = undefined;
    this.subs = undefined;
  }
  _findSlots(nodes) {
    const slots = [];
    for (let i = 0;i < nodes.length; i++) {
      const root = nodes[i];
      const candidates = [];
      if (root.nodeName === "SLOT") {
        candidates.push(root);
      }
      if (root.querySelectorAll) {
        for (const n of root.querySelectorAll("slot")) {
          candidates.push(n);
        }
      }
      for (const slotNode of candidates) {
        const name = slotNode.getAttribute("name") || "default";
        const fallback = slotNode.childNodes ? [...slotNode.childNodes] : [];
        const placeholder = document.createComment(`slot:${name}`);
        if (slotNode === root) {
          nodes[i] = placeholder;
          slots.push({ name, fallback, rootIndex: i, tailPath: null });
        } else {
          slotNode.parentNode.replaceChild(placeholder, slotNode);
          const path = UITemplateSlot.Path(placeholder, root, [i]);
          slots.push({
            name,
            fallback,
            rootIndex: path[0],
            tailPath: path.length > 1 ? path.slice(1) : null
          });
        }
      }
    }
    return slots.length ? slots : null;
  }
  new(parent) {
    return new UIInstance(this, parent);
  }
  apply(data) {
    return new AppliedUITemplate(this, data);
  }
  map(data) {
    return remap(data, (v) => new AppliedUITemplate(this, v));
  }
  init(init) {
    this.initializer = init;
    return this;
  }
  does(behavior) {
    this.behavior = Object.assign(this.behavior ?? {}, behavior);
    return this;
  }
  sub(event, handler = undefined) {
    if (typeof event === "string") {
      if (!handler) {
        return this;
      }
      if (this.subs === undefined) {
        this.subs = new Map;
      }
      if (this.subs.has(event)) {
        this.subs.get(event).push(handler);
      } else {
        this.subs.set(event, [handler]);
      }
    } else {
      for (const k in event) {
        this.sub(k, event[k]);
      }
    }
    return this;
  }
}

class UISlot {
  constructor(node, template, parent) {
    this.parent = parent;
    this.node = node;
    this.isInput = isInputNode(node);
    this.mapping = new Map;
    this.placeholder = node.childNodes && node.childNodes.length > 0 ? [...node.childNodes] : null;
    this._extractedSlots = undefined;
    this._hasNamedSlotContent = undefined;
    this.predicatePlaceholder = template.predicate && template.predicatePlaceholder ? template.predicatePlaceholder.cloneNode(true) : null;
    this.template = template;
  }
  _mountInstance(instance, nextNode) {
    const fragment = document.createDocumentFragment();
    for (let i = 0;i < instance.nodes.length; i++) {
      fragment.appendChild(instance.nodes[i]);
    }
    if (nextNode && nextNode.parentNode === this.node) {
      this.node.insertBefore(fragment, nextNode);
    } else {
      this.node.appendChild(fragment);
    }
  }
  _extractSlots() {
    if (this._extractedSlots !== undefined) {
      return this._extractedSlots;
    }
    if (!this.placeholder) {
      this._extractedSlots = null;
      return null;
    }
    const slots = {};
    let hasSlots = false;
    const scan = (node) => {
      if (node.nodeType === Node.ELEMENT_NODE && node.hasAttribute("slot")) {
        const name = node.getAttribute("slot");
        const clone = node.cloneNode(true);
        clone.removeAttribute("slot");
        slots[name] = clone;
        hasSlots = true;
      }
      if (node.querySelectorAll) {
        for (const child of node.querySelectorAll("[slot]")) {
          scan(child);
        }
      }
    };
    for (const node of this.placeholder) {
      scan(node);
    }
    this._extractedSlots = hasSlots ? slots : null;
    return this._extractedSlots;
  }
  _mergeSlots(item) {
    const providedSlots = item.data?.slots;
    if (!providedSlots && !this._hasSlotContent()) {
      return item.data;
    }
    const extracted = this._extractSlots();
    if (providedSlots && extracted) {
      return { ...item.data, slots: { ...extracted, ...providedSlots } };
    } else if (providedSlots) {
      return item.data;
    } else if (!extracted) {
      return item.data;
    }
    return { ...item.data, slots: extracted };
  }
  _hasSlotContent() {
    if (this._hasNamedSlotContent !== undefined) {
      return this._hasNamedSlotContent;
    }
    if (!this.placeholder || this.placeholder.length === 0) {
      this._hasNamedSlotContent = false;
      return false;
    }
    for (let i = 0;i < this.placeholder.length; i++) {
      const node = this.placeholder[i];
      if (node.nodeType !== Node.ELEMENT_NODE) {
        continue;
      }
      if (node.hasAttribute("slot") || node.querySelector("[slot]")) {
        this._hasNamedSlotContent = true;
        return true;
      }
    }
    this._hasNamedSlotContent = false;
    return false;
  }
  _removeMappedValue(v) {
    if (v instanceof UIInstance) {
      v.unmount();
    } else if (v !== this.node) {
      v.parentNode?.removeChild(v);
    }
  }
  _clearMapped() {
    for (const v of this.mapping.values()) {
      this._removeMappedValue(v);
    }
    this.mapping.clear();
    this._listLength = 0;
  }
  _renderMapped(k, item, previous) {
    const existing = this.mapping.get(k);
    if (existing === undefined) {
      let r;
      if (item instanceof AppliedUITemplate) {
        const data = this._mergeSlots(item);
        r = item.template.new(this.parent);
        r.set(data, k).mount(this.node, previous);
        previous = r.nodes[r.nodes.length - 1];
      } else if (this.isInput) {
        setNodeText(this.node, asText(item));
        r = this.node;
      } else if (item instanceof Node) {
        this.node.appendChild(item);
        r = item;
      } else {
        r = document.createTextNode(asText(item));
        this.node.appendChild(r);
        previous = r;
      }
      this.mapping.set(k, r);
    } else {
      const r = existing;
      if (r instanceof UIInstance) {
        if (item instanceof AppliedUITemplate) {
          if (item.template === r.template) {
            r.update(item.data);
          } else {
            const data = this._mergeSlots(item);
            const lastNode = r.nodes[r.nodes.length - 1];
            const nextNode = lastNode ? lastNode.nextSibling : null;
            r.unmount();
            const newInstance = item.template.new(this.parent);
            newInstance.set(data, k);
            this._mountInstance(newInstance, nextNode);
            this.mapping.set(k, newInstance);
          }
        } else {
          r.update(item);
        }
      } else if (this.isInput) {
        setNodeText(this.node, asText(item));
      } else if (r?.nodeType === Node.ELEMENT_NODE) {
        if (item instanceof AppliedUITemplate) {
          const data = this._mergeSlots(item);
          const nextNode = r.nextSibling;
          r.parentNode.removeChild(r);
          const newInstance = item.template.new(this.parent);
          newInstance.set(data, k);
          this._mountInstance(newInstance, nextNode);
          this.mapping.set(k, newInstance);
        } else if (item instanceof Node) {
          r.parentNode.replaceChild(item, r);
          this.mapping.set(k, item);
        } else {
          const t = document.createTextNode(asText(item));
          r.parentNode.replaceChild(t, r);
          this.mapping.set(k, t);
        }
      } else {
        if (item instanceof AppliedUITemplate) {
          const data = this._mergeSlots(item);
          const nextNode = r.nextSibling;
          r.parentNode.removeChild(r);
          const newInstance = item.template.new(this.parent);
          newInstance.set(data, k);
          this._mountInstance(newInstance, nextNode);
          this.mapping.set(k, newInstance);
        } else if (item instanceof Node) {
          r.parentNode.replaceChild(item, r);
          this.mapping.set(k, item);
        } else {
          setNodeText(r, asText(item));
        }
      }
    }
    return previous;
  }
  render(data) {
    const isList = Array.isArray(data);
    const isDict = !isList && data !== null && data !== undefined && Object.getPrototypeOf(data) === Object.prototype;
    let isEmpty = data === null || data === undefined || data === "";
    if (isList) {
      isEmpty = data.length === 0;
    } else if (isDict) {
      isEmpty = true;
      for (const k in data) {
        if (Object.hasOwn(data, k)) {
          isEmpty = false;
          break;
        }
      }
    }
    if (isEmpty) {
      if (this.placeholder && !this.placeholder[0]?.parentNode) {
        let previous2 = this.node.childNodes[0];
        for (const node of this.placeholder) {
          if (!previous2?.nextSibling) {
            this.node.appendChild(node);
          } else {
            this.node.insertBefore(node, previous2.nextSibling);
          }
          previous2 = node;
        }
      }
    } else if (this.placeholder?.[0]?.parentNode) {
      for (const n of this.placeholder) {
        n.parentNode?.removeChild(n);
      }
    }
    const kind = isList ? 1 : isDict ? 2 : 0;
    if (this._kind !== undefined && this._kind !== kind) {
      this._clearMapped();
    }
    this._kind = kind;
    let previous = null;
    if (isList) {
      for (let i = 0;i < data.length; i++) {
        previous = this._renderMapped(i, data[i], previous);
      }
      const previousLength = this._listLength || 0;
      for (let i = data.length;i < previousLength; i++) {
        const v = this.mapping.get(i);
        if (v !== undefined) {
          this._removeMappedValue(v);
          this.mapping.delete(i);
        }
      }
      this._listLength = data.length;
    } else if (isDict) {
      for (const k in data) {
        previous = this._renderMapped(k, data[k], previous);
      }
      for (const [k, v] of this.mapping.entries()) {
        if (data[k] === undefined) {
          this._removeMappedValue(v);
          this.mapping.delete(k);
        }
      }
      this._listLength = 0;
    } else {
      previous = this._renderMapped(SLOT_DEFAULT_KEY, data, previous);
      for (const [k, v] of this.mapping.entries()) {
        if (k !== SLOT_DEFAULT_KEY) {
          this._removeMappedValue(v);
          this.mapping.delete(k);
        }
      }
      this._listLength = 0;
    }
  }
  show() {
    if (this.predicatePlaceholder?.parentNode) {
      this.predicatePlaceholder.parentNode.replaceChild(this.node, this.predicatePlaceholder);
    }
    return this;
  }
  hide() {
    if (this.predicatePlaceholder && this.node.parentNode) {
      this.node.parentNode.replaceChild(this.predicatePlaceholder, this.node);
    }
    return this;
  }
}

class UIContentSlot {
  constructor(placeholder, fallback, parent, name) {
    this.placeholder = placeholder;
    this.fallback = fallback ? fallback.map((n) => n.cloneNode(true)) : [];
    this.parent = parent;
    this.name = name;
    this.content = null;
    this.fallbackActive = false;
    this._lastWasFallback = false;
    this._lastContent = undefined;
    this._lastContentType = 0;
  }
  mount(content) {
    if (content === undefined || content === null) {
      if (this.fallback.length) {
        if (!this._lastWasFallback) {
          this._clear();
          this._mountFallback();
        }
        this._lastWasFallback = true;
        this._lastContent = undefined;
        this._lastContentType = 0;
        return;
      }
      if (this._lastWasFallback || this.content) {
        this._clear();
      }
      this._lastWasFallback = false;
      this._lastContent = undefined;
      this._lastContentType = 0;
      return;
    }
    const contentType = content instanceof AppliedUITemplate ? 1 : content instanceof Node ? 2 : 3;
    if (contentType === 1) {
      if (this.content instanceof UIInstance && this.content.template === content.template && shallowEq(this._lastContent, content.data)) {
        this._lastWasFallback = false;
        this._lastContent = content.data;
        this._lastContentType = contentType;
        return;
      }
    } else if (contentType === 2) {
      if (this.content === content && !this._lastWasFallback) {
        return;
      }
    } else if (this._lastContentType === 3 && this._lastContent === content && !this._lastWasFallback) {
      return;
    }
    this._clear();
    this._mountContent(content);
    this._lastWasFallback = false;
    this._lastContent = contentType === 1 ? content.data : content;
    this._lastContentType = contentType;
  }
  _mountContent(content) {
    const parent = this.placeholder.parentNode;
    if (!parent)
      return;
    const ref = this.placeholder.nextSibling;
    if (content instanceof AppliedUITemplate) {
      const instance = content.template.new(this.parent);
      instance.set(content.data);
      for (const n of instance.nodes) {
        parent.insertBefore(n, ref);
      }
      this.content = instance;
    } else if (content instanceof Node) {
      parent.insertBefore(content, ref);
      this.content = content;
    } else {
      const text = document.createTextNode(asText(content));
      parent.insertBefore(text, ref);
      this.content = text;
    }
  }
  _mountFallback() {
    const parent = this.placeholder.parentNode;
    if (!parent)
      return;
    const ref = this.placeholder.nextSibling;
    for (const n of this.fallback) {
      parent.insertBefore(n, ref);
    }
    this.fallbackActive = true;
  }
  _clear() {
    if (this.content instanceof UIInstance) {
      this.content.unmount();
    } else if (this.content?.parentNode) {
      this.content.parentNode.removeChild(this.content);
    }
    this.content = null;
    if (this.fallbackActive) {
      for (const n of this.fallback) {
        n.parentNode?.removeChild(n);
      }
      this.fallbackActive = false;
    }
    this._lastWasFallback = false;
    this._lastContent = undefined;
    this._lastContentType = 0;
  }
}

class UIInstance {
  static _compileSlotApplier(slots, rawSingle = false) {
    if (!slots) {
      return null;
    }
    const keys = [];
    const groups = [];
    for (const key in slots) {
      keys.push(key);
      groups.push(slots[key]);
    }
    if (keys.length === 0) {
      return null;
    }
    return (nodes, parent) => {
      const res = {};
      for (let i = 0;i < keys.length; i++) {
        const source = groups[i];
        const mapped = new Array(source.length);
        for (let j = 0;j < source.length; j++) {
          mapped[j] = source[j].apply(nodes, parent, rawSingle);
        }
        res[keys[i]] = rawSingle && mapped.length === 1 ? mapped[0] : mapped;
      }
      return res;
    };
  }
  static _ensureCompiled(template) {
    if (template._compiledSlotAppliers) {
      return template._compiledSlotAppliers;
    }
    template._compiledSlotAppliers = {
      in: UIInstance._compileSlotApplier(template.in),
      out: UIInstance._compileSlotApplier(template.out),
      inout: UIInstance._compileSlotApplier(template.inout),
      ref: UIInstance._compileSlotApplier(template.ref, true),
      on: UIInstance._compileSlotApplier(template.on),
      when: UIInstance._compileSlotApplier(template.when),
      outAttr: UIInstance._compileSlotApplier(template.outAttr)
    };
    return template._compiledSlotAppliers;
  }
  constructor(template, parent) {
    this.template = template;
    const compiled = UIInstance._ensureCompiled(template);
    this.nodes = new Array(template.nodes.length);
    for (let i = 0;i < template.nodes.length; i++) {
      this.nodes[i] = template.nodes[i].cloneNode(true);
    }
    this.in = compiled.in ? compiled.in(this.nodes, this) : null;
    this.out = compiled.out ? compiled.out(this.nodes, this) : null;
    this.inout = compiled.inout ? compiled.inout(this.nodes, this) : null;
    this.ref = compiled.ref ? compiled.ref(this.nodes, this) : null;
    this.on = compiled.on ? compiled.on(this.nodes, this) : null;
    this.when = compiled.when ? compiled.when(this.nodes, this) : null;
    this.outAttr = compiled.outAttr ? compiled.outAttr(this.nodes, this) : null;
    this.slots = null;
    if (template.slots) {
      this.slots = [];
      for (const slotDef of template.slots) {
        let node = this.nodes[slotDef.rootIndex];
        const tailPath = slotDef.tailPath;
        if (tailPath) {
          for (let i = 0;i < tailPath.length; i++) {
            node = node ? node.childNodes[tailPath[i]] : node;
          }
        }
        if (node) {
          this.slots.push(new UIContentSlot(node, slotDef.fallback, this, slotDef.name));
        }
      }
      if (this.slots.length === 0) {
        this.slots = null;
      }
    }
    this.parent = parent;
    this.children = undefined;
    if (parent) {
      if (!parent.children) {
        parent.children = new Set;
      }
      parent.children.add(this);
    }
    if (template.hasBindings) {
      this.bind();
    }
    this._renderer = undefined;
    this._reactiveDataSubs = undefined;
    this._domListeners = undefined;
    if (template.initializer) {
      const state = template.initializer();
      if (state) {
        this.initial = state;
      }
      this.set(state);
    }
  }
  _getRenderer() {
    if (!this._renderer) {
      this._renderer = () => this.render();
    }
    return this._renderer;
  }
  _collectReactiveDataRefs(data) {
    const refs = new Set;
    if (data && typeof data === "object") {
      for (const k in data) {
        const v = data[k];
        if (v?.isReactive) {
          refs.add(v);
        }
      }
    }
    return refs;
  }
  _syncReactiveDataSubs(data) {
    const refs = this._collectReactiveDataRefs(data);
    if (this._reactiveDataSubs === undefined) {
      this._reactiveDataSubs = new Map;
    }
    const renderer = this._getRenderer();
    for (const cell2 of this._reactiveDataSubs.keys()) {
      if (!refs.has(cell2)) {
        cell2.unsub(renderer);
        this._reactiveDataSubs.delete(cell2);
      }
    }
    for (const cell2 of refs) {
      if (!this._reactiveDataSubs.has(cell2)) {
        cell2.sub(renderer);
        this._reactiveDataSubs.set(cell2, true);
      }
    }
  }
  _clearReactiveDataSubs() {
    if (!this._reactiveDataSubs || !this._renderer) {
      return;
    }
    for (const cell2 of this._reactiveDataSubs.keys()) {
      cell2.unsub(this._renderer);
    }
    this._reactiveDataSubs.clear();
  }
  dispose() {
    if (this._domListeners) {
      for (const listener of this._domListeners) {
        listener.node.removeEventListener(listener.type, listener.handler);
      }
      this._domListeners.length = 0;
      this._domListeners = undefined;
    }
    this._clearReactiveDataSubs();
    if (this._ctxSubs) {
      for (const [cell2, handler] of this._ctxSubs) {
        cell2.unsub(handler);
      }
      this._ctxSubs = undefined;
    }
    if (this.children) {
      for (const child of this.children) {
        child.dispose();
      }
      this.children.clear();
      this.children = undefined;
    }
    this.parent?.children?.delete(this);
  }
  provide(key, value) {
    if (this._context === undefined) {
      this._context = new Map;
    }
    this._context.set(key, value);
    return this;
  }
  inject(key, defaultValue = undefined) {
    let current = this.parent;
    while (current) {
      if (current._context?.has(key)) {
        const value = current._context.get(key);
        if (value?.isReactive) {
          if (this._ctxSubs === undefined) {
            this._ctxSubs = new Map;
          }
          if (!this._ctxSubs.has(value)) {
            const handler = () => this.render();
            value.sub(handler);
            this._ctxSubs.set(value, handler);
          }
        }
        return value;
      }
      current = current.parent;
    }
    return defaultValue;
  }
  bind() {
    if (this._domListeners && this._domListeners.length) {
      return;
    }
    if (!this._domListeners) {
      this._domListeners = [];
    }
    for (const k in this.on) {
      for (const slot of this.on[k]) {
        this._bindEvent(k, slot);
      }
    }
    for (const set of [this.in, this.inout]) {
      for (const k in set) {
        for (const slot of set[k]) {
          this._bindInput(k, slot);
        }
      }
    }
  }
  _bindEvent(name, target, handler = this.template.behavior?.[name]) {
    if (handler) {
      const listener = (event) => {
        const result = handler(this, this.data || {}, event);
        if (result && typeof result === "object" && !Array.isArray(result)) {
          for (const key in result) {
            const cell2 = this.data?.[key];
            if (cell2?.isReactive) {
              cell2.set(result[key]);
            }
          }
        }
      };
      target.node.addEventListener(target.eventType, listener);
      this._domListeners.push({
        node: target.node,
        type: target.eventType,
        handler: listener
      });
    }
  }
  _bindInput(name, target, handler = this.template.behavior?.[name]) {
    let event;
    switch (target.node.nodeName) {
      case "INPUT":
      case "TEXTAREA":
      case "SELECT":
        event = "input";
        break;
      case "FORM":
        event = "submit";
        break;
      default:
        event = "click";
    }
    const listener = (event2) => {
      const data = this.data || {};
      const slotValue = data[name];
      if (handler) {
        const result = handler(this, data, event2);
        if (result && typeof result === "object" && !Array.isArray(result)) {
          for (const key in result) {
            const cell2 = data[key];
            if (cell2?.isReactive) {
              cell2.set(result[key]);
            }
          }
        } else if (result !== undefined && slotValue?.isReactive) {
          slotValue.set(result);
        }
      } else if (slotValue?.isReactive) {
        slotValue.set(event2?.target?.value);
      }
    };
    target.node.addEventListener(event, listener);
    this._domListeners.push({
      node: target.node,
      type: event,
      handler: listener
    });
  }
  set(data, key = this.key) {
    this.key = key;
    this.render(data);
    return this;
  }
  update(data, force = false) {
    if (data === undefined || data === null) {
      if (force || this.data !== data) {
        this.render(data);
      }
      return this;
    }
    if (typeof data !== "object") {
      if (force || !eq(this.data, data)) {
        this.render(data);
      }
      return this;
    }
    let same = !force;
    let changedKeys = null;
    if (!this.data) {
      same = false;
    } else if (same) {
      for (const k in data) {
        const existing = this.data[k];
        const updated = data[k];
        if (!eq(existing, updated)) {
          const renderer = this._getRenderer();
          same = false;
          if (!changedKeys) {
            changedKeys = new Set;
          }
          changedKeys.add(k);
          if (existing?.isReactive) {
            existing.unsub(renderer);
          }
          if (updated?.isReactive) {
            updated.sub(renderer);
          }
        }
      }
    }
    if (!same) {
      const merged = this.data && typeof this.data === "object" ? Object.assign({}, this.data, data) : data;
      this.render(merged, changedKeys);
    }
    return this;
  }
  _depsChanged(deps, changedKeys) {
    for (const key of deps) {
      if (changedKeys.has(key)) {
        return true;
      }
    }
    return false;
  }
  send(event, data) {
    return this.pub(event, data);
  }
  emit(event, data) {
    return this.pub(event, data);
  }
  pub(event, data) {
    const res = new UIEvent(event, data, this);
    this.parent?.onPub(res);
    return res;
  }
  on(event, handler) {
    if (this._runtimeSubs === undefined) {
      this._runtimeSubs = new Map;
    }
    if (this._runtimeSubs.has(event)) {
      this._runtimeSubs.get(event).push(handler);
    } else {
      this._runtimeSubs.set(event, [handler]);
    }
    return this;
  }
  off(event, handler) {
    if (!this._runtimeSubs)
      return this;
    const handlers = this._runtimeSubs.get(event);
    if (handlers) {
      const i = handlers.indexOf(handler);
      if (i >= 0) {
        handlers.splice(i, 1);
      }
      if (handlers.length === 0) {
        this._runtimeSubs.delete(event);
      }
    }
    return this;
  }
  onPub(event) {
    event.current = this;
    let propagate = true;
    if (this._runtimeSubs) {
      const rl = this._runtimeSubs.get(event.name);
      if (rl) {
        for (const h of rl) {
          const c = h(this, this.data, event);
          if (c === false) {
            return event;
          } else if (c === null) {
            propagate = false;
          }
        }
      }
    }
    if (propagate && this.template.subs) {
      const hl = this.template.subs.get(event.name);
      if (hl) {
        for (const h of hl) {
          const c = h(this, this.data, event);
          if (c === false) {
            return event;
          } else if (c === null) {
            propagate = false;
          }
        }
      }
    }
    propagate && this.parent?.onPub(event);
    return event;
  }
  mount(node, previous) {
    if (typeof node === "string") {
      const n = document.querySelector(node);
      if (!n) {
        logSelectUI("error", "UIInstance.mount", "selector did not match, cannot mount component", { selector: node, component: this.template });
        return this;
      } else {
        node = n;
      }
    }
    if (node) {
      if (this.nodes[0].parentNode !== node) {
        if (previous && previous.parentNode === node) {
          for (const n of this.nodes) {
            node.insertBefore(n, previous.nextSibling);
            previous = n;
          }
        } else {
          for (const n of this.nodes) {
            node.appendChild(n);
          }
        }
      } else {
        logSelectUI("warn", "UIInstance.mount", "already mounted", {
          nodes: this.nodes
        });
      }
    } else {
      logSelectUI("warn", "UIInstance.mount", "unable to mount as node is undefined", { node, self: this });
      for (const node2 of this.nodes) {
        node2.parentNode?.removeChild(node2);
      }
    }
    return this;
  }
  unmount() {
    this.dispose();
    for (const node of this.nodes) {
      node.parentNode?.removeChild(node);
    }
    return this;
  }
  render(data = this.data, changedKeys = null) {
    if (!this.template) {
      logSelectUI("error", "UIInstance.render", "called on instance with undefined template", { instance: this });
      return this;
    }
    const isGranular = changedKeys !== null && changedKeys.size > 0;
    if (!(this.template.out || this.template.inout || this.template.in || this.template.outAttr)) {
      const text = asText(data);
      for (const node of this.nodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          setNodeText(node, text);
          break;
        }
      }
    } else {
      const behavior = this.template.behavior;
      const renderSet = (set) => {
        if (!set) {
          return;
        }
        for (const k in set) {
          let v;
          const hasBehavior = behavior?.[k];
          if (isGranular && this._behaviorDeps && this._behaviorValues) {
            const deps = this._behaviorDeps.get(k);
            if (deps && !this._depsChanged(deps, changedKeys)) {
              v = this._behaviorValues.get(k);
              for (const slot of set[k]) {
                slot.render(v);
              }
              continue;
            }
          }
          if (hasBehavior) {
            if (isGranular) {
              const [trackedData, accessed] = _createTrackingProxy(data);
              v = hasBehavior(this, trackedData, null);
              if (!this._behaviorDeps) {
                this._behaviorDeps = new Map;
              }
              this._behaviorDeps.set(k, accessed);
              if (!this._behaviorValues) {
                this._behaviorValues = new Map;
              }
              this._behaviorValues.set(k, v);
            } else {
              v = hasBehavior(this, data, null);
            }
          } else if (data && k in data) {
            v = expand(data[k]);
          } else {
            v = undefined;
          }
          for (const slot of set[k]) {
            slot.render(v);
          }
        }
      };
      renderSet(this.out);
      renderSet(this.inout);
      renderSet(this.in);
      for (const k in this.when) {
        for (const slot of this.when[k]) {
          if (slot.template.predicate(this, data)) {
            slot.show();
          } else {
            slot.hide();
          }
        }
      }
      for (const k in this.outAttr) {
        let v;
        const b = behavior?.[k];
        if (b) {
          for (const slot of this.outAttr[k]) {
            const attrValue = slot.node.getAttribute(slot.attrName);
            v = b(this, data, attrValue, slot.node);
            slot.render(v);
          }
          continue;
        } else if (data && k in data) {
          v = expand(data[k]);
        }
        for (const slot of this.outAttr[k]) {
          slot.render(v);
        }
      }
      if (this.slots?.length) {
        for (const slot of this.slots) {
          const content = data?.slots?.[slot.name];
          slot.mount(content);
        }
      }
    }
    this._syncReactiveDataSubs(data);
    this.data = data;
    return this;
  }
}
var _registry = new Map;
var Dynamic = (type2, props = {}) => {
  const component = typeof type2 === "string" ? _registry.get(type2) : type2;
  return component ? component(props) : null;
};
var lazy = (loader, placeholder = null) => {
  let tmpl = null;
  let loading = false;
  return (data) => {
    if (!tmpl && !loading) {
      loading = true;
      loader().then((m) => {
        tmpl = m.default || m;
      });
    }
    return tmpl ? tmpl(data) : placeholder;
  };
};
var ui = (selection, scope = document) => {
  if (selection === null || selection === undefined) {
    throw new Error(`ui() received ${selection === null ? "null" : "undefined"} as selection. ` + `Expected a CSS selector string, an HTML string starting with "<", ` + `a DOM Node, or an array of DOM Nodes. ` + `Example: ui("#container") or ui("<div>Hello</div>")`);
  }
  if (typeof selection === "string") {
    let nodes = [];
    const templateRegistry = _templateRegistryFor(scope);
    if (/^\s*</.test(selection)) {
      const doc = parser.parseFromString(selection, "text/html");
      _pruneTemplateWhitespace(doc.body);
      nodes = [...doc.body.childNodes];
      _registerTemplatesInNodes(nodes, templateRegistry, scope);
    } else {
      const template = templateRegistry.get(_templateKey(selection));
      if (template) {
        nodes = [...template.content.childNodes];
      } else {
        const parent = scope?.querySelectorAll ? scope : document;
        for (const node of parent.querySelectorAll(selection)) {
          if (node.nodeName === "TEMPLATE") {
            _registerTemplateNode(node, templateRegistry, scope);
            nodes = [...nodes, ...node.content.childNodes];
          } else {
            nodes.push(node);
          }
        }
        _registerTemplatesInNodes(nodes, templateRegistry, scope);
      }
    }
    if (nodes.length === 0) {
      logSelectUI("warn", "ui", "selector did not match any elements", {
        selector: selection,
        scope
      });
    }
    return _createComponent(new UITemplate(nodes));
  }
  if (selection instanceof Node || Array.isArray(selection)) {
    const nodes = selection instanceof Node ? [selection] : selection;
    _registerTemplatesInNodes(nodes, _templateRegistryFor(scope), scope);
    return _createComponent(new UITemplate([...nodes]));
  }
  throw new Error(`ui() received an invalid selection type: ${typeof selection}. ` + `Expected a string (CSS selector or HTML), a DOM Node, or an array of DOM Nodes. ` + `Received: ${selection}`);
};
ui.register = (name, component) => {
  _registry.set(name, component);
  return ui;
};
ui.resolve = (name) => _registry.get(name);
var select_ui_default = ui;
export {
  walk,
  select_ui_default as ui,
  type,
  select_default as select,
  remap,
  query,
  match,
  len,
  lazy,
  filter,
  expand,
  derived,
  deferred,
  select_cells_default as cell,
  assign,
  access,
  UITemplateSlot,
  UITemplate,
  UISlot,
  UIInstance,
  UIEventTemplateSlot,
  UIEventSlot,
  UIEvent,
  UIContentSlot,
  UIAttributeTemplateSlot,
  UIAttributeSlot,
  Selection,
  Selected,
  S,
  Reactive,
  Dynamic,
  Derivation,
  Deferred,
  Cell,
  AppliedUITemplate,
  $
};
