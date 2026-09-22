// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-09-23
// Updated: 2026-09-23

// Module: select/features/icons.catalog
// Curated, resilient icon catalog plus cross-preset name resolution.
//
// Iconify is the tool used to *find* icons, but downloading a collection JSON
// is far too heavy to ship. Instead this module keeps a small curated set of
// canonical icon names and a compact alias table for the cases where a preset
// cannot derive the right filename with its transform alone.
//
// `IconCatalog` lists the canonical (kebab-case) names, grouped by category.
// `IconAliases` maps a canonical name to the name a given preset expects, only
// for the pairs where they differ. `IconUnavailable` records the pairs that
// have no upstream equivalent, so tooling can show them as "n/a" instead of a
// false gap.
//
// Example:
// ```javascript
// import { resolveIconName, isIconAvailable } from "@select/features/icons.catalog.js"
//
// resolveIconName("close", "lucide")       // "x"
// resolveIconName("close", "tabler")       // "x"
// resolveIconName("close", "radix-icons")  // "cross-2"
// isIconAvailable("folder", "radix-icons") // false
// ```

// Constant: IconPresets
// Built-in preset labels, in display order.
const IconPresets = {
	lucide: "Lucide",
	iconoir: "Iconoir",
	eva: "Eva",
	tabler: "Tabler",
	mdi: "Material Design Icons",
	"material-symbols": "Material Symbols",
	"material-symbols-rounded": "Material Symbols Rounded",
	"material-symbols-sharp": "Material Symbols Sharp",
	"material-symbols-light": "Material Symbols Light",
	"material-icons": "Material Icons",
	"radix-icons": "Radix Icons",
	ix: "Siemens iX",
};

// Constant: IconCatalog
// Curated canonical icon names, grouped by category. Each name is the shared
// spelling; `IconAliases` resolves it per preset.
const IconCatalog = {
	navigation: [
		"home",
		"search",
		"menu",
		"more-horizontal",
		"arrow-left",
		"arrow-right",
		"arrow-up",
		"arrow-down",
		"arrow-back",
		"chevron-left",
		"chevron-right",
		"chevron-down",
		"chevron-up",
	],
	actions: [
		"check",
		"close",
		"plus",
		"minus",
		"edit",
		"trash",
		"copy",
		"share",
		"link",
		"download",
		"upload",
		"refresh",
		"filter",
		"send",
		"delete-sweep",
		"edit-note",
		"play",
		"stop",
		"record",
		"drag-gripper",
	],
	status: ["info", "alert-triangle", "check-circle"],
	// Tools and controls used by the UIA inspector shell.
	tools: [
		"cursor",
		"button",
		"select",
		"paragraph",
		"list",
		"component",
		"paint-roller",
		"remote",
		"note",
		"chat",
		"comment",
		"add-comment",
	],
	objects: [
		"calendar",
		"clock",
		"mail",
		"bell",
		"file",
		"folder",
		"image",
		"lock",
		"eye",
		"sun",
		"moon",
		"camera",
		"music",
		"code",
		"phone",
		"globe",
		"map-pin",
	],
	people: ["person", "heart", "star", "bookmark"],
};

