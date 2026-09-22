// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-08-15

// Module: select/ui/virtual
// Provides a fixed-size, scroll-windowed grid component. The component keeps a
// small pool of normal Select UI item instances and changes their data as the
// viewport moves. It deliberately sits above UISlot; UISlot still owns the
// normal collection reconciliation behavior.

import { ui } from "./factory.js";

// Function: windowOf
// Computes the visible row window for a fixed-size grid.
function windowOf({
	count = 0,
	viewportWidth = 0,
	viewportHeight = 0,
	scrollTop = 0,
	cellWidth = 1,
	cellHeight = 1,
	gap = 0,
	columns = "auto",
	overscan = 1,
} = {}) {
	const width = Math.max(1, Number(cellWidth) || 1);
	const height = Math.max(1, Number(cellHeight) || 1);
	const spacing = Math.max(0, Number(gap) || 0);
	const availableWidth = Math.max(width, Number(viewportWidth) || width);
	const pitchX = width + spacing;
	const pitchY = height + spacing;
	const cols =
		columns === "auto"
			? Math.max(1, Math.floor((availableWidth + spacing) / pitchX))
			: Math.max(1, Math.floor(Number(columns) || 1));
	const total = Math.max(0, Math.floor(Number(count) || 0));
	const rows = total ? Math.ceil(total / cols) : 0;
	const top = Math.max(0, Number(scrollTop) || 0);
	const viewport = Math.max(height, Number(viewportHeight) || height);
	const before = Math.max(
		0,
		Math.floor(top / pitchY) - Math.max(0, Math.floor(overscan)),
	);
	const after = Math.min(
		rows,
		Math.ceil((top + viewport) / pitchY) + Math.max(0, Math.floor(overscan)),
	);
	const visibleStart = Math.min(total, Math.floor(top / pitchY) * cols);
	const start = Math.min(total, before * cols);
	const end = Math.min(total, after * cols);

	return {
		columns: cols,
		rows,
		start,
		visibleStart,
		end,
		count: end - start,
		poolCount: Math.min(total - start, Math.max(0, (after - before) * cols)),
		offsetY: before * pitchY,
		rowHeight: pitchY,
		totalHeight: rows ? rows * height + (rows - 1) * spacing : 0,
	};
}

function numberOption(value, fallback) {
	return value == null ? fallback : value;
}

function ensureMeasurement(self) {
	const viewport = self.ref.viewport ?? self.nodes?.[0];
	if (!viewport) return;
	const update = self._virtualResize;
	if (!update) {
		const measure = () => {
			const width = viewport.clientWidth;
			const height = viewport.clientHeight;
			const current = self.data ?? {};
			if (
				self.data &&
				(width !== current.viewportWidth || height !== current.viewportHeight)
			) {
				self.update({ viewportWidth: width, viewportHeight: height });
			}
		};
		self._virtualResize = measure;
		if (typeof ResizeObserver === "function") {
			const observer = new ResizeObserver(measure);
			observer.observe(viewport);
			self.effect(() => () => observer.disconnect());
		} else {
			const win = viewport.ownerDocument?.defaultView ?? globalThis.window;
			win?.addEventListener("resize", measure);
			self.effect(() => () => win?.removeEventListener("resize", measure));
		}
		const win = viewport.ownerDocument?.defaultView ?? globalThis.window;
		if (typeof win?.requestAnimationFrame === "function") {
			win.requestAnimationFrame(measure);
		} else {
			setTimeout(measure, 0);
		}
		return;
	}
}

function layoutFor(self, data, options) {
	const items = data.items;
	const count = data.count == null ? (items?.length ?? 0) : data.count;
	const viewport = self.ref.viewport ?? self.nodes?.[0];
	const cellWidth = numberOption(data.cellWidth, options.cellWidth ?? 82);
	const columns = data.columns ?? options.columns ?? "auto";
	const fallbackWidth =
		columns === "auto"
			? cellWidth * 5
			: cellWidth * Math.max(1, Number(columns) || 1);
	return windowOf({
		count,
		viewportWidth:
			viewport?.clientWidth || self.data?.viewportWidth || fallbackWidth,
		viewportHeight:
			viewport?.clientHeight ||
			self.data?.viewportHeight ||
			options.viewportHeight ||
			240,
		scrollTop: data.scrollTop,
		cellWidth,
		cellHeight: numberOption(data.cellHeight, options.cellHeight ?? 72),
		gap: numberOption(data.gap, options.gap ?? 8),
		columns,
		overscan: numberOption(data.overscan, options.overscan ?? 6),
	});
}

