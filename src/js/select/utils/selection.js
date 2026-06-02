// Project: Select.js
// Author:  Sebastien Pierre
// License: MIT
// Created: 2026-06-02

// Module: select/utils/selection
// Selection helpers for item lookup, membership, mutation, and circular
// navigation.

// ----------------------------------------------------------------------------
//
// NORMALIZATION
//
// ----------------------------------------------------------------------------

// Function: itemkey
// Resolves a stable key from common item fields (`id`, `key`, `name`).
function itemkey(item) {
	return item?.id ?? item?.key ?? item?.name ?? item;
}

// Function: items
// Normalizes `items` by wrapping primitive values into `{ label, value }`.
function items(items) {
	if (!items) {
		return [];
	}
	let res;
	for (let i = 0; i < items.length; i++) {
		const v = items[i];
		if (v?.constructor !== Object || v?.label === undefined) {
			res = res ?? [];
			for (let j = res.length; j < i; j++) {
				res.push(items[j]);
			}
			res.push({ label: `${v}`, value: v });
		}
	}
	return res ?? items;
}

// ----------------------------------------------------------------------------
//
// MEMBERSHIP
//
// ----------------------------------------------------------------------------

// Function: index
// Returns the index of `item` in `items` using `key` matching when provided.
function index(items, item, key = itemkey) {
	if (!items) {
		return -1;
	}
	if (key === null) {
		return items.indexOf(item);
	}
	const target = key(item);
	for (let i = 0; i < items.length; i++) {
		if (key(items[i], i) === target) {
			return i;
		}
	}
	return -1;
}

// Function: find
// Alias to `index` using `key` extraction.
function find(items, item, key = itemkey) {
	return index(items, item, key);
}

// Function: has
// Returns true when `item` exists in `items`.
function has(items, item, key = itemkey) {
	return find(items, item, key) >= 0;
}

// Function: add
// Adds `item` to `items` if not already present.
function add(items, item, key = itemkey) {
	if (!items) {
		return [item];
	}
	return find(items, item, key) === -1 ? [...items, item] : items;
}

// Function: remove
// Removes `item` from `items` when present.
function remove(items, item, key = itemkey) {
	if (!items) {
		return items;
	}
	const i = find(items, item, key);
	if (i < 0) {
		return items;
	}
	const res = [...items];
	res.splice(i, 1);
	return res;
}

// Function: toggle
// Toggles membership of `item` in `items`.
function toggle(items, item, key = itemkey) {
	return has(items, item, key)
		? remove(items, item, key)
		: add(items, item, key);
}

// ----------------------------------------------------------------------------
//
// NAVIGATION
//
// ----------------------------------------------------------------------------

// Function: next
// Returns next wrapped index from `index` by `delta`.
function next(items, index, delta = 1) {
	return wrapindex(items, index, delta);
}

// Function: wrapindex
// Wraps index arithmetic over `itemsOrLength` with circular behavior.
function wrapindex(itemsOrLength, i, delta = 1) {
	const n =
		typeof itemsOrLength === "number"
			? itemsOrLength
			: (itemsOrLength?.length ?? 0);
	if (n <= 0) {
		return 0;
	}
	return (((i + delta) % n) + n) % n;
}

const sel = {
	add,
	find,
	has,
	index,
	itemkey,
	items,
	next,
	remove,
	toggle,
	wrapindex,
}

export {
	add,
	find,
	has,
	index,
	itemkey,
	items,
	next,
	remove,
	sel,
	toggle,
	wrapindex,
}

export default sel

// EOF