// Constant: IconAliases
// Per-preset overrides: canonical name -> preset name, only where the preset
// transform cannot derive it. Values stay kebab-case; the preset transform
// still handles separators and style folders.
const IconAliases = {
	lucide: {
		person: "user",
		close: "x",
		refresh: "refresh-cw",
		chat: "message-circle",
		note: "notebook-pen",
		record: "circle-dot",
		remote: "settings-2",
		cursor: "mouse-pointer-2",
		button: "mouse-pointer-click",
		paragraph: "pilcrow",
		select: "chevrons-up-down",
		"edit-note": "square-pen",
		"delete-sweep": "list-x",
		"drag-gripper": "grip-vertical",
		stop: "square",
		"arrow-back": "arrow-left",
		comment: "message-square-text",
		"add-comment": "message-square-plus",
	},
	iconoir: {
		person: "user",
		close: "x",
		"more-horizontal": "more-horiz",
		info: "info-circle",
		"alert-triangle": "warning-triangle",
		music: "music-note",
		"chevron-left": "nav-arrow-left",
		"chevron-right": "nav-arrow-right",
		"chevron-down": "nav-arrow-down",
		"chevron-up": "nav-arrow-up",
		share: "share-ios",
		file: "page",
		image: "media-image",
		moon: "half-moon",
		sun: "sun-light",
		chat: "chat-bubble",
		note: "journal",
		record: "circle",
		remote: "settings",
		cursor: "cursor-pointer",
		"paint-roller": "design-nib",
		button: "frame-select",
		paragraph: "text",
		select: "select-window",
		"edit-note": "edit-pencil",
		"delete-sweep": "bin-minus-in",
		"drag-gripper": "drag",
		stop: "square",
		"arrow-back": "arrow-left",
		comment: "chat-lines",
		"add-comment": "chat-plus-in",
	},
	eva: {
		check: "checkmark",
		mail: "email",
		filter: "funnel",
		"map-pin": "pin",
		"check-circle": "checkmark-circle",
		send: "paper-plane",
		chat: "message-circle",
		note: "file-text",
		record: "radio-button-on",
		remote: "settings",
		cursor: "navigation-2",
		"paint-roller": "color-palette",
		component: "grid",
		button: "square",
		paragraph: "text",
		select: "chevron-down",
		"edit-note": "edit-2",
		"delete-sweep": "trash-2",
		"drag-gripper": "menu-2",
		play: "play-circle",
		stop: "square",
		"arrow-back": "arrow-back",
		comment: "message-square",
		"add-comment": "message-square",
	},
	tabler: {
		close: "x",
		person: "user",
		image: "photo",
		info: "info-circle",
		"check-circle": "circle-check",
		"more-horizontal": "dots",
		chat: "message",
		note: "notebook",
		record: "record-mail",
		remote: "settings",
		cursor: "pointer",
		"paint-roller": "paint",
		component: "components",
		button: "click",
		paragraph: "pilcrow",
		select: "selector",
		"edit-note": "file-pencil",
		"delete-sweep": "playlist-x",
		"drag-gripper": "grip-vertical",
		play: "player-play",
		stop: "player-stop",
		"arrow-back": "arrow-left",
		comment: "message-2",
		"add-comment": "message-plus",
	},
	mdi: {
		search: "magnify",
		settings: "cog",
		person: "account",
		"more-horizontal": "dots-horizontal",
		trash: "delete",
		edit: "pencil",
		moon: "brightness-2",
		info: "information",
		copy: "content-copy",
		"map-pin": "map-marker",
		"alert-triangle": "alert",
		code: "code-tags",
		sun: "white-balance-sunny",
		globe: "earth",
		chat: "message",
		note: "note-text",
		record: "record-circle",
		cursor: "cursor-default",
		"paint-roller": "format-paint",
		component: "puzzle",
		button: "gesture-tap-button",
		paragraph: "format-paragraph",
		select: "unfold-more-horizontal",
		"edit-note": "note-edit",
		"delete-sweep": "playlist-remove",
		"drag-gripper": "drag-vertical",
		"arrow-back": "arrow-left",
		list: "format-list-bulleted",
		comment: "comment-text",
		"add-comment": "comment-plus",
	},
	"material-symbols": {
		plus: "add",
		minus: "remove",
		heart: "favorite",
		"chevron-down": "keyboard-arrow-down",
		"chevron-up": "keyboard-arrow-up",
		"arrow-up": "arrow-upward",
		"arrow-down": "arrow-downward",
		"more-horizontal": "more-horiz",
		calendar: "calendar-today",
		clock: "schedule",
		bell: "notifications",
		trash: "delete",
		eye: "visibility",
		file: "description",
		sun: "wb-sunny",
		moon: "dark-mode",
		copy: "content-copy",
		"alert-triangle": "warning",
		"map-pin": "location-on",
		phone: "call",
		music: "music-note",
		note: "sticky-note",
		record: "radio-button-checked",
		remote: "settings-remote",
		cursor: "arrow-selector-tool-rounded",
		"paint-roller": "format-paint",
		component: "widgets",
		button: "touch-app",
		paragraph: "format-paragraph",
		select: "unfold-more",
		"drag-gripper": "drag-indicator",
		play: "play-arrow",
		list: "format-list-bulleted",
	},
	"material-icons": {
		plus: "add",
		minus: "remove",
		heart: "favorite",
		"chevron-down": "expand-more",
		"chevron-up": "expand-less",
		"arrow-up": "arrow-upward",
		"arrow-down": "arrow-downward",
		"more-horizontal": "more-horiz",
		calendar: "calendar-today",
		clock: "schedule",
		bell: "notifications",
		trash: "delete",
		eye: "visibility",
		file: "description",
		sun: "brightness-high",
		moon: "dark-mode",
		copy: "content-copy",
		"alert-triangle": "warning",
		"map-pin": "location-on",
		globe: "public",
		music: "music-note",
		record: "fiber-manual-record",
		remote: "settings-remote",
		cursor: "near-me",
		"paint-roller": "palette",
		component: "widgets",
		button: "smart-button",
		paragraph: "subject",
		select: "unfold-more",
		"drag-gripper": "drag-indicator",
		play: "play-arrow",
		list: "format-list-bulleted",
	},
	"radix-icons": {
		search: "magnifying-glass",
		settings: "gear",
		"more-horizontal": "dots-horizontal",
		share: "share-2",
		lock: "lock-closed",
		"alert-triangle": "exclamation-triangle",
		menu: "hamburger-menu",
		"check-circle": "check-circled",
		close: "cross-2",
		eye: "eye-open",
		link: "link-2",
		info: "info-circled",
		mail: "envelope-closed",
		edit: "pencil-1",
		refresh: "update",
		send: "paper-plane",
		chat: "chat-bubble",
		note: "file-text",
		record: "circle",
		remote: "gear",
		cursor: "cursor-arrow",
		"paint-roller": "color-wheel",
		component: "component-1",
		button: "cursor-arrow",
		list: "list-bullet",
		paragraph: "text",
		select: "caret-sort",
		"edit-note": "pencil-1",
		"delete-sweep": "trash",
		"drag-gripper": "drag-handle-dots-2",
		play: "play",
		stop: "stop",
		"arrow-back": "arrow-left",
		comment: "chat-bubble",
		"add-comment": "chat-bubble",
	},
	ix: {
		person: "user",
		bell: "notifications",
		menu: "list",
		file: "document",
		"alert-triangle": "warning",
		music: "music-note",
		camera: "photo-camera",
		"map-pin": "pin",
		settings: "cogwheel",
		trash: "trashcan",
		edit: "pen",
		"more-horizontal": "more-menu",
		"check-circle": "check",
		send: "send-right",
		chat: "comment-alt",
		note: "note",
		record: "record",
		remote: "cogwheel",
		cursor: "mouse-select",
		"paint-roller": "brush",
		component: "hierarchy",
		button: "mouse-click",
		paragraph: "text-alginment-left",
		select: "select-alt",
		"edit-note": "pen",
		"delete-sweep": "trashcan",
		"drag-gripper": "drag-gripper",
		play: "play",
		stop: "stop",
		"arrow-back": "arrow-left",
		list: "list",
		comment: "comment-alt",
		"add-comment": "comment-alt",
	},
};