// Function: virtual
// Creates a virtual grid component.
// - item: component used for each visible cell
// - items: optional materialized collection
// - count: number of logical cells when using itemAt
// - itemAt: `(index) => data` for lazy cell data
// - cellWidth/cellHeight/gap/columns/overscan: fixed layout options
function virtual(options = {}) {
	if (typeof options.item !== "function") {
		throw new TypeError("virtual() requires an item component");
	}

	const item = options.item;
	const template = ui(`
		<div class="virtual-grid" ref="viewport" on:scroll="scrollTop" style="position:relative;overflow:auto;overflow-anchor:none;contain:strict;">
			<div class="virtual-grid-spacer" out:style="spacerStyle">
				<div class="virtual-grid-content" ref="content" out:style="contentStyle">
					<div out-replace="cells"></div>
				</div>
			</div>
		</div>
	`)
		.init((self) => {
			self._virtualResize = null;
			self._virtualWindow = null;
			return {
				scrollTop: 0,
				viewportWidth: 0,
				viewportHeight: 0,
			};
		})
		.does({
			scrollTop: (self, data, event) => {
				if (event?.target) {
					const scrollTop = event.target.scrollTop;
					const layout = layoutFor(self, { ...data, scrollTop }, options);
					const content = self.ref.content;
					if (content)
						content.style.transform = `translateY(${layout.offsetY}px)`;
					self.update({ scrollTop });
				}
				return data.scrollTop || 0;
			},
			cells: (self, data) => {
				ensureMeasurement(self);
				const items = data.items;
				const layout = layoutFor(self, data, options);
				self._virtualWindow = layout;
				if (data.scrollTo != null && data.scrollTo !== self._virtualScrollTo) {
					self._virtualScrollTo = data.scrollTo;
					const viewport = self.ref.viewport;
					if (viewport)
						viewport.scrollTop =
							Math.ceil(
								Math.max(0, Number(data.scrollTo) || 0) / layout.columns,
							) * layout.rowHeight;
				}
				if (layout.visibleStart !== self._virtualVisibleStart) {
					self._virtualVisibleStart = layout.visibleStart;
					const notify = () => {
						if (!self._isDisposed)
							self.pub("Visible", {
								index: layout.visibleStart,
								end: layout.end,
							});
					};
					if (typeof queueMicrotask === "function") queueMicrotask(notify);
					else setTimeout(notify, 0);
				}
				const result = new Array(layout.count);
				for (let i = 0; i < layout.count; i++) {
					const index = layout.start + i;
					const value =
						typeof data.itemAt === "function"
							? data.itemAt(
									index,
									(index / layout.columns) | 0,
									index % layout.columns,
								)
							: items[index];
					result[i] = item({ ...(value ?? {}), $key: i, virtualIndex: index });
				}
				return result;
			},
			spacerStyle: (self, data) => ({
				height: `${layoutFor(self, data, options).totalHeight}px`,
			}),
			contentStyle: (self, data) => {
				const layout = layoutFor(self, data, options);
				const height = numberOption(data.cellHeight, options.cellHeight ?? 72);
				const gap = numberOption(data.gap, options.gap ?? 8);
				return {
					position: "absolute",
					left: "0",
					right: "0",
					top: "0",
					transform: `translateY(${layout?.offsetY ?? 0}px)`,
					display: "grid",
					gridTemplateColumns: `repeat(${layout?.columns ?? 1}, minmax(0, 1fr))`,
					gridAutoRows: `${height}px`,
					gap: `${gap}px`,
					minHeight: `${height}px`,
					boxSizing: "border-box",
					padding: "0",
					width: "100%",
				};
			},
		});

	return template;
}

export { virtual, windowOf };

// EOF
