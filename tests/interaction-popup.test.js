import { afterEach, describe, expect, test } from "bun:test"
import { Window } from "happy-dom"

let activeWindow

function setup() {
	activeWindow = new Window({
		innerWidth: 1000,
		innerHeight: 800,
	})
	Object.assign(globalThis, {
		window: activeWindow,
		document: activeWindow.document,
		Node: activeWindow.Node,
		Element: activeWindow.Element,
		HTMLElement: activeWindow.HTMLElement,
		KeyboardEvent: activeWindow.KeyboardEvent,
		MouseEvent: activeWindow.MouseEvent,
		ResizeObserver: activeWindow.ResizeObserver,
	})
	return activeWindow
}

function stubRect(node, box) {
	node.getBoundingClientRect = () => ({
		x: box.x,
		y: box.y,
		left: box.x,
		top: box.y,
		width: box.width,
		height: box.height,
		right: box.x + box.width,
		bottom: box.y + box.height,
	})
}

function nodes() {
	const trigger = activeWindow.document.createElement("button")
	const panel = activeWindow.document.createElement("div")
	panel.textContent = "Panel"
	stubRect(trigger, { x: 100, y: 200, width: 60, height: 20 })
	stubRect(panel, { x: 0, y: 0, width: 80, height: 40 })
	return { trigger, panel }
}

afterEach(() => {
	activeWindow?.close()
	activeWindow = undefined
})

describe("interaction popup", () => {
	test("portals the panel to body and restores it", async () => {
		const window = setup()
		const { popup } = await import("../src/js/select/features/interaction/popup.js")
		const { trigger, panel } = nodes()
		const holder = window.document.createElement("div")
		holder.appendChild(panel)
		window.document.body.append(trigger, holder)

		const session = popup(panel, trigger)
		expect(panel.parentNode).toBe(window.document.body)
		expect(panel.style.position).toBe("fixed")
		expect(panel.style.left).toBe("90px")
		expect(panel.style.top).toBe("220px")

		session.close()
		expect(panel.parentNode).toBe(holder)
		expect(panel.style.position).toBe("")
	})

	test("keeps the panel in place when portal is disabled", async () => {
		const window = setup()
		const { popup } = await import("../src/js/select/features/interaction/popup.js")
		const { trigger, panel } = nodes()
		const holder = window.document.createElement("div")
		holder.appendChild(panel)
		window.document.body.append(trigger, holder)

		const session = popup(panel, trigger, { portal: false })
		expect(panel.parentNode).toBe(holder)
		expect(panel.style.position).toBe("fixed")
		session.close()
	})

	test("ignores panel scrolling but follows the trigger's scrolling ancestors", async () => {
		const window = setup()
		globalThis.ResizeObserver = undefined
		const { popup } = await import("../src/js/select/features/interaction/popup.js")
		const { trigger, panel } = nodes()
		const scroller = window.document.createElement("div")
		const list = window.document.createElement("div")
		scroller.append(trigger)
		panel.append(list)
		window.document.body.append(scroller, panel)
		let measurements = 0
		let y = 200
		trigger.getBoundingClientRect = () => {
			measurements++
			return { x: 100, y, width: 60, height: 20 }
		}
		const session = popup(panel, trigger)
		const initial = measurements
		list.dispatchEvent(new window.Event("scroll", { bubbles: true }))
		await new Promise(resolve => setTimeout(resolve, 40))
		expect(measurements).toBe(initial)
		y = 150
		scroller.dispatchEvent(new window.Event("scroll", { bubbles: true }))
		await new Promise(resolve => setTimeout(resolve, 40))
		expect(measurements).toBeGreaterThan(initial)
		expect(panel.style.top).toBe("170px")
		const afterAncestor = measurements
		y = 120
		window.dispatchEvent(new window.Event("scroll"))
		await new Promise(resolve => setTimeout(resolve, 40))
		expect(measurements).toBeGreaterThan(afterAncestor)
		expect(panel.style.top).toBe("140px")
		session.close()
	})

	test("closes from an underlay click", async () => {
		const window = setup()
		const { popup } = await import("../src/js/select/features/interaction/popup.js")
		const { trigger, panel } = nodes()
		window.document.body.append(trigger, panel)
		let reason = null

		const session = popup(panel, trigger, {
			underlay: { class: "cover", dim: true },
			onClose: (value) => {
				reason = value
			},
		})
		expect(session.underlay.className).toBe("cover")
		expect(session.underlay.style.background).toContain("rgba")
		session.underlay.dispatchEvent(new window.MouseEvent("click", { bubbles: true }))
		expect(reason).toBe("underlay")
		expect(session.underlay.parentNode).toBe(null)
	})

	test("closes only the top session on escape", async () => {
		const window = setup()
		const { popup } = await import("../src/js/select/features/interaction/popup.js")
		const first = nodes()
		const second = nodes()
		window.document.body.append(first.trigger, first.panel, second.trigger, second.panel)
		const reasons = []

		popup(first.panel, first.trigger, {
			onClose: (value) => reasons.push(`first:${value}`),
		})
		popup(second.panel, second.trigger, {
			onClose: (value) => reasons.push(`second:${value}`),
		})

		window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }))
		expect(reasons).toEqual(["second:escape"])
		expect(first.panel.style.position).toBe("fixed")
		expect(second.panel.style.position).toBe("")

		window.dispatchEvent(new window.KeyboardEvent("keydown", { key: "Escape", keyCode: 27, bubbles: true }))
		expect(reasons).toEqual(["second:escape", "first:escape"])
	})
})