// The Material Symbols style presets share one spelling; they differ only in
// folder (rounded/sharp) or weight (light), so they reuse the same alias table.
IconAliases["material-symbols-rounded"] = IconAliases["material-symbols"];
IconAliases["material-symbols-sharp"] = IconAliases["material-symbols"];
IconAliases["material-symbols-light"] = IconAliases["material-symbols"];

// Constant: IconUnavailable
// Canonical names with no equivalent in a given preset. Tooling can render
// these as "n/a" rather than a missing-icon gap.
const IconUnavailable = {
	folder: ["radix-icons"],
	phone: ["radix-icons"],
	music: ["radix-icons"],
	"map-pin": ["radix-icons"],
};

// Function: resolveIconName
// Returns the name to pass to `load(name, preset)` for canonical `name`.
// Applies the preset alias when one exists, otherwise returns `name` so the
// preset transform can derive the filename.
function resolveIconName(name, preset) {
	const aliases = IconAliases[preset];
	return aliases?.[name] || name;
}

// Function: isIconAvailable
// Whether `preset` is expected to ship canonical `name`.
function isIconAvailable(name, preset) {
	const unavailable = IconUnavailable[name];
	return !unavailable || unavailable.indexOf(preset) < 0;
}

// Function: catalogNames
// Flattens `IconCatalog` to a single array of canonical names, in order.
function catalogNames() {
	const names = [];
	for (const group of Object.values(IconCatalog)) {
		for (const name of group) {
			names.push(name);
		}
	}
	return names;
}

export {
	catalogNames,
	IconAliases,
	IconCatalog,
	IconPresets,
	IconUnavailable,
	isIconAvailable,
	resolveIconName,
};
export default IconCatalog;

// EOF
