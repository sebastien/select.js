// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-08-23

// Module: select/ui/mask
// Compiled named-slot masks for parsing, formatting, and live input fields.

import { dates } from "../utils/dates.js"
import { escapeRegexp, PatternSlot, parsePattern } from "../utils/pattern.js"

function sourceOf(slot) {
	if (!(slot instanceof PatternSlot)) return null
	if (!slot.type) return ".+?"
	return slot.pattern.regexp.source.replace(/^\^/, "").replace(/\$$/, "")
}

function regexpOf(tokens) {
	let source = "^"
	for (let i = 0; i < tokens.length; i++) {
		const token = tokens[i]
		source += typeof token === "string" ? escapeRegexp(token) : `(${sourceOf(token)})`
	}
	return new RegExp(`${source}$`)
}

function maxLength(source) {
	let length = 0
	let unlimited = false
	const atom = /((?:\\.|\[[^\]]*\]|\([^)]*\)|.))(?:\{(\d+)(?:,(\d*))?\}|([+*?]))?/g
	let match
	while ((match = atom.exec(source))) {
		const quantifier = match[4]
		if (quantifier === "+" || quantifier === "*") {
			unlimited = true
		} else if (match[2]) {
			length += Number(match[3] || match[2])
		} else if (quantifier === "?") {
			length += 1
		} else {
			length += 1
		}
	}
	return unlimited ? Infinity : length
}

function minLength(source) {
	let length = 0
	const atom = /((?:\\.|\[[^\]]*\]|\([^)]*\)|.))(?:\{(\d+)(?:,(\d*))?\}|([+*?]))?/g
	let match
	while ((match = atom.exec(source))) {
		const quantifier = match[4]
		if (quantifier === "+") {
			length += 1
		} else if (match[2]) {
			length += Number(match[2])
		} else if (!quantifier) {
			length += 1
		}
	}
	return length
}

function prefixMatches(source, value, maximum = Infinity) {
	if (value.length > maximum) return false
	try {
		if (new RegExp(`^(?:${source})$`).test(value)) return true
		const atom = source.match(/^(?:\\.|\[[^\]]*\]|\([^)]*\)|.)/)?.[0]
		return !!atom && [...value].every((character) =>
			new RegExp(`^(?:${atom})$`).test(character),
		)
	} catch {
		return false
	}
}

function normalizeValue(name, value, normalizers) {
	const normalizer = normalizers?.[name]
	return typeof normalizer === "function" ? normalizer(value) : value
}

