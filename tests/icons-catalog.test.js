// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-09-23
// Updated: 2026-09-23

import { describe, expect, test } from "bun:test"
import {
	IconAliases,
	IconCatalog,
	IconPresets,
	IconUnavailable,
	catalogNames,
	isIconAvailable,
	resolveIconName,
} from "../src/js/select/features/icons.catalog.js"

describe("icons.catalog", () => {
	test("resolves canonical names through per-preset aliases", () => {
		expect(resolveIconName("close", "lucide")).toBe("x")
		expect(resolveIconName("close", "tabler")).toBe("x")
		expect(resolveIconName("close", "radix-icons")).toBe("cross-2")
		expect(resolveIconName("search", "mdi")).toBe("magnify")
		expect(resolveIconName("settings", "ix")).toBe("cogwheel")
		expect(resolveIconName("chevron-left", "iconoir")).toBe("nav-arrow-left")
		expect(resolveIconName("arrow-up", "material-symbols")).toBe("arrow-upward")
	})

	test("resolves the inspector tool set across presets", () => {
		expect(resolveIconName("cursor", "material-symbols")).toBe("arrow-selector-tool-rounded")
		expect(resolveIconName("cursor", "material-symbols-light")).toBe("arrow-selector-tool-rounded")
		expect(resolveIconName("paint-roller", "lucide")).toBe("paint-roller")
		expect(resolveIconName("paint-roller", "material-symbols")).toBe("format-paint")
		expect(resolveIconName("component", "radix-icons")).toBe("component-1")
		expect(resolveIconName("note", "material-symbols")).toBe("sticky-note")
		expect(resolveIconName("button", "material-symbols")).toBe("touch-app")
		expect(resolveIconName("delete-sweep", "iconoir")).toBe("bin-minus-in")
		expect(resolveIconName("drag-gripper", "radix-icons")).toBe("drag-handle-dots-2")
		// Every Material Symbols style preset shares the base spelling.
		expect(resolveIconName("note", "material-symbols-light")).toBe("sticky-note")
		expect(resolveIconName("cursor", "material-symbols-rounded")).toBe("arrow-selector-tool-rounded")
		expect(resolveIconName("paint-roller", "material-symbols-sharp")).toBe("format-paint")
	})

	test("falls back to the canonical name when there is no alias", () => {
		expect(resolveIconName("home", "material-symbols")).toBe("home")
		expect(resolveIconName("star", "lucide")).toBe("star")
		expect(resolveIconName("unknown-icon", "lucide")).toBe("unknown-icon")
	})

	test("reports known-absent pairs", () => {
		expect(isIconAvailable("folder", "radix-icons")).toBe(false)
		expect(isIconAvailable("folder", "lucide")).toBe(true)
		expect(isIconAvailable("home", "radix-icons")).toBe(true)
	})

	test("catalog is well-formed", () => {
		const names = catalogNames()
		expect(Object.keys(IconCatalog).length).toBeGreaterThan(0)
		expect(names.length).toBeGreaterThan(0)
		expect(names).toContain("home")
		expect(new Set(names).size).toBe(names.length)
		const presets = Object.keys(IconPresets)
		for (const name of names) {
			for (const preset of presets) {
				const resolved = resolveIconName(name, preset)
				expect(typeof resolved).toBe("string")
				expect(resolved.length).toBeGreaterThan(0)
			}
		}
	})

	test("aliases and unavailable lists only reference known presets", () => {
		const presets = new Set(Object.keys(IconPresets))
		for (const [preset, aliases] of Object.entries(IconAliases)) {
			expect(presets.has(preset)).toBe(true)
			for (const value of Object.values(aliases)) {
				expect(typeof value).toBe("string")
				expect(value.length).toBeGreaterThan(0)
			}
		}
		for (const [name, list] of Object.entries(IconUnavailable)) {
			for (const preset of list) {
				expect(presets.has(preset)).toBe(true)
			}
			expect(typeof name).toBe("string")
		}
	})
})

// EOF
