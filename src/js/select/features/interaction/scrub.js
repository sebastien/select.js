// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-11-23

// Module: select/features/interaction/scrub
// Scrubbing turns a number field into a horizontal slider: pressing the field
// and dragging sideways changes its value, while a plain click still focuses
// it for typing. A single delegated `pointerdown` listener serves every
// matching field under a root, so fields can come and go freely.
//
// The value follows the pointer by one `step` every `pixels` CSS pixels,
// stays within `min` and `max`, and lands on the step grid. Shift scrubs ten
// times faster and Alt ten times finer. Fields receive `input` events while
// scrubbing and one `change` event on release; Escape restores the value from
// the press. Styling (cursor, touch action, the `active` state) belongs to the
// stylesheet.
//
// ```javascript
// const stop = scrub(document);
// stop();
// ```

// Function: scrub
// Lets the fields matching `options.selector` inside `root` be changed by
// dragging sideways, and returns a function that removes the listener.
//
// - selector: string - fields that scrub, `"input.scrub"` by default
// - pixels: number - pointer travel in CSS pixels per `step`, `1` by default;
//   a field's `data-scrub-pixels` attribute overrides it
// - threshold: number - horizontal travel in pixels before a press becomes a
//   scrub, `3` by default; shorter presses are clicks that focus the field
// - start: function - `(input) => number`, the value to scrub from when the
//   field is empty or not a number; defaults to `min`, or `0`
//
// Focused, disabled and read-only fields are left alone, so typing, caret
// placement and text selection keep working.
//
// Example:
// ```javascript
// const stop = scrub(panel, { pixels: 4, start: (input) => measure(input) });
// ```
function scrub(root = globalThis.document, options = {}) {
	const selector = options.selector ?? "input.scrub";
	const onPointerDown = (event) => {
		if (event.isPrimary === false || event.button !== 0) return;
		const input = event.target?.closest?.(selector);
		if (!input || !root.contains(input)) return;
		if (input.disabled || input.readOnly) return;
		const scope = input.getRootNode?.() ?? input.ownerDocument;
		if (scope.activeElement === input) return;
		gesture(input, event, options);
	};
	root?.addEventListener("pointerdown", onPointerDown);
	return () => root?.removeEventListener("pointerdown", onPointerDown);
}

// ============================================================================
// INTERNALS
// ============================================================================

// Function: gesture
// Tracks the press `event` on `input` until it is released or cancelled.
function gesture(input, event, options) {
	const doc = input.ownerDocument;
	const id = event.pointerId;
	const step = positive(input.getAttribute("step"), 1);
	const min = number(input.getAttribute("min"), -Infinity);
	const max = number(input.getAttribute("max"), Infinity);
	const base = Number.isFinite(min) ? min : 0;
	const digits = Math.max(decimals(step), decimals(base));
	const pixels = positive(
		input.getAttribute("data-scrub-pixels"),
		positive(options.pixels, 1),
	);
	const threshold = options.threshold ?? 3;
	const initial = input.value;
	let raw = number(initial, Number.NaN);
	if (Number.isNaN(raw)) raw = number(options.start?.(input), base);
	raw = Math.min(max, Math.max(min, raw));
	let x = event.clientX;
	let active = false;

	// The shown value sits on the step grid, at most `max`, without float noise.
	const snap = (value) => {
		const v = fixed(base + Math.round((value - base) / step) * step, digits);
		return v > max ? fixed(v - step, digits) : v;
	};
	const end = () => {
		input.classList.remove("active");
		if (input.hasPointerCapture?.(id)) input.releasePointerCapture(id);
		listen(doc, handlers, false);
	};
	const cancel = () => {
		end();
		if (input.value === initial) return;
		input.value = initial;
		emit(input, "input");
	};
	const handlers = {
		pointermove: (ev) => {
			if (ev.pointerId !== id) return;
			const dx = ev.clientX - x;
			if (!active) {
				// Travel below the threshold still counts once the scrub starts,
				// so the value follows the pointer from the press.
				if (Math.abs(dx) <= threshold) return;
				active = true;
				input.classList.add("active");
			}
			x = ev.clientX;
			const factor = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1;
			raw = Math.min(max, Math.max(min, raw + (dx / pixels) * step * factor));
			const text = `${snap(raw)}`;
			if (text === input.value) return;
			input.value = text;
			emit(input, "input");
		},
		pointerup: (ev) => {
			if (ev.pointerId !== id) return;
			end();
			if (!active) {
				input.focus();
				input.select?.();
			} else if (input.value !== initial) {
				emit(input, "change");
			}
		},
		pointercancel: (ev) => {
			if (ev.pointerId === id) cancel();
		},
		keydown: (ev) => {
			if (ev.key !== "Escape") return;
			// The press owns Escape: it cancels the scrub, not an enclosing popup.
			ev.preventDefault();
			ev.stopPropagation();
			cancel();
		},
	};

	event.preventDefault();
	try {
		input.setPointerCapture?.(id);
	} catch {
		// Synthetic or already released pointers cannot be captured.
	}
	listen(doc, handlers, true);
}

// Function: listen
// Adds or removes `handlers` on `node` in the capture phase, so the gesture
// sees its events even when the page stops their propagation.
function listen(node, handlers, enabled) {
	for (const [name, handler] of Object.entries(handlers)) {
		if (enabled) node.addEventListener(name, handler, true);
		else node.removeEventListener(name, handler, true);
	}
}

// Function: emit
// Dispatches a bubbling `type` event on `input`, created in its own window.
function emit(input, type) {
	const view = input.ownerDocument?.defaultView ?? globalThis;
	input.dispatchEvent(new view.Event(type, { bubbles: true }));
}

// Function: number
// Parses `value` as a finite number, returning `fallback` otherwise.
function number(value, fallback) {
	if (value == null || `${value}`.trim() === "") return fallback;
	const v = Number(value);
	return Number.isFinite(v) ? v : fallback;
}

// Function: positive
// Parses `value` as a number greater than zero, returning `fallback` otherwise.
function positive(value, fallback) {
	const v = number(value, fallback);
	return v > 0 ? v : fallback;
}

// Function: decimals
// Returns the number of decimal places in `value`, exponent notation included.
function decimals(value) {
	const [mantissa, exponent] = `${value}`.split("e");
	const places = mantissa.split(".")[1]?.length ?? 0;
	return Math.max(0, places - Number(exponent ?? 0));
}

// Function: fixed
// Rounds `value` to `digits` decimal places.
function fixed(value, digits) {
	return Number(value.toFixed(digits));
}

export { scrub };
export default scrub;

// EOF