// Function: mask
// Compiles `pattern` into a parser/formatter and live input helper. `options`
// may provide `placeholder` for incomplete slot rendering, `pad` for slots
// completed by a following literal, and `bounds` `{ slot: [min, max] }` to
// clamp a completed numeric slot.
function mask(pattern, normalizers = {}, options = {}) {
	const tokens = parsePattern(pattern)
	const placeholder = `${options.placeholder ?? ""}`
	const pad = `${options.pad ?? ""}`
	const bounds = options.bounds && typeof options.bounds === "object" ? options.bounds : null
	const regexp = regexpOf(tokens)
	const slots = []
	for (let i = 0; i < tokens.length; i++) {
		if (tokens[i] instanceof PatternSlot) {
			const source = sourceOf(tokens[i])
			slots.push({
				token: tokens[i],
				source,
				min: minLength(source),
				max: maxLength(source),
			})
		}
	}

	function parse(value) {
		const match = regexp.exec(`${value ?? ""}`)
		if (!match) return null
		const result = {}
		for (let i = 0; i < slots.length; i++) {
			const normalized = normalizeValue(slots[i].token.name, match[i + 1], normalizers)
			if (normalized === undefined) return null
			result[slots[i].token.name] = normalized
		}
		return result
	}

	function format(values = {}) {
		let result = ""
		let pending = ""
		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i]
			if (typeof token === "string") {
				pending += token
				continue
			}
			const value = values[token.name]
			if (value === undefined || value === null || `${value}` === "") break
			result += `${pending}${value}`
			pending = ""
		}
		return result
	}

	function apply(value, cursor = undefined) {
		const source = `${value ?? ""}`
		const input = placeholder
			? [...source].filter((character) => character !== placeholder).join("")
			: source
		const inputCursor = cursor === undefined
			? undefined
			: placeholder
				? [...source.slice(0, cursor)].filter((character) => character !== placeholder).length
				: cursor
		let position = 0
		let output = ""
		let outputCursor = inputCursor === undefined ? undefined : 0
		const values = {}
		const captures = {}
		const completed = new Set()
		let complete = true

		for (let i = 0; i < tokens.length; i++) {
			const token = tokens[i]
			if (typeof token === "string") {
				let consumed = 0
				while (consumed < token.length && input[position] === token[consumed]) {
					position++
					consumed++
				}
				if (consumed < token.length && position < input.length && i > 0) {
					const later = input.indexOf(token, position)
					if (later > position) {
						if (
							inputCursor !== undefined &&
							inputCursor > position &&
							inputCursor <= later
						) {
							outputCursor = output.length
						}
						position = later
						consumed = 0
						while (consumed < token.length && input[position] === token[consumed]) {
							position++
							consumed++
						}
					} else {
						const next = tokens[i + 1]
						if (next instanceof PatternSlot && prefixMatches(sourceOf(next), input[position])) {
							output += token
							if (inputCursor !== undefined && position <= inputCursor) outputCursor = output.length
							continue
						}
					}
				}
				if (consumed < token.length) {
					if (position < input.length) complete = false
					break
				}
				output += token
				if (inputCursor !== undefined && position <= inputCursor) outputCursor = output.length
				continue
			}
			const info = slots.find((entry) => entry.token === token)
			let captured = ""
			while (position < input.length && captured.length < info.max) {
				const candidate = captured + input[position]
				if (!prefixMatches(info.source, candidate, info.max)) break
				captured = candidate
				position++
				if (inputCursor !== undefined && position <= inputCursor) {
					outputCursor = output.length + captured.length
				}
			}
			if (captured) {
				captures[token.name] = captured
				values[token.name] = normalizeValue(token.name, captured, normalizers)
				output += captured
			}
			if (position < input.length && typeof tokens[i + 1] === "string") {
				const next = tokens[i + 1]
				if (input[position] === next[0]) {
					if (inputCursor === undefined || inputCursor > position) {
						completed.add(token.name)
					}
					if (inputCursor !== undefined && position <= inputCursor) outputCursor = output.length
					continue
				}
			}
			if (inputCursor !== undefined && position <= inputCursor) outputCursor = output.length
			if (position < input.length) complete = false
		}

		if (position < input.length) complete = false
		if (bounds) {
			for (let i = 0; i < slots.length; i++) {
				const info = slots[i]
				const name = info.token.name
				const range = bounds[name]
				const captured = captures[name]
				if (!range || !captured) continue
				if (captured.length < info.max && !completed.has(name)) continue
				let n = Number(captured)
				if (!Number.isFinite(n)) continue
				const lo = Number(range[0])
				let hi = Number(range[1])
				if (name === "day") {
					const year = Number(captures.year)
					const month = Number(captures.month)
					if (
						Number.isInteger(year) &&
						Number.isInteger(month) &&
						month >= 1 &&
						month <= 12
					) {
						hi = Math.min(hi, dates.monthdays(year, month))
					}
				}
				if (!Number.isFinite(lo) || !Number.isFinite(hi)) continue
				n = Math.min(hi, Math.max(lo, n))
				const width = Math.min(Math.max(captured.length, info.min), info.max)
				const next = String(n).padStart(width, pad || "0")
				captures[name] = next
				values[name] = n
			}
		}
		if (placeholder) {
			const rawOutput = output
			const rawCursor = outputCursor
			const atEnd = inputCursor === undefined || inputCursor >= input.length
			output = ""
			let firstMissing = -1
			let mappedCursor = rawCursor ?? 0
			let rawPos = 0
			for (let i = 0; i < tokens.length; i++) {
				const token = tokens[i]
				if (typeof token === "string") {
					const inRaw = rawPos < rawOutput.length
					if (
						!atEnd &&
						rawCursor !== undefined &&
						inRaw &&
						rawCursor > rawPos &&
						rawCursor <= rawPos + token.length
					) {
						mappedCursor = output.length + (rawCursor - rawPos)
					}
					output += token
					if (inRaw) rawPos += token.length
					continue
				}
				const info = slots.find((entry) => entry.token === token)
				let captured = captures[token.name] ?? ""
				const rawCap = captured
				if (
					completed.has(token.name) &&
					pad &&
					captured.length >= info.min &&
					captured.length < info.max
				) {
					captured = captured.padStart(info.max, pad)
				}
				if (!captured && firstMissing < 0) firstMissing = output.length
				if (captured.length < info.max && firstMissing < 0) {
					firstMissing = output.length + captured.length
				}
				const inRaw = rawPos < rawOutput.length
				if (
					!atEnd &&
					rawCursor !== undefined &&
					inRaw &&
					rawCursor >= rawPos &&
					rawCursor <= rawPos + rawCap.length
				) {
					mappedCursor =
						output.length +
						(captured.length - rawCap.length) +
						(rawCursor - rawPos)
				}
				output += captured + placeholder.repeat(Math.max(0, info.max - captured.length))
				if (inRaw) rawPos += rawCap.length
			}
			if (inputCursor !== undefined) {
				outputCursor = atEnd
					? firstMissing < 0 ? output.length : firstMissing
					: Math.min(mappedCursor, output.length)
			}
		}
		return {
			text: output,
			value: placeholder && output.includes(placeholder) ? null : parse(output),
			values,
			complete: complete && !(placeholder && output.includes(placeholder)) && !!parse(output),
			cursor: outputCursor === undefined ? output.length : outputCursor,
		}
	}

	function handler(name) {
		return (_self, data, event) => {
			if (!event) return format(data?.[name])
			const result = apply(event.target.value, event.target.selectionStart)
			event.target.value = result.text
			event.target.setSelectionRange?.(result.cursor, result.cursor)
			return result.value ?? result.values
		}
	}

	function attach(input, onValue = undefined) {
		const listener = (event) => {
			const result = apply(input.value, input.selectionStart)
			input.value = result.text
			input.setSelectionRange?.(result.cursor, result.cursor)
			if (onValue) onValue(result.value ?? result.values, result, event)
		}
		input.addEventListener("input", listener)
		listener({ target: input })
		return () => input.removeEventListener("input", listener)
	}

	return { pattern, tokens, parse, format, apply, handler, attach }
}

export { mask }

// EOF
