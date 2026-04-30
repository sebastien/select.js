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

// src/js/select.cells.js
var Nothing = Object.freeze(new Object);
var Something = Object.freeze(new Object);
var logSelectCells = (level, scope, message, details = {}) => {
  console[level](`[select.cells] ${scope}: ${message}, details`, details);
};
var isPlainObject = (value) => value !== null && value !== undefined && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
var eq = (a, b) => {
  if (Object.is(a, b)) {
    return true;
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0;i < a.length; i++) {
      if (!eq(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    let n = 0;
    for (const k in a) {
      if (!Object.hasOwn(a, k)) {
        continue;
      }
      n += 1;
      if (!Object.hasOwn(b, k) || !eq(a[k], b[k])) {
        return false;
      }
    }
    for (const k in b) {
      if (Object.hasOwn(b, k)) {
        n -= 1;
      }
    }
    return n === 0;
  }
  return false;
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
var clone = (value, key) => {
  return Array.isArray(value) ? value.slice() : value && Object.getPrototypeOf(value) === Object.prototype ? { ...value } : typeof key === "number" ? [] : {};
};
var reassign = (scope, path, value, merge = undefined, offset = 0) => {
  const n = path.length;
  if (n === 0) {
    return merge ? merge(scope, value) : value;
  }
  const start = offset < 0 ? 0 : offset;
  if (start >= n) {
    return scope;
  }
  const root = clone(scope);
  let currentClone = root;
  let currentOriginal = scope && (Array.isArray(scope) || Object.getPrototypeOf(scope) === Object.prototype) ? scope : undefined;
  for (let i = start;i < n - 1; i++) {
    const key = path[i];
    const originalChild = currentOriginal ? currentOriginal[key] : undefined;
    const childClone = clone(originalChild);
    if (Array.isArray(currentClone) && typeof key === "number") {
      while (currentClone.length <= key) {
        currentClone.push(undefined);
      }
    }
    currentClone[key] = childClone;
    currentClone = childClone;
    currentOriginal = originalChild;
  }
  const leafKey = path[n - 1];
  if (Array.isArray(currentClone) && typeof leafKey === "number") {
    while (currentClone.length <= leafKey) {
      currentClone.push(undefined);
    }
  }
  currentClone[leafKey] = merge ? merge(currentClone[leafKey], value) : value;
  return root;
};
var normpath = (path) => {
  if (path === Nothing) {
    return null;
  } else if (Array.isArray(path)) {
    return path;
  } else if (path !== undefined && path !== null) {
    return [path];
  }
  return null;
};
var parsePrimitive = (value) => {
  if (value === "null")
    return null;
  if (value === "true")
    return true;
  if (value === "false")
    return false;
  const num = Number(value);
  if (!Number.isNaN(num) && value.trim() !== "")
    return num;
  return value;
};
var formatPrimitive = (value) => {
  if (value === null)
    return "null";
  if (value === true)
    return "true";
  if (value === false)
    return "false";
  return `${value}`;
};
var UNSAFE_LOCATION_KEY = /^(?:__proto__|prototype|constructor)$/;
var warnIssue = (warn, scope, message, details = {}) => {
  if (typeof warn === "function") {
    warn(scope, new Error(message), details);
  }
};
var sanitizeLocationText = (value, warn, scope, details = {}) => {
  const text = `${value ?? ""}`;
  let sanitized = "";
  for (let i = 0;i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code >= 0 && code <= 31 || code === 127 || code === 8232 || code === 8233) {
      continue;
    }
    sanitized += text[i];
  }
  if (sanitized !== text) {
    warnIssue(warn, scope, "control characters pruned", {
      value: text,
      sanitized,
      ...details
    });
  }
  return sanitized;
};
var sanitizeLocationKey = (key, warn, scope, details = {}) => {
  const sanitized = sanitizeLocationText(key, warn, scope, details);
  if (!sanitized || UNSAFE_LOCATION_KEY.test(sanitized) || sanitized.endsWith("[]")) {
    warnIssue(warn, scope, "unsafe key pruned", {
      key,
      sanitized,
      ...details
    });
    return;
  }
  return sanitized;
};
var sanitizeLocationItem = (value, warn, scope, details = {}) => {
  if (value === undefined) {
    return;
  }
  if (value === null || value === true || value === false) {
    return value;
  }
  if (typeof value === "string") {
    return sanitizeLocationText(value, warn, scope, details);
  }
  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      return value;
    }
    warnIssue(warn, scope, "non-finite number pruned", { value, ...details });
    return;
  }
  warnIssue(warn, scope, "unsupported location value pruned", {
    type: typeof value,
    value,
    ...details
  });
  return;
};
var sanitizeLocationArray = (value, warn, scope, details = {}) => {
  const res = [];
  for (let i = 0;i < value.length; i++) {
    const item = sanitizeLocationItem(value[i], warn, scope, {
      ...details,
      index: i
    });
    if (item !== undefined) {
      res.push(item);
    }
  }
  return res;
};
var sanitizeLocationRecord = (value, warn, scope) => {
  if (!isPlainObject(value)) {
    if (value !== undefined && value !== null) {
      warnIssue(warn, scope, "unsupported location container pruned", {
        type: typeof value,
        value
      });
    }
    return {};
  }
  const res = {};
  for (const key in value) {
    if (!Object.hasOwn(value, key)) {
      continue;
    }
    const safeKey = sanitizeLocationKey(key, warn, scope, { key });
    if (safeKey === undefined) {
      continue;
    }
    const item = value[key];
    if (Array.isArray(item)) {
      const safeArray = sanitizeLocationArray(item, warn, scope, {
        key: safeKey
      });
      if (safeArray.length) {
        res[safeKey] = safeArray;
      }
    } else {
      const safeValue = sanitizeLocationItem(item, warn, scope, {
        key: safeKey
      });
      if (safeValue !== undefined) {
        res[safeKey] = safeValue;
      }
    }
  }
  return res;
};
var sanitizeQueryText = (value, warn, scope) => {
  const text = sanitizeLocationText(value, warn, scope);
  const normalized = text.replace(/^\?/, "");
  const i = normalized.indexOf("#");
  if (i >= 0) {
    const pruned = normalized.slice(0, i);
    warnIssue(warn, scope, "query hash fragment pruned", {
      value: normalized,
      sanitized: pruned
    });
    return pruned;
  }
  return normalized;
};
var sanitizeHashText = (value, warn, scope) => sanitizeLocationText(`${value || ""}`.replace(/^#/, ""), warn, scope);
var sanitizePathText = (value, warn, scope) => {
  const text = sanitizeLocationText(value, warn, scope);
  const normalized = text ? text.startsWith("/") ? text : `/${text}` : "/";
  return normalized;
};
var formatPath = (value, warn) => {
  const text = sanitizePathText(value, warn, "browser.path");
  const segments = text.split("/");
  for (let i = 0;i < segments.length; i++) {
    segments[i] = encodeURIComponent(segments[i]);
  }
  return segments.join("/") || "/";
};
var parsePath = (value, warn) => {
  const text = sanitizePathText(value, warn, "browser.path");
  const segments = text.split("/");
  for (let i = 0;i < segments.length; i++) {
    try {
      segments[i] = decodeURIComponent(segments[i]);
    } catch (error) {
      warnIssue(warn, "browser.path", "path segment decode failed", {
        error,
        segment: segments[i],
        index: i
      });
    }
  }
  const path = segments.join("/");
  return path || "/";
};
var sanitizeValue = (value) => {
  if (value === undefined) {
    return;
  }
  if (Array.isArray(value)) {
    const res = [];
    for (let i = 0;i < value.length; i++) {
      const item = sanitizeValue(value[i]);
      if (item !== undefined) {
        res.push(item);
      }
    }
    return res;
  }
  if (isPlainObject(value)) {
    const res = {};
    for (const k in value) {
      if (!Object.hasOwn(value, k)) {
        continue;
      }
      const item = sanitizeValue(value[k]);
      if (item !== undefined) {
        res[k] = item;
      }
    }
    return res;
  }
  return value;
};
var mergePatch = (scope, path, value) => {
  if (!path || path.length === 0) {
    return value;
  }
  if (path.length === 1 && isPlainObject(scope) && isPlainObject(value)) {
    const merged = { ...scope, ...value };
    return sanitizeValue(merged);
  }
  return sanitizeValue(reassign(scope, path, value));
};
var QuerySerializer = {
  parse(value) {
    const result = {};
    const search = `${value || ""}`.replace(/^[?#]/, "");
    const entries = new URLSearchParams(search);
    for (const [k, v] of entries.entries()) {
      if (k.endsWith("[]")) {
        const baseKey = k.slice(0, -2);
        const existing = result[baseKey];
        if (Array.isArray(existing)) {
          existing.push(parsePrimitive(v));
        } else if (existing !== undefined) {
          result[baseKey] = [existing, parsePrimitive(v)];
        } else {
          result[baseKey] = [parsePrimitive(v)];
        }
      } else {
        result[k] = parsePrimitive(v);
      }
    }
    return result;
  },
  format(value) {
    const search = new URLSearchParams;
    const params = sanitizeValue(value) || {};
    for (const k in params) {
      if (!Object.hasOwn(params, k)) {
        continue;
      }
      const v = params[k];
      if (Array.isArray(v)) {
        for (let i = 0;i < v.length; i++) {
          search.append(`${k}[]`, formatPrimitive(v[i]));
        }
      } else if (v !== undefined) {
        search.set(k, formatPrimitive(v));
      }
    }
    return search.toString();
  }
};
var JSONSerializer = {
  parse(value) {
    return JSON.parse(value);
  },
  format(value) {
    return JSON.stringify(sanitizeValue(value));
  }
};
var getBrowserWindow = () => typeof globalThis !== "undefined" && globalThis.window ? globalThis.window : undefined;
var getHistoryMode = (options, dflt = "replace") => {
  if (options && typeof options === "object" && !Array.isArray(options)) {
    return options.mode === "push" ? "push" : dflt;
  }
  return dflt;
};
var isForced = (options) => options === true || !!(options && typeof options === "object" && !Array.isArray(options) && options.force);

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
    return new Selected(this, path);
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
    throw new Error(`${this.constructor.name}.refresh() not implemented`);
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
    super();
    this.parent = undefined;
    this.path = undefined;
    this.select(parent, path);
  }
  select(parent, path) {
    const nextPath = path === undefined || path === null ? [] : Array.isArray(path) ? path : [path];
    let samePath = this.path === nextPath;
    if (!samePath && this.path && this.path.length === nextPath.length) {
      samePath = true;
      for (let i = 0;i < nextPath.length; i++) {
        if (this.path[i] !== nextPath[i]) {
          samePath = false;
          break;
        }
      }
    }
    if (this.parent === parent && samePath) {
      return this;
    }
    if (this.parent?.selections && this.path) {
      this.parent.selections.remove(this.path, this);
    }
    this.parent = parent;
    this.path = nextPath;
    if (parent instanceof Reactive) {
      parent.selections = parent.selections ?? new Selections;
      parent.selections.add(nextPath, this);
      this.value = access(parent.value, nextPath);
    } else {
      this.value = parent ? access(parent, nextPath) : undefined;
    }
    this.isPending = !!(this.value && typeof this.value.then === "function");
    return this;
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
    super();
    this._promiseToken = 0;
    if (value !== Nothing) {
      this._update(value, Nothing, true);
    }
  }
  _update(value, path, _force = false) {
    path = normpath(path);
    if (!_force) {
      if (path) {
        const current = access(this.value, path);
        if (Object.is(current, value)) {
          return;
        }
      } else if (Object.is(this.value, value)) {
        return;
      }
    }
    const updated = path ? reassign(this.value, path, value) : value;
    const pending = path && value && typeof value.then === "function" ? value : updated;
    const token = ++this._promiseToken;
    this.previous = this.value;
    this.value = updated;
    this.isPending = !!(pending && typeof pending.then === "function");
    this.revision++;
    if (this.selections) {
      for (const r of this.selections.iter(path)) {
        r.refresh();
      }
    }
    this.pub(value, path, this);
    if (pending && typeof pending.then === "function") {
      pending.then((resolved) => {
        if (token !== this._promiseToken) {
          return;
        }
        this.previous = this.value;
        this.value = path ? reassign(this.value, path, resolved) : resolved;
        this.isPending = false;
        this.revision++;
        if (this.selections) {
          for (const r of this.selections.iter(path)) {
            r.refresh();
          }
        }
        this.pub(resolved, path, this);
      }, (error) => {
        if (token !== this._promiseToken) {
          return;
        }
        this.isPending = false;
        logSelectCells("error", "Cell._update", "cell promise rejected", {
          error,
          path
        });
      });
    }
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
    return this;
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
        if (value && typeof value.then === "function") {
          return;
        }
        const fullPath = sourcePath === undefined || sourcePath === null ? path : Array.isArray(sourcePath) ? [...path, ...sourcePath] : [...path, sourcePath];
        this.expanded = reassign(this.expanded, fullPath, value);
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

class BrowserValueCell extends Cell {
  constructor(value, options = {}) {
    super(value);
    this.mode = options.mode === "push" ? "push" : "replace";
    this.merge = options.merge || false;
    this.normalize = options.normalize;
    this.writer = options.writer;
  }
  set(value, path = Nothing, options = false) {
    const resolvedPath = normpath(path);
    const force = isForced(options);
    let next = this.merge ? mergePatch(this.value, resolvedPath, value) : resolvedPath ? sanitizeValue(reassign(this.value, resolvedPath, value)) : value;
    if (this.normalize) {
      next = this.normalize(next);
    }
    if (!force && eq(this.value, next)) {
      return this;
    }
    this._update(resolvedPath ? access(next, resolvedPath) : next, resolvedPath, force);
    if (this.writer) {
      this.writer(this.value, {
        mode: getHistoryMode(options, this.mode),
        path: resolvedPath
      });
    }
    return this;
  }
  sync(value) {
    if (this.normalize) {
      value = this.normalize(value);
    }
    this._update(value, Nothing, false);
    return this;
  }
}

class LocalStorageCell extends Cell {
  constructor(key, value, options = {}) {
    super(value);
    this.key = key;
    this.merge = options.merge || false;
    this.writer = options.writer;
  }
  set(value, path = Nothing, options = false) {
    const resolvedPath = normpath(path);
    const force = isForced(options);
    const next = this.merge ? mergePatch(this.value, resolvedPath, value) : resolvedPath ? sanitizeValue(reassign(this.value, resolvedPath, value)) : value;
    if (!force && eq(this.value, next)) {
      return this;
    }
    this._update(resolvedPath ? access(next, resolvedPath) : next, resolvedPath, force);
    if (this.writer) {
      this.writer(this.value, { path: resolvedPath });
    }
    return this;
  }
  sync(value) {
    this._update(value, Nothing, false);
    return this;
  }
}
function browser(options = {}) {
  const win = getBrowserWindow();
  const hasWindow = !!win?.location;
  const hasHistory = !!(hasWindow && win.history && typeof win.history.replaceState === "function");
  const hasStorage = !!(hasWindow && win.localStorage);
  const warn = typeof options.warn === "function" ? options.warn : (scope, error, details = {}) => logSelectCells("warn", scope, error?.message || "browser warning", {
    error,
    ...details
  });
  const urlMode = options.mode === "push" ? "push" : "replace";
  const querySerializer = options.query && typeof options.query.parse === "function" && typeof options.query.format === "function" ? options.query : QuerySerializer;
  const hashSerializer = options.hash && typeof options.hash.parse === "function" && typeof options.hash.format === "function" ? options.hash : QuerySerializer;
  const localSerializer = options.local && typeof options.local.parse === "function" && typeof options.local.format === "function" ? options.local : JSONSerializer;
  const safeParse = (scope, serializer, text, fallback) => {
    try {
      return serializer.parse(text);
    } catch (error) {
      warn(scope, error, { text });
      return fallback;
    }
  };
  const parseLocationRecord = (scope, serializer, text, fallback) => sanitizeLocationRecord(safeParse(scope, serializer, text, fallback), warn, scope);
  const formatLocationRecord = (scope, serializer, value) => serializer.format(sanitizeLocationRecord(value, warn, scope));
  const formatURL = (pathValue, queryValue, hashValue) => {
    const path2 = formatPath(pathValue, warn);
    const search = sanitizeQueryText(formatLocationRecord("browser.query", querySerializer, queryValue), warn, "browser.query");
    const hash2 = sanitizeHashText(formatLocationRecord("browser.hash", hashSerializer, hashValue), warn, "browser.hash");
    return `${path2}${search ? `?${search}` : ""}${hash2 ? `#${hash2}` : ""}`;
  };
  const readPath = () => hasWindow ? parsePath(win.location.pathname, warn) : sanitizePathText(options.path || "/", warn, "browser.path");
  const readQuery = (fallback = {}) => hasWindow ? parseLocationRecord("browser.query", querySerializer, sanitizeQueryText(win.location.search, warn, "browser.query"), fallback) : fallback;
  const readHash = (fallback = {}) => hasWindow ? parseLocationRecord("browser.hash", hashSerializer, sanitizeHashText(win.location.hash, warn, "browser.hash"), fallback) : fallback;
  const writeURL = (mode = urlMode) => {
    if (!hasHistory) {
      return;
    }
    const url = formatURL(path.value, query2.value, hash.value);
    if (mode === "push" && typeof win.history.pushState === "function") {
      win.history.pushState(null, "", url);
    } else {
      win.history.replaceState(null, "", url);
    }
  };
  const path = new BrowserValueCell(readPath(), {
    mode: urlMode,
    normalize: (value) => parsePath(value, warn),
    writer: (_value, settings) => writeURL(settings.mode)
  });
  const query2 = new BrowserValueCell(readQuery({}), {
    mode: urlMode,
    merge: true,
    normalize: (value) => sanitizeLocationRecord(value, warn, "browser.query"),
    writer: (_value, settings) => writeURL(settings.mode)
  });
  const hash = new BrowserValueCell(readHash({}), {
    mode: urlMode,
    merge: true,
    normalize: (value) => sanitizeLocationRecord(value, warn, "browser.hash"),
    writer: (_value, settings) => writeURL(settings.mode)
  });
  const syncFromLocation = () => {
    const nextPath = readPath();
    const nextQuery = readQuery(query2.value || {});
    const nextHash = readHash(hash.value || {});
    if (!eq(path.value, nextPath)) {
      path.sync(nextPath);
    }
    if (!eq(query2.value, nextQuery)) {
      query2.sync(nextQuery);
    }
    if (!eq(hash.value, nextHash)) {
      hash.sync(nextHash);
    }
  };
  if (hasWindow && typeof win.addEventListener === "function") {
    win.addEventListener("popstate", syncFromLocation);
    win.addEventListener("hashchange", () => {
      const nextHash = readHash(hash.value || {});
      if (!eq(hash.value, nextHash)) {
        hash.sync(nextHash);
      }
    });
  }
  const locals = new Map;
  const writeLocal = (key, value, serializer) => {
    if (!hasStorage) {
      return;
    }
    if (value === undefined) {
      win.localStorage.removeItem(key);
      return;
    }
    const formatted = serializer.format(value);
    if (formatted === undefined) {
      win.localStorage.removeItem(key);
    } else {
      win.localStorage.setItem(key, formatted);
    }
  };
  if (hasWindow && typeof win.addEventListener === "function") {
    win.addEventListener("storage", (event) => {
      if (!event.key || !locals.has(event.key)) {
        return;
      }
      const entry = locals.get(event.key);
      const fallback = entry.defaultValue;
      const next = event.newValue === null ? fallback : safeParse(`browser.local:${event.key}`, entry.serializer, event.newValue, entry.cell.value ?? fallback);
      if (!eq(entry.cell.value, next)) {
        entry.cell.sync(next);
      }
    });
  }
  const local = (key, dflt, opts = {}) => {
    if (locals.has(key)) {
      return locals.get(key).cell;
    }
    const serializer = opts && typeof opts.parse === "function" && typeof opts.format === "function" ? opts : localSerializer;
    const initial = hasStorage ? (() => {
      const raw = win.localStorage.getItem(key);
      return raw === null ? dflt : safeParse(`browser.local:${key}`, serializer, raw, dflt);
    })() : dflt;
    const cell = new LocalStorageCell(key, initial, {
      merge: true,
      writer: (value) => writeLocal(key, value, serializer)
    });
    locals.set(key, {
      cell,
      defaultValue: dflt,
      serializer
    });
    if (hasStorage && win.localStorage.getItem(key) === null && dflt !== undefined) {
      writeLocal(key, initial, serializer);
    }
    return cell;
  };
  return { path, query: query2, hash, local };
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
function selected(parent, path) {
  return new Selected(parent, path);
}
var walk = Reactive.Walk;
var expand = Reactive.Expand;
var select_cells_default = Object.assign(cell, {
  browser,
  deferred,
  derived,
  selected,
  walk,
  expand
});

// src/js/select.extra.js
function bool(value) {
  if (value == null)
    return false;
  if (typeof value === "boolean")
    return value;
  if (typeof value === "number")
    return value !== 0;
  if (typeof value === "string")
    return value.length > 0;
  return true;
}
function cmp(a, b, extractorFunc) {
  if (extractorFunc) {
    const ext = extractor(extractorFunc);
    a = ext(a);
    b = ext(b);
  }
  if (a < b)
    return -1;
  if (a > b)
    return 1;
  return 0;
}
function predicate(predicateOrExtractor) {
  if (typeof predicateOrExtractor === "function") {
    return predicateOrExtractor;
  } else if (predicateOrExtractor == null) {
    return (v) => bool(v);
  } else {
    const ext = extractor(predicateOrExtractor);
    return (v) => bool(ext(v));
  }
}
function extractor(pathOrFunc) {
  if (typeof pathOrFunc === "function") {
    return pathOrFunc;
  } else if (pathOrFunc == null) {
    return (v) => v;
  } else {
    return (v) => get(v, pathOrFunc);
  }
}
function sorted(values, extractorFunc) {
  const arr = list(values);
  if (extractorFunc) {
    const ext = extractor(extractorFunc);
    return arr.slice().sort((a, b) => cmp(ext(a), ext(b)));
  }
  return arr.slice().sort();
}
function unique(values, extractorFunc) {
  const arr = list(values);
  if (extractorFunc) {
    const ext = extractor(extractorFunc);
    const seen = new Set;
    return arr.filter((v) => {
      const key = ext(v);
      if (seen.has(key))
        return false;
      seen.add(key);
      return true;
    });
  }
  return Array.from(new Set(arr));
}
function filter2(values, predicateOrExtractor) {
  const arr = list(values);
  const pred = predicate(predicateOrExtractor);
  return arr.filter(pred);
}
function list(value) {
  if (value == null)
    return [];
  switch (value?.constructor) {
    case Array:
      return value;
    case Object:
      return Object.values(value);
    case Map:
      return Array.from(value.values());
    case Set:
      return Array.from(value);
    default:
      return [value];
  }
}
function itemkey(item) {
  return item?.id ?? item?.key ?? item?.name ?? item;
}
function find(items, item, key = itemkey) {
  if (!items) {
    return -1;
  }
  items = list(items);
  if (key === null) {
    return items.indexOf(item);
  }
  const extract = key ?? itemkey;
  const k = extract(item);
  return items.findIndex((_) => extract(_) === k);
}
function has(items, item, key = itemkey) {
  return find(items, item, key) >= 0;
}
function add(items, item, key = itemkey) {
  if (!items) {
    return [item];
  }
  items = list(items);
  const i = find(items, item, key);
  if (i === -1) {
    return [...items, item];
  }
  return items;
}
function remove(items, item, key = itemkey) {
  if (!items) {
    return items;
  }
  items = list(items);
  const i = find(items, item, key);
  if (i >= 0) {
    const res = [...items];
    res.splice(i, 1);
    return res;
  }
  return items;
}
function toggle(items, item, key = itemkey) {
  return has(items, item, key) ? remove(items, item, key) ?? [] : add(items, item, key);
}
function next(items, index, delta = 1) {
  const n = typeof items === "number" ? items : items?.length ?? 0;
  if (n <= 0) {
    return 0;
  }
  return ((index + delta) % n + n) % n;
}
function* iclsx(...args) {
  for (const value of args) {
    if (!value) {
      continue;
    }
    switch (value?.constructor) {
      case Array:
        yield* iclsx(...value);
        break;
      case Object:
        for (const key in value) {
          const token = key.trim();
          if (value[key] && token) {
            yield token;
          }
        }
        break;
      case String:
        {
          const token = value.trim();
          if (token.length) {
            yield token;
          }
        }
        break;
      case Number:
        yield `${value}`;
        break;
      case Boolean:
        break;
    }
  }
}
var clsx = (...args) => {
  return [...iclsx(...args)].join(" ");
};
var bind = (node, handlers) => {
  if (handlers) {
    for (const [name, handler] of Object.entries(handlers)) {
      for (const target of Array.isArray(node) ? node : [node]) {
        target.addEventListener(name, handler);
      }
    }
  }
  return node;
};
var unbind = (node, handlers) => {
  if (handlers) {
    for (const [name, handler] of Object.entries(handlers)) {
      for (const target of Array.isArray(node) ? node : [node]) {
        target.removeEventListener(name, handler);
      }
    }
  }
  return node;
};
var drag = (event, move, end) => {
  const context = {};
  const dragging = {
    node: event.target,
    ox: event.pageX,
    oy: event.pageY,
    pointerEvents: event.target.style.pointerEvents,
    userSelect: event.target.style.userSelect,
    context,
    isFirst: true,
    isLast: false,
    step: 0,
    dx: 0,
    dy: 0
  };
  const data = Object.create(dragging);
  const scope = globalThis.window;
  const onEnd = (event2) => {
    const mouseEvent = event2;
    dragging.node.style.pointerEvents = dragging.pointerEvents;
    dragging.node.style.userSelect = dragging.userSelect;
    unbind(scope, handlers);
    data.dx = mouseEvent.pageX - dragging.ox;
    data.dy = mouseEvent.pageY - dragging.oy;
    data.isLast = true;
    end?.(mouseEvent, data);
  };
  const handlers = {
    mousemove: (event2) => {
      const mouseEvent = event2;
      data.dx = mouseEvent.pageX - dragging.ox;
      data.dy = mouseEvent.pageY - dragging.oy;
      data.isFirst = dragging.step === 0;
      dragging.step += 1;
      const result = move?.(mouseEvent, data);
      switch (result) {
        case null:
          event2.preventDefault();
          event2.stopPropagation();
          break;
        case false:
          doEnd();
      }
    },
    mouseup: onEnd,
    mouseleave: onEnd
  };
  event.target.style.userSelect = "none";
  const doEnd = () => unbind(scope, handlers);
  bind(scope, handlers);
  return doEnd;
};
var target = (node, predicate2) => {
  while (node && node.nodeType === Node.ELEMENT_NODE) {
    if (predicate2(node)) {
      return node;
    }
    node = node.parentNode;
  }
  return;
};
var dragtarget = (node, name) => {
  while (node && node.nodeType === Node.ELEMENT_NODE) {
    const element = node;
    if (!name && element.hasAttribute("data-drag")) {
      return element;
    }
    if (name && element.getAttribute("data-drag") === name) {
      return element;
    }
    node = element.parentNode;
  }
  return node?.nodeType === Node.ELEMENT_NODE ? node : undefined;
};
drag.target = dragtarget;
var autoresize = (event) => {
  const node = event.target;
  node.style.height = "auto";
  const style = globalThis.window.getComputedStyle(node);
  const border = parseFloat(style.borderTopWidth) + parseFloat(style.borderBottomWidth);
  node.style.height = `${border + node.scrollHeight}px`;
};
var Keyboard = {
  Down: "keydown",
  Up: "keyup",
  Press: "press",
  Codes: {
    SPACE: 32,
    TAB: 9,
    ENTER: 13,
    COMMA: 188,
    COLON: 186,
    BACKSPACE: 8,
    INSERT: 45,
    DELETE: 46,
    ESC: 27,
    UP: 38,
    DOWN: 40,
    LEFT: 37,
    RIGHT: 39,
    PAGE_UP: 33,
    PAGE_DOWN: 34,
    HOME: 36,
    END: 35,
    SHIFT: 16,
    ALT: 18,
    CTRL: 17,
    META_L: 91,
    META_R: 92
  },
  Key(event) {
    return event ? event.key ?? event.keyIdentifier ?? null : null;
  },
  Code(event) {
    return event ? event.keyCode ?? null : null;
  },
  Char(event) {
    const key = Keyboard.Key(event);
    return !key ? null : key.length === 1 ? key : key === "Enter" ? `
` : null;
  },
  IsControl(event) {
    const key = Keyboard.Key(event);
    return !!(key && key.length > 1);
  },
  HasModifier(event) {
    return !!(event && (event.altKey || event.ctrlKey));
  }
};

class RoutePattern {
  constructor(regexp, extractor2 = undefined) {
    this.regexp = regexp;
    this.extractor = extractor2;
  }
}
var pattern = (regexp, extractor2 = undefined) => new RoutePattern(regexp, extractor2);
var ROUTE_PATTERNS = {
  chunk: pattern(/^[^/]+$/),
  number: pattern(/^[0-9]+$/),
  alpha: pattern(/^[A-Za-z]+$/),
  string: pattern(/^[A-Za-z0-9_-]+$/)
};

class RoutePatternSlot {
  constructor(pattern2, name, index) {
    this.pattern = pattern2;
    this.name = name;
    this.index = index;
  }
  toJSON() {
    return { name: this.name, matches: this.pattern.regexp.source };
  }
}
var splitPath = (value) => {
  if (Array.isArray(value)) {
    return value;
  }
  if (value === undefined || value === null) {
    return [];
  }
  const text = `${value}`;
  if (!text.length) {
    return [];
  }
  const items = text.split("/");
  const res = [];
  for (let i = 0;i < items.length; i++) {
    const item = items[i];
    if (item) {
      res.push(item);
    }
  }
  return res;
};
var route = (text) => {
  if (Array.isArray(text)) {
    return text;
  }
  const items = splitPath(text);
  const res = [];
  for (let i = 0;i < items.length; i++) {
    const item = items[i];
    if (item.startsWith("{")) {
      if (!item.endsWith("}")) {
        throw new SyntaxError(`Route item '${item}' does not end with a brace: ${text}`);
      }
      const parts = item.slice(1, -1).split(":", 2);
      const name = parts[0] || "";
      const type = parts[1];
      const matched = type && ROUTE_PATTERNS[type] ? ROUTE_PATTERNS[type] : type ? new RoutePattern(new RegExp(type)) : ROUTE_PATTERNS.chunk;
      res.push(new RoutePatternSlot(matched, name, res.length));
    } else {
      res.push(item);
    }
  }
  return res;
};

class RouteHandler {
  constructor(route2, value, priority = undefined, captured = null) {
    this.route = route2;
    this.value = value;
    this.priority = priority;
    this.captured = captured;
  }
  capture(path) {
    const r = {};
    const items = splitPath(path);
    if (this.captured) {
      for (const k in this.captured) {
        const index = this.captured[k];
        if (index !== undefined) {
          r[k] = items[index] ?? "";
        }
      }
    }
    return r;
  }
  apply(path, ...value) {
    return this.value(path, this.capture(path), ...value);
  }
}

class Router {
  constructor() {
    this.static = new Map;
    this.dynamic = new Map;
    this.handlers = [];
  }
  on(expr, handler = undefined, priority = undefined, offset = 0) {
    const rte = route(expr);
    const chunk = rte[offset];
    if (offset === rte.length) {
      const captured = rte.reduce((r, v, i) => {
        if (v instanceof RoutePatternSlot) {
          r = r || {};
          r[v.name] = i;
        }
        return r;
      }, null);
      this.handlers.push(new RouteHandler(rte, handler, priority, captured));
    } else if (typeof chunk === "string") {
      if (!this.static.has(chunk)) {
        this.static.set(chunk, new Router);
      }
      const sub = this.static.get(chunk);
      if (sub) {
        sub.on(rte, handler, priority, offset + 1);
      }
    } else if (chunk instanceof RoutePatternSlot) {
      const key = chunk.pattern;
      if (!this.dynamic.has(key)) {
        this.dynamic.set(key, new Router);
      }
      const sub = this.dynamic.get(key);
      if (sub) {
        sub.on(rte, handler, priority, offset + 1);
      }
    } else {
      throw new Error(`Unsupported route value: ${chunk}`);
    }
    return this;
  }
  off(expr, handler = undefined, offset = 0) {
    const rte = route(expr);
    const chunk = rte[offset];
    if (offset === rte.length) {
      if (handler) {
        this.handlers = this.handlers.filter((h) => h.value !== handler);
      } else {
        this.handlers = [];
      }
    } else if (typeof chunk === "string") {
      if (this.static.has(chunk)) {
        this.static.get(chunk)?.off(rte, handler, offset + 1);
      }
    } else if (chunk instanceof RoutePatternSlot) {
      const key = chunk.pattern;
      let sub = this.dynamic.get(key);
      if (!sub) {
        for (const [k, v] of this.dynamic.entries()) {
          if (k.regexp.source === key.regexp.source) {
            sub = v;
            break;
          }
        }
      }
      if (sub) {
        sub.off(rte, handler, offset + 1);
      }
    } else {
      throw new Error(`Unsupported route value: ${chunk}`);
    }
    return this;
  }
  match(path, offset = 0) {
    const items = splitPath(path);
    const chunk = items[offset];
    if (offset >= items.length) {
      return this.handlers;
    }
    if (chunk === undefined) {
      return null;
    }
    if (this.static.has(chunk)) {
      return this.static.get(chunk)?.match(items, offset + 1) ?? null;
    }
    for (const [k, v] of this.dynamic.entries()) {
      const m = chunk.match(k.regexp);
      if (m) {
        return v.match(items, offset + 1);
      }
    }
    return null;
  }
  run(path, ...args) {
    const handlers = this.match(path);
    if (!handlers || handlers.length === 0) {
      return;
    }
    let best;
    for (let i = handlers.length - 1;i >= 0; i--) {
      const h = handlers[i];
      if (!h) {
        continue;
      }
      best = !best || (h.priority || 0) > (best.priority || 0) ? h : best;
    }
    return best ? best.apply(path, ...args) : undefined;
  }
  *iwalk() {
    for (const handler of this.handlers) {
      yield handler;
    }
    for (const v of this.static.values()) {
      for (const w of v.iwalk()) {
        yield w;
      }
    }
    for (const v of this.dynamic.values()) {
      for (const w of v.iwalk()) {
        yield w;
      }
    }
  }
  tree() {
    const routes = {};
    for (const [k, v] of this.static.entries()) {
      routes[k] = v.tree();
    }
    for (const [k, v] of this.dynamic.entries()) {
      routes[k.regexp.source] = v.tree();
    }
    const handlers = this.handlers.map((h) => h.route);
    const res = {};
    if (Object.keys(routes).length) {
      Object.assign(res, routes);
    }
    if (handlers.length) {
      res["#handlers"] = handlers;
    }
    return res;
  }
}
var router = (routes = undefined) => {
  return Object.entries(routes || {}).reduce((r, [k, v]) => r.on(route(k), v), new Router);
};
var routed = (routes = undefined) => {
  const r = router(routes);
  return Object.assign((path, ...args) => {
    return r.run(path, ...args);
  }, { router: r, match: r.match.bind(r) });
};
var extra = Object.freeze({
  bind,
  clsx,
  bool,
  cmp,
  predicate,
  extractor,
  sorted,
  filter: filter2,
  find,
  has,
  drag,
  dragtarget,
  iclsx,
  Keyboard,
  itemkey,
  next,
  add,
  remove,
  route,
  Router,
  router,
  routed,
  target,
  toggle,
  unbind,
  list,
  unique
});
var select_extra_default = extra;

// src/js/select.fastdom.js
var win = typeof globalThis !== "undefined" && globalThis.window;
var raf = win ? win.requestAnimationFrame || win.webkitRequestAnimationFrame || win.mozRequestAnimationFrame || win.msRequestAnimationFrame || ((cb) => setTimeout(() => cb(0), 16)) : (cb) => cb(0);

class FastDOM {
  constructor() {
    this.reads = [];
    this.writes = [];
    this.isRunning = false;
    this.raf = win ? raf.bind(win) : raf;
    this.catch = null;
    this.scheduled = false;
  }
  runFastDOMTasks(tasks) {
    this.isRunning = true;
    try {
      let task;
      while (true) {
        task = tasks.shift();
        if (task === undefined)
          break;
        task();
      }
    } finally {
      this.isRunning = false;
    }
  }
  measure(fn, ctx) {
    const task = !ctx ? fn : fn.bind(ctx);
    this.reads.push(task);
    scheduleFlush(this);
    return task;
  }
  mutate(fn, ctx) {
    const task = !ctx ? fn : fn.bind(ctx);
    this.writes.push(task);
    scheduleFlush(this);
    return task;
  }
  clear(task) {
    return remove2(this.reads, task) || remove2(this.writes, task);
  }
  extend(props) {
    if (typeof props !== "object")
      throw new Error("expected object");
    const child = Object.create(this);
    mixin(child, props);
    if (child.initialize)
      child.initialize(props);
    return child;
  }
}
function scheduleFlush(fastdom) {
  if (!fastdom.scheduled) {
    fastdom.scheduled = true;
    fastdom.raf(() => flush(fastdom));
  }
}
function flush(fastdom) {
  const writes = fastdom.writes;
  const reads = fastdom.reads;
  let error;
  try {
    fastdom.runFastDOMTasks(reads);
    fastdom.runFastDOMTasks(writes);
  } catch (e) {
    error = e;
  }
  fastdom.scheduled = false;
  if (reads.length || writes.length)
    scheduleFlush(fastdom);
  if (error) {
    if (fastdom.catch)
      fastdom.catch(error);
    else
      throw error;
  }
}
function remove2(array, item) {
  const index = array.indexOf(item);
  return index !== -1 && array.splice(index, 1).length > 0;
}
function mixin(target2, source) {
  for (const key in source) {
    if (Object.hasOwn(source, key))
      target2[key] = source[key];
  }
}
var fastdom = new FastDOM;
var select_fastdom_default = fastdom;

// src/js/select.icons.js
var SVG_NAMESPACE = "http://www.w3.org/2000/svg";
var DEFAULT_SOURCE_NAME = "iconoir";
var ICON_NAME_TOKEN = "__ICON_NAME__";
var ICON_COLLECTIONS_URL = "https://api.iconify.design/collections";
var DEFAULT_ICON_STYLE = {
  color: "var(--color-icon, currentColor)"
};
var SourceTransforms = {
  identity: (name) => name,
  kebabcase: (name) => `${name}`.replaceAll("_", "-").replaceAll(" ", "-"),
  snakecase: (name) => `${name}`.replaceAll("-", "_").replaceAll(" ", "_"),
  suffixOutline: (name) => name.endsWith("-outline") ? name : `${name}-outline`,
  suffixFill: (name) => name.endsWith("-fill") ? name : `${name}-fill`,
  suffixSolid: (name) => name.endsWith("-solid") ? name : `${name}-solid`
};
var BaseIconSources = {
  iconoir: {
    url: `https://api.iconify.design/iconoir/${ICON_NAME_TOKEN}.svg`,
    size: [24, 24]
  },
  devicons: {
    url: `https://api.iconify.design/devicon/${ICON_NAME_TOKEN}.svg`
  },
  iconoirsolid: {
    url: `https://api.iconify.design/iconoir/${ICON_NAME_TOKEN}.svg`,
    transform: "suffixSolid"
  },
  evaoutline: {
    url: `https://api.iconify.design/eva/${ICON_NAME_TOKEN}.svg`,
    transform: "suffixOutline"
  },
  evafill: {
    url: `https://api.iconify.design/eva/${ICON_NAME_TOKEN}.svg`,
    transform: "suffixFill"
  },
  fluent: {
    url: `https://api.iconify.design/fluent/${ICON_NAME_TOKEN}.svg`
  },
  radix: {
    url: `https://api.iconify.design/radix-icons/${ICON_NAME_TOKEN}.svg`
  }
};
var IconSources = Object.assign({}, BaseIconSources);
var SourceCatalogPromise = null;
var SourceCatalogInput;
var IconsContainer = Object.entries({
  width: "0",
  height: "0",
  viewBox: "0 0 0 0",
  style: "position:absolute; width:0; height:0; overflow:hidden;"
}).reduce((r, [k, v]) => {
  r.setAttribute(k, v);
  return r;
}, document.createElementNS(SVG_NAMESPACE, "svg"));
var Cache = new Map;
function normalizeCollections(collections) {
  const normalized = {};
  for (const prefix in collections) {
    const meta = collections[prefix];
    if (!meta || typeof meta !== "object") {
      continue;
    }
    const entry = {
      url: `https://api.iconify.design/${prefix}/${ICON_NAME_TOKEN}.svg`,
      collectionVersion: meta.version || "latest"
    };
    if (typeof meta.height === "number" && meta.height > 0) {
      entry.size = [meta.height, meta.height];
    }
    normalized[prefix.toLowerCase()] = entry;
  }
  return normalized;
}
async function resolveSourceCatalog(input) {
  let payload = input;
  if (!payload) {
    payload = ICON_COLLECTIONS_URL;
  }
  if (typeof payload === "string") {
    const response = await fetch(payload);
    payload = await response.json();
  }
  if (!payload || typeof payload !== "object") {
    return {};
  }
  if (payload.sources && typeof payload.sources === "object") {
    return payload.sources;
  }
  return normalizeCollections(payload);
}
function ensureSourceCatalog(input = SourceCatalogInput) {
  if (!SourceCatalogPromise) {
    SourceCatalogPromise = resolveSourceCatalog(input).then((sources) => {
      for (const key in sources) {
        IconSources[key.toLowerCase()] = sources[key];
      }
      for (const key in BaseIconSources) {
        IconSources[key] = BaseIconSources[key];
      }
      return IconSources;
    }).catch((error) => {
      console.warn("icons", "Could not load icon source catalog", error);
      return IconSources;
    });
  }
  return SourceCatalogPromise;
}
function configureSourceCatalog(input) {
  SourceCatalogInput = input;
  SourceCatalogPromise = null;
}
function sourceName(source, sources = IconSources) {
  if (typeof source === "string") {
    return source.toLowerCase();
  }
  const key = source;
  let result = "generic";
  for (const k in sources) {
    if (key === k) {
      result = k;
      break;
    } else if (key === sources[k]) {
      result = k;
      break;
    } else if (sources[k].url === key) {
      result = k;
      break;
    }
  }
  return result.toLowerCase();
}
function resolveSource(source) {
  if (typeof source !== "string") {
    return source;
  }
  const key = source.toLowerCase();
  return IconSources[key] || IconSources[DEFAULT_SOURCE_NAME];
}
function resolveTransform(transform) {
  if (typeof transform === "function") {
    return transform;
  }
  if (typeof transform === "string") {
    return SourceTransforms[transform] || SourceTransforms.identity;
  }
  return SourceTransforms.identity;
}
function loadIcon(name, source = DEFAULT_SOURCE_NAME, container = IconsContainer, cache = Cache) {
  const res = ensureSourceCatalog(SourceCatalogInput).then(() => {
    const resolvedSource = resolveSource(source);
    const sourceId = sourceName(source);
    const iconId = `icon-${name}-${sourceId}`;
    const iconName = resolveTransform(resolvedSource.transform)(name);
    const url = resolvedSource.url.replace(ICON_NAME_TOKEN, iconName);
    const cached = cache.get(url);
    if (cached instanceof Promise) {
      return cached;
    } else if (cached) {
      return Promise.resolve(cached);
    }
    const symbol = document.createElementNS(SVG_NAMESPACE, "symbol");
    symbol.id = iconId;
    container.appendChild(symbol);
    const iconRes = fetch(url).then((response) => {
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return response.text();
    }).then((text) => {
      const svgStart = text.indexOf("<svg");
      if (svgStart < 0) {
        throw new Error("SVG tag not found");
      }
      symbol.innerHTML = text.substring(svgStart);
      const icon = symbol.firstChild;
      if (!icon || `${icon.nodeName}`.toLowerCase() !== "svg") {
        throw new Error("Invalid SVG payload");
      }
      if (icon.attributes) {
        ["stroke-width", "fill", "stroke"].forEach((attr) => {
          if (icon.hasAttribute(attr)) {
            icon.removeAttribute(attr);
          }
        });
      }
      if (resolvedSource?.style) {
        Object.entries(resolvedSource.style).forEach(([k, v]) => {
          icon?.setAttribute(k, `${v}`);
        });
      }
      if (!container.parentElement) {
        document.body.appendChild(container);
      }
      cache.set(url, symbol);
      return symbol;
    }).catch((reason) => {
      symbol.parentNode?.removeChild(symbol);
      console.warn("icons", `Could not load icon "${name}" from <${url}>: ${reason}`, symbol);
      return;
    });
    cache.set(url, iconRes);
    return iconRes;
  });
  return res;
}
function icon(name, options = {}) {
  const {
    size = "1em",
    className = "icon",
    source = DEFAULT_SOURCE_NAME,
    container = IconsContainer,
    mode = undefined,
    style: customStyle = {}
  } = options;
  const resolvedSource = resolveSource(source);
  const mergedStyle = Object.assign({}, DEFAULT_ICON_STYLE, resolvedSource?.style, customStyle);
  const node = Object.entries({
    width: size,
    height: size
  }).reduce((r, [k, v]) => {
    r.setAttribute(k, v);
    return r;
  }, document.createElementNS(SVG_NAMESPACE, "svg"));
  const iconPromise = loadIcon(name, source, container).then((symbol) => {
    if (!symbol) {
      console.warn("icons", "Icon missing from source", { name, source });
    } else {
      const iconSvg = symbol.firstChild;
      if (iconSvg?.getAttribute) {
        const viewBox = iconSvg.getAttribute("viewBox");
        if (viewBox) {
          node.setAttribute("viewBox", viewBox);
        }
      } else {
        console.warn("icons", `Could not load icon "${name}", got:`, symbol);
      }
    }
    return symbol;
  });
  switch (mode) {
    case "inline":
      Object.assign(node.style, mergedStyle);
      node.classList.add(className);
      node.classList.add("loading");
      iconPromise.then((symbol) => {
        if (!symbol)
          return;
        const svg = symbol.children[0];
        if (!svg)
          return;
        for (const attr of Array.from(svg.attributes)) {
          if (!node.hasAttribute(attr.name)) {
            node.setAttribute(attr.name, attr.value);
          }
        }
        for (const child of Array.from(svg.children)) {
          node.appendChild(child.cloneNode(true));
        }
        node.classList.remove("loading");
      });
      return node;
    default: {
      const use = document.createElementNS(SVG_NAMESPACE, "use");
      use.classList.add(className);
      Object.assign(node.style, mergedStyle);
      use.setAttribute("href", `#icon-${name}-${sourceName(source)}`);
      node.appendChild(use);
      return node;
    }
  }
}
function loadIcons(icons) {
  console.warn("loadIcons not implemented", { icons });
}
function install(name = "ui-icon", options = {}) {
  const {
    source = DEFAULT_SOURCE_NAME,
    size = "1em",
    className = "icon",
    sources = undefined
  } = options;
  if (sources !== undefined) {
    configureSourceCatalog(sources);
  }
  ensureSourceCatalog(SourceCatalogInput);

  class IconElement extends HTMLElement {
    static observedAttributes = ["name", "source", "size", "icon"];
    iconNode = null;
    constructor() {
      super();
      this.attachShadow({ mode: "open" });
    }
    connectedCallback() {
      this.render();
    }
    attributeChangedCallback(_name, _oldValue, newValue) {
      if (newValue !== null) {
        this.render();
      }
    }
    render() {
      let iconName = this.getAttribute("name");
      let sourceName2 = this.getAttribute("source")?.toLowerCase();
      if (!iconName && !sourceName2) {
        const iconAttr = this.getAttribute("icon");
        if (iconAttr) {
          const colonIndex = iconAttr.indexOf(":");
          if (colonIndex > 0) {
            sourceName2 = iconAttr.substring(0, colonIndex).toLowerCase();
            iconName = iconAttr.substring(colonIndex + 1);
          } else {
            iconName = iconAttr;
          }
        }
      }
      iconName = iconName || "star";
      let iconSize = this.getAttribute("size") || size;
      if (iconSize && /^\d+$/.test(iconSize)) {
        iconSize = `${iconSize}px`;
      }
      const iconSource = sourceName2 ? IconSources[sourceName2] || (typeof source === "string" ? resolveSource(source) : source) : source;
      if (this.iconNode?.parentNode) {
        this.iconNode.parentNode.removeChild(this.iconNode);
      }
      this.iconNode = icon(iconName, {
        mode: "inline",
        source: iconSource,
        size: iconSize,
        className
      });
      if (this.shadowRoot) {
        this.shadowRoot.appendChild(this.iconNode);
      }
    }
  }
  if (!customElements.get(name)) {
    customElements.define(name, IconElement);
  }
}
var select_icons_default = Object.assign(icon, { install });

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
var queueMicro = typeof globalThis.queueMicrotask === "function" ? globalThis.queueMicrotask.bind(globalThis) : (fn) => Promise.resolve().then(fn);
var scheduleRenderTask = (fn) => {
  const mutate = globalThis.fastdom?.mutate;
  if (typeof mutate === "function") {
    mutate(fn);
  } else {
    queueMicro(fn);
  }
};
var _templateRegistries = new WeakMap;
var templateKey = (value) => {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.trim();
  const key = normalized.startsWith("#") ? normalized.slice(1) : normalized;
  return key.length ? key : null;
};
var registerTemplateKey = (registry, key, template, scope) => {
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
var registerTemplateNode = (template, registry, scope) => {
  if (!template || template.nodeName !== "TEMPLATE") {
    return;
  }
  registerTemplateKey(registry, template.id, template, scope);
  registerTemplateKey(registry, template.getAttribute("name"), template, scope);
  if (!template.content?.querySelectorAll) {
    return;
  }
  for (const nested of template.content.querySelectorAll("template")) {
    registerTemplateNode(nested, registry, scope);
  }
};
var templateRegistryFor = (scope = document) => {
  let registry = _templateRegistries.get(scope);
  if (registry) {
    return registry;
  }
  registry = new Map;
  _templateRegistries.set(scope, registry);
  const isTemplate = scope?.nodeName === "TEMPLATE";
  if (isTemplate) {
    registerTemplateNode(scope, registry, scope);
  } else if (scope?.querySelectorAll) {
    for (const template of scope.querySelectorAll("template")) {
      registerTemplateNode(template, registry, scope);
    }
  }
  return registry;
};
var registerTemplatesInNodes = (nodes, registry, scope) => {
  for (let i = 0;i < nodes.length; i++) {
    const node = nodes[i];
    if (node?.nodeName === "TEMPLATE") {
      registerTemplateNode(node, registry, scope);
    }
    if (node?.querySelectorAll) {
      for (const template of node.querySelectorAll("template")) {
        registerTemplateNode(template, registry, scope);
      }
    }
  }
};
var templateFormatterName = (template) => {
  if (template?.nodeName !== "TEMPLATE") {
    return null;
  }
  const name = template.getAttribute("name");
  if (typeof name === "string") {
    const normalizedName = name.trim();
    if (normalizedName.length) {
      return normalizedName;
    }
  }
  const id = typeof template.id === "string" ? template.id.trim() : "";
  return id.length ? id : null;
};
var createComponent = (tmpl) => {
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
    },
    cleanup: (...args) => {
      tmpl.cleanup(...args);
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
var WHEN_COMPARATORS = [
  "!==",
  "==",
  "!=",
  ">=",
  "<=",
  "~?",
  "=",
  ">",
  "<"
];
var parsePipedBinding = (expr, validateSource = false) => {
  const source = typeof expr === "string" ? expr.trim() : "";
  if (!source) {
    return null;
  }
  const parts = source.split("|");
  for (let i = 0;i < parts.length; i++) {
    parts[i] = parts[i].trim();
    if (!parts[i]) {
      return null;
    }
  }
  const sourceKey = parts[0];
  if (!sourceKey) {
    return null;
  }
  if (validateSource && !/^[A-Za-z0-9_$-]+$/.test(sourceKey)) {
    return null;
  }
  const processors = parts.length > 1 ? parts.slice(1) : [];
  for (let i = 0;i < processors.length; i++) {
    if (/\s/.test(processors[i])) {
      return null;
    }
  }
  return { sourceKey, processors };
};
var RE_BINDING_PATH = /^[A-Za-z_$][A-Za-z0-9_$-]*$/;
var parseBindingPath = (expr, allowDotted = true) => {
  const source = typeof expr === "string" ? expr.trim() : "";
  if (!source) {
    return null;
  }
  const parts = allowDotted ? source.split(".") : [source];
  if (!parts.length) {
    return null;
  }
  for (let i = 0;i < parts.length; i++) {
    const part = parts[i].trim();
    if (!part || !RE_BINDING_PATH.test(part)) {
      return null;
    }
    parts[i] = part;
  }
  return parts;
};
var parseTemplatePath = (expr) => {
  return parseBindingPath(expr, true);
};
var parseTemplatePlaceholder = (expr) => {
  const source = typeof expr === "string" ? expr.trim() : "";
  if (!source) {
    return null;
  }
  const parts = source.split("|");
  for (let i = 0;i < parts.length; i++) {
    parts[i] = parts[i].trim();
    if (!parts[i]) {
      return null;
    }
  }
  const path = parseTemplatePath(parts[0]);
  if (!path) {
    return null;
  }
  const processors = parts.length > 1 ? parts.slice(1) : null;
  if (processors) {
    for (let i = 0;i < processors.length; i++) {
      if (/\s/.test(processors[i])) {
        return null;
      }
    }
  }
  return { path, processors };
};
var parseOutAttributeBinding = (expr) => {
  const source = typeof expr === "string" ? expr : "";
  if (!source) {
    return {
      mode: "binding",
      binding: parsePipedBinding(source)
    };
  }
  const tokens = [];
  let last = 0;
  let hasTemplate = false;
  while (last < source.length) {
    const start = source.indexOf("${", last);
    if (start === -1) {
      if (last < source.length) {
        tokens.push({ type: "text", value: source.slice(last) });
      }
      break;
    }
    hasTemplate = true;
    if (start > last) {
      tokens.push({ type: "text", value: source.slice(last, start) });
    }
    const end = source.indexOf("}", start + 2);
    if (end === -1) {
      tokens.push({ type: "invalid" });
      last = source.length;
      break;
    }
    const placeholder = parseTemplatePlaceholder(source.slice(start + 2, end));
    if (!placeholder) {
      tokens.push({ type: "invalid" });
      last = end + 1;
      continue;
    }
    tokens.push({ type: "expr", value: placeholder });
    last = end + 1;
  }
  if (hasTemplate) {
    return {
      mode: "template",
      template: { tokens }
    };
  }
  return {
    mode: "binding",
    binding: parsePipedBinding(source)
  };
};
var resolveTemplateTokens = (self, tokens, data) => {
  if (!tokens?.length) {
    return "";
  }
  let result = "";
  for (let i = 0;i < tokens.length; i++) {
    const token = tokens[i];
    if (token.type === "text") {
      result += token.value;
      continue;
    }
    if (token.type === "invalid") {
      continue;
    }
    if (token.type === "expr") {
      const path = token.value.path;
      const value = resolveDataPath(data, path);
      if (value === undefined || value === null) {
        continue;
      }
      let resolved = expand(value);
      if (token.value.processors?.length) {
        resolved = applyNamedProcessors(self, data, resolved, token.value.processors, path.join("."));
      }
      if (resolved !== undefined && resolved !== null) {
        result += String(resolved);
      }
    }
  }
  return result;
};
var resolveDataPath = (data, path) => {
  if (!path?.length) {
    return data;
  }
  let value = data;
  for (let i = 0;i < path.length; i++) {
    value = expand(value);
    if (value === undefined || value === null) {
      return;
    }
    value = value[path[i]];
  }
  return value;
};
var resolveSourceValue = (data, sourceKey) => {
  if (!sourceKey) {
    return;
  }
  if (!sourceKey.includes(".")) {
    return data ? data[sourceKey] : undefined;
  }
  return resolveDataPath(data, sourceKey.split("."));
};
var parseWhenShorthand = (expr) => {
  const source = typeof expr === "string" ? expr.trim() : "";
  const parseWhenLiteral = (raw) => {
    const value = raw.trim();
    if (!value.length) {
      return "";
    }
    if (value === "true") {
      return true;
    }
    if (value === "false") {
      return false;
    }
    if (value === "null") {
      return null;
    }
    if (value === "undefined") {
      return;
    }
    if (/^[-+]?\d+(?:\.\d+)?(?:[eE][-+]?\d+)?$/.test(value)) {
      const numeric = Number(value);
      if (!Number.isNaN(numeric)) {
        return numeric;
      }
    }
    return value;
  };
  const parseWhenComparison = (text) => {
    for (let i2 = 0;i2 < WHEN_COMPARATORS.length; i2++) {
      const operator = WHEN_COMPARATORS[i2];
      const at = text.indexOf(operator);
      if (at <= 0) {
        continue;
      }
      const left = text.slice(0, at).trim();
      const right = text.slice(at + operator.length).trim();
      if (!left || !right) {
        return null;
      }
      const binding = parsePipedBinding(left, false);
      if (!binding) {
        return null;
      }
      const path = parseBindingPath(binding.sourceKey, true);
      if (!path) {
        return null;
      }
      return {
        key: path.join("."),
        processors: binding.processors,
        mode: WHEN_MODE_TRUTHY,
        operator,
        rawValue: right,
        value: parseWhenLiteral(right)
      };
    }
    return null;
  };
  const comparison = parseWhenComparison(source);
  if (comparison) {
    return comparison;
  }
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
  const bindingExpr = source.slice(i).trim();
  let key;
  let processors = [];
  if (bindingExpr) {
    const binding = parsePipedBinding(bindingExpr, false);
    if (!binding) {
      return null;
    }
    const path = parseBindingPath(binding.sourceKey, true);
    if (!path) {
      return null;
    }
    key = path.join(".");
    processors = binding.processors;
  }
  if (!bindingExpr && source.length > 0 && i === 0) {
    return null;
  }
  const mode = queryDefined ? negate ? WHEN_MODE_UNDEFINED : WHEN_MODE_DEFINED : negate ? WHEN_MODE_FALSY : WHEN_MODE_TRUTHY;
  return { key, processors, mode, operator: null, rawValue: null, value: undefined };
};
var evaluateWhen = (mode, value) => {
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
var evaluateWhenComparison = (left, operator, right) => {
  switch (operator) {
    case "=":
      return left == right;
    case "!=":
      return left != right;
    case "==":
      return left === right;
    case "!==":
      return left !== right;
    case "~?": {
      if (left === undefined || left === null) {
        return false;
      }
      if (right === undefined || right === null) {
        return false;
      }
      const l = String(left).toLowerCase();
      const r = String(right).toLowerCase();
      return l.includes(r);
    }
    case ">":
      return left > right;
    case ">=":
      return left >= right;
    case "<":
      return left < right;
    case "<=":
      return left <= right;
    default:
      return false;
  }
};
var resolveWhenValue = (self, data, key) => {
  const behavior = self?.template?.behavior;
  const b = behavior?.[key];
  if (b) {
    return b(self, data, null);
  }
  const value = resolveSourceValue(data, key);
  return value === undefined ? undefined : expand(value);
};
var isPascalCaseName = (name) => /^[A-Z][A-Za-z0-9_]*$/.test(name);
var resolveNamedProcessor = (self, name) => {
  if (!self?.template || !name) {
    return null;
  }
  const template = self.template;
  if (!template._processorCache) {
    template._processorCache = new Map;
  }
  const cached = template._processorCache.get(name);
  if (cached && cached.version === _formatsVersion) {
    return cached.value;
  }
  const registered = ui.formats?.[name];
  if (!registered) {
    template._processorCache.set(name, {
      version: _formatsVersion,
      value: null
    });
    return null;
  }
  const isPascal = isPascalCaseName(name);
  const isComponent = typeof registered === "function" && (registered?.isTemplate || typeof registered?.new === "function");
  if (isPascal && !isComponent) {
    logSelectUI("warn", "ui.formats", "PascalCase formatter is not a component", {
      name,
      formatter: registered
    });
  }
  if (!isPascal && isComponent) {
    logSelectUI("warn", "ui.formats", "component formatter should use PascalCase", {
      name,
      formatter: registered
    });
  }
  const resolved = {
    type: isComponent ? "component" : "function",
    value: registered
  };
  template._processorCache.set(name, {
    version: _formatsVersion,
    value: resolved
  });
  return resolved;
};
var applyNamedProcessors = (self, data, value, processors, sourceKey) => {
  if (!processors || processors.length === 0) {
    return value;
  }
  let current = value;
  for (let i = 0;i < processors.length; i++) {
    const name = processors[i];
    const processor = resolveNamedProcessor(self, name);
    if (!processor) {
      const availableProcessors = Object.keys(_formatsStore).sort();
      logSelectUI("warn", "UIInstance.render", "processor not found", {
        processor: name,
        sourceKey,
        availableProcessors,
        instance: self
      });
      continue;
    }
    if (processor.type === "component") {
      const component = processor.value;
      if (current === undefined || current === null) {
        continue;
      }
      if (typeof component?.apply === "function" && component?.isTemplate) {
        current = component(current);
      } else if (typeof component === "function") {
        current = component(current, self, data);
      }
    } else {
      current = processor.value(current, self, data, sourceKey, name);
    }
  }
  return current;
};
var createWhenPredicate = (mode, key, processors = undefined, operator = null, comparisonValue = undefined) => (self, data) => {
  const value = resolveWhenValue(self, data, key);
  const resolved = applyNamedProcessors(self, data, value, processors, key);
  if (operator) {
    return evaluateWhenComparison(resolved, operator, comparisonValue);
  }
  return evaluateWhen(mode, resolved);
};
var SLOT_DEFAULT_KEY = "_";
var isPrunableWhitespaceText = (node) => node && node.nodeType === Node.TEXT_NODE && !/\S/.test(node.data) && /[\n\r\t]/.test(node.data);
var pruneTemplateWhitespace = (node) => {
  if (!node?.childNodes || node.childNodes.length === 0) {
    return;
  }
  for (let i = node.childNodes.length - 1;i >= 0; i--) {
    const child = node.childNodes[i];
    if (isPrunableWhitespaceText(child)) {
      node.removeChild(child);
    } else {
      pruneTemplateWhitespace(child);
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
var isPlainObject2 = (v) => v !== null && v !== undefined && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype;
var eq2 = (a, b) => {
  if (a === b) {
    return true;
  }
  if (isPlainObject2(a) && isPlainObject2(b)) {
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
var createTrackingProxy = (data) => {
  const accessed = new Set;
  return [
    new Proxy(data, {
      get(target2, property) {
        accessed.add(property);
        return target2[property];
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
    const add2 = (node, parent, i) => {
      const k = node.getAttribute(name);
      node.removeAttribute(name);
      let v = new UITemplateSlot(node, parent, UITemplateSlot.Path(node, parent, [i]));
      if (name === "out") {
        const parsed = parsePipedBinding(k);
        if (!parsed) {
          logSelectUI("warn", "UITemplate", "invalid [out] binding", {
            binding: k,
            node,
            example: 'out="slot|Formatter|Formatter"'
          });
          v.binding = { sourceKey: `${k || ""}`.trim(), processors: [] };
        } else {
          v.binding = parsed;
        }
      }
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
        add2(parent, parent, i);
      }
      if (parent.querySelectorAll) {
        for (const node of parent.querySelectorAll(`[${name}]`)) {
          add2(node, parent, i);
        }
      }
    }
    return count ? res : null;
  }
  static FindWhen(nodes) {
    const res = {};
    let count = 0;
    const selector = `[when]`;
    const add2 = (node, parent, i) => {
      const expr = node.getAttribute("when") || "";
      const parsed = parseWhenShorthand(expr);
      const slot = new UITemplateSlot(node, parent, UITemplateSlot.Path(node, parent, [i]));
      if (parsed) {
        let whenKey = parsed.key;
        const whenProcessors = parsed.processors || [];
        const whenOperator = parsed.operator || null;
        const whenComparisonValue = parsed.value;
        const whenRawValue = parsed.rawValue || "";
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
          const outBinding = parsePipedBinding(outKey);
          if (!outBinding?.sourceKey) {
            logSelectUI("error", "UITemplate", "unable to infer [when] key from [out] binding", { expression: expr, out: outKey, node });
            return;
          }
          whenKey = outBinding.sourceKey;
        }
        node.removeAttribute("when");
        slot.predicate = createWhenPredicate(parsed.mode, whenKey, whenProcessors, whenOperator, whenComparisonValue);
        slot.predicatePlaceholder = document.createComment(expr || "when");
        const groupKey = `${parsed.mode}:${whenKey}:${whenProcessors.join("|")}:${whenOperator || ""}:${whenRawValue}`;
        if (res[groupKey] === undefined) {
          res[groupKey] = [slot];
        } else {
          res[groupKey].push(slot);
        }
        count++;
        return;
      }
      node.removeAttribute("when");
      logSelectUI("error", "UITemplate", "unsafe [when] expression blocked", {
        expression: expr,
        node,
        supported: [
          'when="slot"',
          'when="!slot"',
          'when="?slot"',
          'when="!?slot"',
          'when="slot~?value"',
          'when="slot=value"',
          'when="slot==value"',
          'when="slot!=value"',
          'when="slot!==value"',
          'when="slot>=value"',
          'when="slot<=value"',
          'when="slot>value"',
          'when="slot<value"',
          'when="slot|Formatter|Formatter"'
        ]
      });
      slot.predicate = () => false;
      slot.predicatePlaceholder = document.createComment("when:blocked");
      if (res.__blocked__ === undefined) {
        res.__blocked__ = [slot];
      } else {
        res.__blocked__.push(slot);
      }
      count++;
    };
    for (let i = 0;i < nodes.length; i++) {
      const parent = nodes[i];
      if (parent.matches?.(selector)) {
        add2(parent, parent, i);
      }
      if (parent.querySelectorAll) {
        for (const node of parent.querySelectorAll(selector)) {
          add2(node, parent, i);
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
    this.binding = undefined;
  }
  resolve(nodes) {
    let node = nodes[this.rootIndex];
    if (this.tailPath) {
      for (let i = 0;i < this.tailPath.length; i++) {
        node = node ? node.childNodes[this.tailPath[i]] : node;
      }
    }
    return node;
  }
  apply(nodes, parent, raw = false) {
    const node = this.resolve(nodes);
    return node ? raw ? node : new UISlot(node, this, parent) : null;
  }
  static FindAttr(prefix, nodes) {
    const res = {};
    const template = [];
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
            const parsed = parseOutAttributeBinding(slotName);
            const binding = parsed.binding;
            const sourceKey = binding?.sourceKey ?? slotName;
            const processorsKey = binding?.processors?.join("|") || "";
            const bindingKey = parsed.mode === "binding" ? `${sourceKey}|${processorsKey}` : slotName;
            const originalValue = node.getAttribute(attrName);
            toRemove.push(attr.name);
            const slot = new UIAttributeTemplateSlot(node, parent, UITemplateSlot.Path(node, parent, [i]), attrName, slotName, originalValue, parsed);
            if (parsed.mode === "template") {
              template.push(slot);
            } else {
              if (!res[bindingKey])
                res[bindingKey] = [];
              res[bindingKey].push(slot);
            }
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
    if (!count) {
      return null;
    }
    if (template.length) {
      res.$template = template;
    }
    return res;
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
  constructor(node, parent, path, attrName, slotName, originalValue, parsed) {
    this.node = node;
    this.parent = parent;
    this.path = path;
    this.rootIndex = path[0];
    this.tailPath = path.length > 1 ? path.slice(1) : null;
    this.attrName = attrName;
    this.slotName = slotName;
    this.originalValue = originalValue;
    this.mode = parsed?.mode || "binding";
    this.binding = parsed?.binding || null;
    this.template = parsed?.template || null;
  }
  resolve(nodes) {
    let node = nodes[this.rootIndex];
    if (this.tailPath) {
      for (let i = 0;i < this.tailPath.length; i++) {
        node = node ? node.childNodes[this.tailPath[i]] : node;
      }
    }
    return node;
  }
  apply(nodes, parent) {
    const node = this.resolve(nodes);
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
  resolve(nodes) {
    let node = nodes[this.rootIndex];
    if (this.tailPath) {
      for (let i = 0;i < this.tailPath.length; i++) {
        node = node ? node.childNodes[this.tailPath[i]] : node;
      }
    }
    return node;
  }
  apply(nodes, parent) {
    const node = this.resolve(nodes);
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
  constructor(nodes, scope = document) {
    this.nodes = nodes;
    this.scope = scope;
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
    this.doCleanup = undefined;
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
  cleanup(handler) {
    this.doCleanup = handler;
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
        const clone2 = node.cloneNode(true);
        clone2.removeAttribute("slot");
        slots[name] = clone2;
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
    this._isDisposed = false;
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
    this._renderQueued = false;
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
      this._renderer = () => this._scheduleRender();
    }
    return this._renderer;
  }
  _scheduleRender() {
    if (this._renderQueued || this._isDisposed) {
      return;
    }
    this._renderQueued = true;
    scheduleRenderTask(() => {
      this._renderQueued = false;
      if (!this._isDisposed) {
        this.render();
      }
    });
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
  syncReactiveDataSubs(data) {
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
    if (this._isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._renderQueued = false;
    if (this.template.doCleanup) {
      try {
        this.template.doCleanup(this, this.data || {});
      } catch (err) {
        logSelectUI("error", "UIInstance.dispose", "cleanup threw", {
          error: err,
          instance: this
        });
      }
    }
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
            const handler = this._getRenderer();
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
    if (this._domListeners?.length) {
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
  _bindEvent(name, target2, handler = this.template.behavior?.[name]) {
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
      target2.node.addEventListener(target2.eventType, listener);
      this._domListeners.push({
        node: target2.node,
        type: target2.eventType,
        handler: listener
      });
    }
  }
  _bindInput(name, target2, handler = this.template.behavior?.[name]) {
    let event;
    switch (target2.node.nodeName) {
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
    target2.node.addEventListener(event, listener);
    this._domListeners.push({
      node: target2.node,
      type: event,
      handler: listener
    });
  }
  set(data, key = this.key) {
    this.key = key;
    if (this.initial && data !== null && data !== undefined && typeof data === "object" && Object.getPrototypeOf(data) === Object.prototype) {
      this.render({ ...this.initial, ...data });
    } else {
      this.render(data);
    }
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
      if (force || !eq2(this.data, data)) {
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
        if (!eq2(existing, updated)) {
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
  _applyEagerBehaviorResult(entryKey, result, data) {
    if (result === undefined) {
      return data;
    }
    const stateKey = entryKey.endsWith("!") ? entryKey.slice(0, -1) : entryKey;
    if (!stateKey) {
      return data;
    }
    const target2 = data?.[stateKey];
    if (target2?.isReactive) {
      target2.set(result);
      return data;
    }
    if (!data || typeof data !== "object") {
      return data;
    }
    data[stateKey] = result;
    return data;
  }
  _runEagerBehaviors(data) {
    const behavior = this.template.behavior;
    if (!behavior) {
      return data;
    }
    let nextData = data;
    for (const key in behavior) {
      if (!key.endsWith("!")) {
        continue;
      }
      const result = behavior[key](this, nextData, null);
      nextData = this._applyEagerBehaviorResult(key, result, nextData);
    }
    return nextData;
  }
  send(event, data) {
    console.warn(`[select.ui] Deprecation: send() is deprecated, use pub() instead`);
    return this.pub(event, data);
  }
  emit(event, data) {
    console.warn(`[select.ui] Deprecation: emit() is deprecated, use pub() instead`);
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
    data = this._runEagerBehaviors(data);
    const isGranular = changedKeys !== null && changedKeys.size > 0;
    if (!(this.template.out || this.template.inout || this.template.in || this.template.outAttr)) {
      let hasElementNode = false;
      for (const node of this.nodes) {
        if (node.nodeType === Node.ELEMENT_NODE) {
          hasElementNode = true;
          break;
        }
      }
      if (!hasElementNode) {
        const text = asText(data);
        for (const node of this.nodes) {
          if (node.nodeType === Node.TEXT_NODE) {
            setNodeText(node, text);
            break;
          }
        }
      }
    } else {
      const behavior = this.template.behavior;
      const renderSet = (set, withProcessors = false) => {
        if (!set) {
          return;
        }
        for (const k in set) {
          let v;
          const slots = set[k];
          const binding = withProcessors ? slots?.[0]?.template?.binding : null;
          const sourceKey = binding?.sourceKey || k;
          const processors = binding?.processors || null;
          const hasBehavior = behavior?.[sourceKey];
          if (isGranular && this._behaviorDeps && this._behaviorValues) {
            const deps = this._behaviorDeps.get(k);
            if (deps && !this._depsChanged(deps, changedKeys)) {
              v = this._behaviorValues.get(k);
              for (const slot of slots) {
                slot.render(v);
              }
              continue;
            }
          }
          if (hasBehavior) {
            if (isGranular) {
              const [trackedData, accessed] = createTrackingProxy(data);
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
          } else {
            v = resolveSourceValue(data, sourceKey);
            v = v === undefined ? undefined : expand(v);
          }
          if (withProcessors && processors?.length) {
            v = applyNamedProcessors(this, data, v, processors, sourceKey);
          }
          for (const slot of slots) {
            slot.render(v);
          }
        }
      };
      renderSet(this.out, true);
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
        if (k === "$template") {
          for (const slot of this.outAttr.$template) {
            slot.render(resolveTemplateTokens(this, slot.template.template?.tokens, data));
          }
          continue;
        }
        const slots = this.outAttr[k];
        const binding = slots?.[0]?.template.binding;
        const sourceKey = binding?.sourceKey || slots?.[0]?.template.slotName || k;
        const processors = binding?.processors;
        const hasBehavior = behavior?.[sourceKey];
        let v;
        if (hasBehavior) {
          for (const slot of slots) {
            const attrValue = slot.node.getAttribute(slot.attrName);
            v = hasBehavior(this, data, attrValue, slot.node);
            if (processors?.length) {
              v = applyNamedProcessors(this, data, v, processors, sourceKey);
            }
            slot.render(v);
          }
          continue;
        }
        v = resolveSourceValue(data, sourceKey);
        if (v !== undefined) {
          v = expand(v);
          if (processors?.length) {
            v = applyNamedProcessors(this, data, v, processors, sourceKey);
          }
        }
        for (const slot of slots) {
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
    this.syncReactiveDataSubs(data);
    this.data = data;
    return this;
  }
}
var _registry = new Map;
var _formatsVersion = 0;
var _formatsStore = Object.create(null);
var _formatsProxy = new Proxy(_formatsStore, {
  set(target2, property, value) {
    target2[property] = value;
    _formatsVersion++;
    return true;
  },
  deleteProperty(target2, property) {
    if (property in target2) {
      delete target2[property];
      _formatsVersion++;
    }
    return true;
  }
});
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
var Disconnect = Symbol.for("Disconnect");
var Adopted = Symbol.for("Adopted");
var BaseHTMLElement = globalThis.HTMLElement || class {
};
var wcToKebabCase = (value) => value.replace(/([a-z0-9])([A-Z])/g, "$1-$2").replace(/[_\s]+/g, "-").toLowerCase();
var wcToCamelCase = (value) => value.toLowerCase().replace(/-([a-z0-9])/g, (_, letter) => letter.toUpperCase());
var wcParseAttributeValue = (value) => {
  if (value === null) {
    return null;
  }
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  if (value !== "" && !Number.isNaN(Number(value))) {
    return Number(value);
  }
  return value;
};
var wcCreateAttributeBindings = (initial, options) => {
  const bindings = new Map;
  const addBinding = (attribute, key) => {
    if (!attribute || !key) {
      return;
    }
    const attr = `${attribute}`.toLowerCase();
    bindings.set(attr, key);
  };
  if (initial && typeof initial === "object") {
    for (const key in initial) {
      addBinding(key, key);
      addBinding(wcToKebabCase(key), key);
    }
  }
  if (isPlainObject2(options?.attributes)) {
    for (const attribute in options.attributes) {
      addBinding(attribute, options.attributes[attribute]);
    }
  }
  if (Array.isArray(options?.observedAttributes)) {
    for (const attribute of options.observedAttributes) {
      if (typeof attribute !== "string") {
        continue;
      }
      const key = wcToCamelCase(attribute);
      addBinding(attribute, key);
    }
  }
  return bindings;
};
var wcCollectObservedAttributes = (initial, bindings, options) => {
  const attributes = new Set;
  if (initial && typeof initial === "object") {
    for (const key in initial) {
      attributes.add(`${key}`.toLowerCase());
      attributes.add(wcToKebabCase(key));
    }
  }
  for (const key of bindings.keys()) {
    attributes.add(key);
  }
  if (Array.isArray(options?.observedAttributes)) {
    for (const attribute of options.observedAttributes) {
      if (typeof attribute === "string") {
        attributes.add(attribute.toLowerCase());
      }
    }
  }
  return [...attributes];
};
var wcAsNodes = (value, nodes = []) => {
  if (value === undefined || value === null || value === false) {
    return nodes;
  }
  if (value instanceof Node) {
    nodes.push(value);
    return nodes;
  }
  if (value instanceof NodeList || value instanceof HTMLCollection || value && typeof value === "object" && typeof value.length === "number" && value.length >= 0 && value.length % 1 === 0) {
    for (let i = 0;i < value.length; i++) {
      wcAsNodes(value[i], nodes);
    }
    return nodes;
  }
  if (Array.isArray(value)) {
    for (let i = 0;i < value.length; i++) {
      wcAsNodes(value[i], nodes);
    }
    return nodes;
  }
  nodes.push(document.createTextNode(asText(value)));
  return nodes;
};

class UIWebComponent extends BaseHTMLElement {
  constructor(componentFactory, initial = {}, attributeBindings = new Map, options = {}) {
    super();
    const useShadow = options.shadow !== false;
    const shadowMode = options.shadowMode || "open";
    this.root = useShadow && typeof this.attachShadow === "function" ? this.shadowRoot || this.attachShadow({ mode: shadowMode }) : this;
    this.componentFactory = componentFactory;
    this.attributeBindings = attributeBindings;
    this.options = options;
    this.instance = undefined;
    this.nodes = [];
    this.isInitialized = false;
    this.data = {
      ...initial && typeof initial === "object" ? initial : {}
    };
  }
  readAttributes() {
    const data = {};
    for (const attribute of this.attributes) {
      const name = attribute.name.toLowerCase();
      const key = this.attributeBindings.get(name) || wcToCamelCase(name);
      data[key] = wcParseAttributeValue(attribute.value);
    }
    return data;
  }
  _clearPureNodes() {
    if (!this.nodes || this.nodes.length === 0) {
      return;
    }
    for (let i = 0;i < this.nodes.length; i++) {
      this.nodes[i].parentNode?.removeChild(this.nodes[i]);
    }
    this.nodes = [];
  }
  _renderUIComponent() {
    if (!this.instance) {
      this.instance = this.componentFactory.new();
      this.instance.set(this.data).mount(this.root);
    } else {
      this.instance.update(this.data);
    }
  }
  _renderPureComponent() {
    if (this.instance) {
      this.instance.unmount();
      this.instance = undefined;
    }
    this._clearPureNodes();
    const output = this.componentFactory(this.data, this);
    const nodes = wcAsNodes(output);
    for (let i = 0;i < nodes.length; i++) {
      this.root.appendChild(nodes[i]);
    }
    this.nodes = nodes;
  }
  render() {
    if (this.componentFactory?.isTemplate && this.componentFactory?.new) {
      this._renderUIComponent();
    } else if (typeof this.componentFactory === "function") {
      this._renderPureComponent();
    } else {
      logSelectUI("error", "UIWebComponent", "invalid component factory", {
        componentFactory: this.componentFactory,
        host: this
      });
    }
  }
  applyData(data) {
    if (!data || typeof data !== "object") {
      return;
    }
    this.data = Object.assign({}, this.data, data);
    if (this.isInitialized) {
      this.render();
    }
  }
  connectedCallback() {
    if (!this.isInitialized) {
      this.applyData(this.readAttributes());
      this.isInitialized = true;
      this.render();
      return;
    }
    this.applyData(this.readAttributes());
  }
  disconnectedCallback() {
    this.trigger(Disconnect);
    if (this.instance) {
      this.instance.unmount();
      this.instance = undefined;
    }
    this._clearPureNodes();
    this.isInitialized = false;
  }
  adoptedCallback() {
    this.trigger(Adopted);
  }
  attributeChangedCallback(name, previous, current) {
    if (previous === current) {
      return;
    }
    const normalized = `${name}`.toLowerCase();
    const key = this.attributeBindings.get(normalized) || wcToCamelCase(normalized);
    this.applyData({ [key]: wcParseAttributeValue(current) });
    this.trigger(name, previous, current);
  }
  trigger(name, previous, current) {
    if (typeof name === "symbol") {
      return;
    }
    this.dispatchEvent(new CustomEvent(`wc:${name}`, {
      detail: {
        name,
        previous,
        current
      }
    }));
  }
}
var webcomponent = (name, componentFactory, initial = undefined, options = undefined) => {
  const registry = globalThis.customElements;
  if (!registry) {
    return null;
  }
  const existing = registry.get(name);
  if (existing) {
    return existing;
  }
  const initialData = initial && typeof initial === "object" ? { ...initial } : {};
  const attributeBindings = wcCreateAttributeBindings(initialData, options);
  const observedAttributes = wcCollectObservedAttributes(initialData, attributeBindings, options);
  const WebComponent = class extends UIWebComponent {
    static observedAttributes = observedAttributes;
    constructor() {
      super(componentFactory, initialData, attributeBindings, options || {});
    }
  };
  registry.define(name, WebComponent);
  return WebComponent;
};
var ui = (selection, scope = document) => {
  if (selection === null || selection === undefined) {
    throw new Error(`ui() received ${selection === null ? "null" : "undefined"} as selection. ` + `Expected a CSS selector string, an HTML string starting with "<", ` + `a DOM Node, or an array of DOM Nodes. ` + `Example: ui("#container") or ui("<div>Hello</div>")`);
  }
  if (typeof selection === "string") {
    let nodes = [];
    let autoFormatName = null;
    const templateRegistry = templateRegistryFor(scope);
    if (/^\s*</.test(selection)) {
      const doc = parser.parseFromString(selection, "text/html");
      pruneTemplateWhitespace(doc.body);
      nodes = [...doc.body.childNodes];
      if (nodes.length === 1) {
        autoFormatName = templateFormatterName(nodes[0]);
      }
      registerTemplatesInNodes(nodes, templateRegistry, scope);
    } else {
      const template = templateRegistry.get(templateKey(selection));
      if (template) {
        nodes = [...template.content.childNodes];
        autoFormatName = templateFormatterName(template);
      } else {
        let matchedTemplateCount = 0;
        let matchedTemplateName = null;
        const parent = scope?.querySelectorAll ? scope : document;
        for (const node of parent.querySelectorAll(selection)) {
          if (node.nodeName === "TEMPLATE") {
            matchedTemplateCount += 1;
            matchedTemplateName = templateFormatterName(node);
            registerTemplateNode(node, templateRegistry, scope);
            nodes = [...nodes, ...node.content.childNodes];
          } else {
            nodes.push(node);
          }
        }
        if (matchedTemplateCount === 1) {
          autoFormatName = matchedTemplateName;
        }
        registerTemplatesInNodes(nodes, templateRegistry, scope);
      }
    }
    if (nodes.length === 0) {
      logSelectUI("warn", "ui", "selector did not match any elements", {
        selector: selection,
        scope
      });
    }
    const component = createComponent(new UITemplate(nodes, scope));
    if (autoFormatName) {
      ui.format(autoFormatName, component);
    }
    return component;
  }
  if (selection instanceof Node || Array.isArray(selection)) {
    const nodes = selection instanceof Node ? [selection] : selection;
    let autoFormatName = null;
    if (nodes.length === 1) {
      autoFormatName = templateFormatterName(nodes[0]);
    }
    registerTemplatesInNodes(nodes, templateRegistryFor(scope), scope);
    const component = createComponent(new UITemplate([...nodes], scope));
    if (autoFormatName) {
      ui.format(autoFormatName, component);
    }
    return component;
  }
  throw new Error(`ui() received an invalid selection type: ${typeof selection}. ` + `Expected a string (CSS selector or HTML), a DOM Node, or an array of DOM Nodes. ` + `Received: ${selection}`);
};
ui.formats = _formatsProxy;
ui.format = (name, formatter) => {
  if (typeof name !== "string" || !name.trim()) {
    logSelectUI("error", "ui.formats", "invalid formatter name", {
      name,
      formatter
    });
    return ui;
  }
  ui.formats[name.trim()] = formatter;
  return ui;
};
ui.unformat = (name) => {
  if (typeof name === "string" && name.trim()) {
    delete ui.formats[name.trim()];
  }
  return ui;
};
ui.resolveFormat = (name) => {
  if (typeof name !== "string") {
    return;
  }
  return ui.formats[name.trim()];
};
ui.register = (name, component) => {
  _registry.set(name, component);
  return ui;
};
ui.resolve = (name) => _registry.get(name);
var select_ui_default = ui;
export {
  webcomponent,
  walk,
  unique,
  unbind,
  select_ui_default as ui,
  type,
  toggle,
  target,
  sorted,
  selected,
  select_default as select,
  router,
  routed,
  route,
  remove,
  remap,
  raf,
  query,
  predicate,
  next,
  match,
  loadIcons,
  loadIcon,
  list,
  len,
  lazy,
  itemkey,
  install,
  select_icons_default as icons,
  icon,
  iclsx,
  has,
  find,
  select_fastdom_default as fastdom,
  extractor,
  select_extra_default as extra,
  expand,
  dragtarget,
  drag,
  derived,
  deferred,
  cmp,
  clsx,
  select_cells_default as cells,
  cell,
  browser,
  bool,
  bind,
  autoresize,
  assign,
  add,
  access,
  UIWebComponent,
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
  Router,
  Reactive,
  Keyboard,
  IconsContainer,
  IconSources,
  FastDOM,
  Dynamic,
  Disconnect,
  Derivation,
  Deferred,
  Cell,
  Cache,
  AppliedUITemplate,
  Adopted,
  $
};
