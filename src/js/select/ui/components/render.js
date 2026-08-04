// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-08-03

// Module: select/ui/components/render
// Data set/update and render pipeline for UIInstance.

import { asText, eq } from "../../utils/index.js"
import { log, TemplateParser } from "../templates.js"
import {
	applyNamedProcessors,
	createTrackingProxy,
	finalizeRenderProcessorValue,
	formatBindingSource,
	hasTrackedNonReactiveObjectDeps,
	isThenable,
	resolveBindingValue,
	resolveExpandedSourceValue,
	resolveRenderableValue,
	resolveSourceValue,
	resolveTemplateTokens,
	runWithUIInstance,
	scheduleRenderTask,
	setNodeText,
	snapshotReactiveDependencyRevisions,
} from "./runtime.js"
import { isReactiveData, renderViewData } from "./reactive.js"

// Function: attachRender
// Installs set/update/render methods on `UIInstance`.
function attachRender(UIInstance) {
	Object.assign(UIInstance.prototype, {
		_getRenderer() {
			if (!this._renderer) {
				this._renderer = () => this._scheduleRender();
			}
			return this._renderer;
		},

		
		_scheduleRender(changedKeys = null) {
			if (this._renderQueued || this._isDisposed) {
				if (changedKeys?.size) {
					if (!this._pendingChangedKeys) this._pendingChangedKeys = new Set();
					for (const key of changedKeys) {
						this._pendingChangedKeys.add(key);
					}
				}
				return;
			}
			if (changedKeys?.size) {
				this._pendingChangedKeys = new Set(changedKeys);
			}
			this._renderQueued = true;
			scheduleRenderTask(() => {
				const pendingChangedKeys = this._pendingChangedKeys;
				this._pendingChangedKeys = undefined;
				this._renderQueued = false;
				if (!this._isDisposed) {
					this.render(this.data, pendingChangedKeys ?? null);
				}
			});
		},

		set(data, key = this.key) {
			this.key = key;
			if (isReactiveData(data)) {
				this.render(data);
				return this;
			}
			if (
				this.initial &&
				data !== null &&
				data !== undefined &&
				typeof data === "object" &&
				Object.getPrototypeOf(data) === Object.prototype
			) {
				this.render(UIInstance._mergeReactiveTopLevel(this, this.initial, data));
			} else {
				this.render(data);
			}
			return this;
		},

		
		// Updates data with granular change detection. Only re-renders changed fields
		// when possible. Handles reactive cell subscription management.
		//
		// Store mode (`this.data` is a cell): plain `data` is reconciled into the
		// store (`reconcile` when available, else `set`). UI updates via cell subs.
		// Passing another cell rebinds the instance to that store.
		update(data, force = false) {
			if (isReactiveData(this.data)) {
				if (isReactiveData(data)) {
					if (force || data !== this.data) {
						this.render(data);
					}
					return this;
				}
				if (typeof this.data.reconcile === "function") {
					this.data.reconcile(data);
				} else if (typeof this.data.set === "function") {
					this.data.set(data);
				}
				if (force) {
					this.render(this.data);
				}
				return this;
			}
			if (data === undefined || data === null) {
				if (force || this.data !== data) {
					this.render(data);
				}
				return this;
			}
			if (isReactiveData(data)) {
				this.render(data);
				return this;
			}
			if (typeof data !== "object") {
				if (force || !eq(this.data, data)) {
					this.render(data);
				}
				return this;
			}
			// Fast-path: if the entire subtree data is deeply equal to what we
			// already rendered, skip render and changed-key computation. This
			// dramatically reduces work for sibling list items when only one
			// entry mutates (common in the inspector benchmark content phase).
			//
			// Note: we intentionally do *not* have a `data === this.data` bail here.
			// List reuse via Component.map with stable keys keeps the same data bag
			// object for a row while mutating fields inside (e.g. .value). The eq
			// scan below will cheaply detect "no change" for stable rows, and will
			// detect the changed field for the touched row so its behaviors re-run.
			if (!force && this.data && eq(this.data, data)) {
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
					if (Object.is(existing, updated)) {
						continue;
					}
					// Type/shape change (scalar↔object↔array): skip deep eq.
					const exArr = Array.isArray(existing);
					const upArr = Array.isArray(updated);
					if (
						exArr !== upArr ||
						(existing === null) !== (updated === null) ||
						typeof existing !== typeof updated
					) {
						same = false;
						if (!changedKeys) {
							changedKeys = new Set();
						}
						changedKeys.add(k);
						continue;
					}
					if (!eq(existing, updated)) {
						same = false;
						if (!changedKeys) {
							changedKeys = new Set();
						}
						changedKeys.add(k);
					}
				}
			}
			if (!same) {
				const merged =
					this.data && typeof this.data === "object"
						? UIInstance._mergeReactiveTopLevel(this, this.data, data)
						: data;
				this.render(merged, changedKeys);
			}
			return this;
		},

		
		// Tests if any of `deps` changed in `changedKeys`.
		_depsChanged(deps, changedKeys) {
			for (const key of deps) {
				if (changedKeys.has(key)) {
					return true;
				}
			}
			return false;
		},

		
		// Direct update for simple out= bindings on scalar path notify (skips full render + schedule).
		// Only for keys without behavior (behaviors may have logic/side effects).
		_tryDirectOutUpdate(key, val) {
			if (this._isDisposed || key == null) return false;
			const hasBehavior = this.template?.behavior?.[key];
			if (hasBehavior) return false;
			const slots = this.out?.[key];
			if (!slots?.length) return false;
			for (let i = 0; i < slots.length; i++) {
				const slot = slots[i];
				if (slot.predicateSlot?.node.parentNode === null) continue;
				slot.render(val);
			}
			return true;
		},

		
		_reactiveDepsChanged(depRevisions, data) {
			if (!depRevisions || depRevisions.size === 0 || !data) {
				return false;
			}
			for (const [key, revision] of depRevisions.entries()) {
				const value = data[key];
				// If the dependency stopped being reactive (or has no revision),
				// invalidate so we don't reuse behavior values computed from an
				// incompatible dependency shape.
				if (value?.isReactive !== true || !Number.isFinite(value.revision)) {
					return true;
				}
				// Guard against stale behavior cache when nested reactive updates
				// occur without changing parent plain-object keys.
				if (value.revision !== revision) {
					return true;
				}
			}
			return false;
		},

		
		_trackAsyncBehaviorValue(key, value, onResolved) {
			if (!isThenable(value)) {
				return false;
			}
			this._asyncBehaviorTokens = this._asyncBehaviorTokens ?? new Map();
			const token = (this._asyncBehaviorTokens.get(key) || 0) + 1;
			this._asyncBehaviorTokens.set(key, token);
			value.then(
				(resolved) => {
					if (this._isDisposed || this._asyncBehaviorTokens.get(key) !== token) {
						return;
					}
					onResolved(resolved);
				},
				() => undefined,
			);
			return true;
		},

		
		_applyEagerBehaviorResult(entryKey, result, data) {
			if (result === undefined) {
				return data;
			}
			const stateKey = entryKey.endsWith("!") ? entryKey.slice(0, -1) : entryKey;
			if (!stateKey) {
				return data;
			}
			const target = data?.[stateKey];
			if (target?.isReactive) {
				target.set(result);
				return data;
			}
			if (!data || typeof data !== "object") {
				return data;
			}
			// Avoid mutating caller-owned plain object payloads in place.
			return { ...data, [stateKey]: result };
		},

		
		_runEagerBehaviors(data) {
			const behavior = this.template.behavior;
			if (!behavior) {
				return data;
			}
			return runWithUIInstance(this, () => {
				let nextData = data;
				for (const key in behavior) {
					if (!key.endsWith("!")) {
						continue;
					}
					const result = behavior[key](this, nextData, null);
					nextData = this._applyEagerBehaviorResult(key, result, nextData);
				}
				return nextData;
			});
		},

		
		
		render(data = this.data, changedKeys = null) {
			if (!this.template) {
				log.error(
					"UIInstance.render: called on instance with undefined template, details",
					{ instance: this },
				);
				return this;
			}
			// Keep store cell identity on `this.data`; behaviors see unwrapped view.
			const storeData = data;
			// Rebinding to a different root store: drop mounted collections so
			// stable $key wrappers from the previous store cannot pin stale rows.
			if (
				isReactiveData(storeData) &&
				isReactiveData(this.data) &&
				storeData !== this.data &&
				this.out
			) {
				for (const slotKey in this.out) {
					const group = this.out[slotKey];
					for (let i = 0; i < group.length; i++) {
						group[i]._clearMapped?.();
					}
				}
			}
			data = this._runEagerBehaviors(data);
			const renderData = renderViewData(data);
			// Granular skips use behavior deps tracked on the render view (unwrapped
			// store tree or plain bag). Works for bag cells and root-store path misses
			// that schedule a top-level tree key.
			const isGranular =
				changedKeys !== null &&
				changedKeys.size > 0;
			if (this.when) {
				for (const k in this.when) {
					for (const slot of this.when[k]) {
						if (slot.template.predicate(this, renderData)) {
							slot.show();
						} else {
							slot.hide();
						}
					}
				}
			}
			// Pure text roots (no element nodes, no data bindings): project data as text.
			const hasDataBindings = !!(
				this.template.out ||
				this.template.inout ||
				this.template.in ||
				this.template.outAttr
			);
			if (!hasDataBindings) {
				let hasElementNode = false;
				for (const node of this.nodes) {
					if (node.nodeType === Node.ELEMENT_NODE) {
						hasElementNode = true;
						break;
					}
				}
				if (!hasElementNode) {
					const text = asText(renderData);
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
						const templateTokens = withProcessors
							? slots?.[0]?.template?.template?.tokens
							: null;
						if (templateTokens) {
							const resolvedTemplate = resolveTemplateTokens(
								this,
								templateTokens,
								renderData,
							);
							for (const slot of slots) {
								slot.render(resolvedTemplate);
							}
							continue;
						}
						const binding = withProcessors ? slots?.[0]?.template?.binding : null;
						const sourceKey = formatBindingSource(binding) || k;
						const processors = binding?.processors || null;
						const hasBehavior = behavior?.[sourceKey];
		
						if (isGranular && this._behaviorDeps && this._behaviorValues) {
							const deps = this._behaviorDeps.get(k);
							const depRevisions = this._behaviorDepRevisions?.get(k);
							if (
								deps &&
								!this._depsChanged(deps, changedKeys) &&
								!this._reactiveDepsChanged(depRevisions, renderData) &&
								!hasTrackedNonReactiveObjectDeps(renderData, deps)
							) {
								v = this._behaviorValues.get(k);
								if (v === undefined && binding?.defaultValue !== undefined)
									v = binding.defaultValue;
								if (withProcessors && processors?.length) {
									const processed = applyNamedProcessors(
										this,
										renderData,
										v,
										processors,
										sourceKey,
										{ withMeta: true },
									);
									v = finalizeRenderProcessorValue(
										processed.value,
										processed.lastProcessorType,
									);
								}
								for (const slot of slots) {
									if (slot.predicateSlot?.node.parentNode === null) continue;
									slot.render(v);
								}
								continue;
							}
						}
		
						// Behavior handlers: track plain-object deps on first run so later
						// granular updates can reuse cached results (shallow proxy).
						if (hasBehavior) {
							const canTrack =
								renderData !== null &&
								typeof renderData === "object" &&
								Object.getPrototypeOf(renderData) === Object.prototype;
							const haveDeps = this._behaviorDeps?.has(k);
							if (canTrack && !haveDeps) {
								const [trackedData, accessed] = createTrackingProxy(renderData);
								v = runWithUIInstance(this, () =>
									hasBehavior(this, trackedData, null),
								);
								if (!this._behaviorDeps) {
									this._behaviorDeps = new Map();
								}
								this._behaviorDeps.set(k, accessed);
								if (!this._behaviorValues) {
									this._behaviorValues = new Map();
								}
								this._behaviorValues.set(k, v);
								if (!this._behaviorDepRevisions) {
									this._behaviorDepRevisions = new Map();
								}
								this._behaviorDepRevisions.set(
									k,
									snapshotReactiveDependencyRevisions(renderData, accessed),
								);
							} else {
								v = runWithUIInstance(this, () =>
									hasBehavior(this, renderData, null),
								);
								// Keep granular cache in sync when a tracked behavior re-runs.
								if (haveDeps) {
									if (!this._behaviorValues) {
										this._behaviorValues = new Map();
									}
									this._behaviorValues.set(k, v);
									const deps = this._behaviorDeps.get(k);
									if (deps) {
										if (!this._behaviorDepRevisions) {
											this._behaviorDepRevisions = new Map();
										}
										this._behaviorDepRevisions.set(
											k,
											snapshotReactiveDependencyRevisions(renderData, deps),
										);
									}
								}
							}
						} else {
							v = binding
								? resolveBindingValue(
										renderData,
										binding,
										!processors?.length,
										this,
									)
								: processors?.length
									? resolveSourceValue(renderData, sourceKey, this)
									: resolveExpandedSourceValue(renderData, sourceKey, this);
						}
						if (v === undefined && binding?.defaultValue !== undefined)
							v = binding.defaultValue;
		
						if (
							hasBehavior &&
							this._trackAsyncBehaviorValue(k, v, (resolved) => {
								let next = resolved;
								if (withProcessors && processors?.length) {
									const processed = applyNamedProcessors(
										this,
										renderData,
										next,
										processors,
										sourceKey,
										{ withMeta: true },
									);
									next = finalizeRenderProcessorValue(
										processed.value,
										processed.lastProcessorType,
									);
								}
								for (const slot of slots) {
									if (slot.predicateSlot?.node.parentNode === null) continue;
									slot.render(next);
								}
							})
						) {
							continue;
						}
						if (withProcessors && processors?.length) {
							const processed = applyNamedProcessors(
								this,
								renderData,
								v,
								processors,
								sourceKey,
								{ withMeta: true },
							);
							v = finalizeRenderProcessorValue(
								processed.value,
								processed.lastProcessorType,
							);
						}
						for (const slot of slots) {
							if (slot.predicateSlot?.node.parentNode === null) continue;
							slot.render(v);
						}
					}
				};
		
				renderSet(this.out, true);
				renderSet(this.inout);
				renderSet(this.in);
				if (this.outAttr) {
					for (const k in this.outAttr) {
						if (k === "$template") {
							for (const slot of this.outAttr.$template) {
								slot.render(
									resolveTemplateTokens(
										this,
										slot.template.template?.tokens,
										renderData,
									),
								);
							}
							continue;
						}
						const slots = this.outAttr[k];
						const binding = slots?.[0]?.template.binding;
						const mode = slots?.[0]?.template.mode;
						const operator = slots?.[0]?.template.operator;
						const comparisonValue = slots?.[0]?.template.value;
						const sourceKey =
							formatBindingSource(binding) || slots?.[0]?.template.slotName || k;
						const processors = binding?.processors;
						const hasBehavior = behavior?.[sourceKey];
						const finalizeOutAttrValue = (value) => {
							let next = value;
							if (next === undefined && binding?.defaultValue !== undefined) {
								next = binding.defaultValue;
							}
							if (processors?.length) {
								const processed = applyNamedProcessors(
									this,
									renderData,
									next,
									processors,
									sourceKey,
									{ withMeta: true },
								);
								next = finalizeRenderProcessorValue(
									processed.value,
									processed.lastProcessorType,
								);
							} else if (next !== undefined) {
								next = resolveRenderableValue(next);
							}
							return mode === "comparison"
								? TemplateParser.EvaluateWhenComparison(
										next,
										operator,
										comparisonValue,
									)
								: next;
						};
						let v;
						if (hasBehavior) {
							for (const slot of slots) {
								const attrValue = slot.node.getAttribute(slot.attrName);
								v = runWithUIInstance(this, () =>
									hasBehavior(this, renderData, attrValue, slot.node),
								);
								if (
									this._trackAsyncBehaviorValue(
										`${k}:${slot.attrName}`,
										v,
										(resolved) => {
											slot.render(finalizeOutAttrValue(resolved));
										},
									)
								) {
									continue;
								}
								slot.render(finalizeOutAttrValue(v));
							}
							continue;
						}
						v = binding
							? resolveBindingValue(renderData, binding, false, this)
							: resolveSourceValue(renderData, sourceKey, this);
						v = finalizeOutAttrValue(v);
						for (const slot of slots) {
							slot.render(v);
						}
					}
				}
				if (this.slots?.length) {
					const view = renderViewData(data);
					for (const slot of this.slots) {
						const content = view?.slots?.[slot.name];
						slot.mount(content);
					}
				}
			}
			this.syncReactiveDataSubs(data);
			this.data = data;
			this._hasRendered = true;
			return this;
		}
	})
}

export { attachRender }

// EOF
