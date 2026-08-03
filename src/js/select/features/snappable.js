// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-08-01

// Module: select/snappable
// Maintains rectangles in a coordinate space and resolves alignment snapping and
// sticky border adhesion without requiring DOM layout or rendering.

const LEFT = 0;
const TOP = 1;
const RIGHT = 2;
const BOTTOM = 3;
const SIDES = [LEFT, TOP, RIGHT, BOTTOM];
const OPPOSITE = [RIGHT, BOTTOM, LEFT, TOP];
const CELL_FACTOR = 67108864;

// Type: Snappable
// A mutable rectangle space with spatial snapping and sticky-border links.
class Snappable {
	constructor(options = {}) {
		this.tolerance = options.tolerance ?? 8;
		this.detachTolerance = options.detachTolerance ?? this.tolerance * 1.75;
		this.hysteresis = options.hysteresis ?? 4;
		this.minOverlap = options.minOverlap ?? 16;
		this.cellSize = options.cellSize ?? 256;
		this.count = 0;
		this.capacity = 16;
		this.ids = new Map();
		this.slotIds = new Array(this.capacity);
		this.tags = new Map();
		this.tagCount = 0;
		this.active = new Uint8Array(this.capacity);
		this.leaders = new Uint8Array(this.capacity);
		this.x = new Float64Array(this.capacity);
		this.y = new Float64Array(this.capacity);
		this.width = new Float64Array(this.capacity);
		this.height = new Float64Array(this.capacity);
		this.sticky = new Int32Array(this.capacity * 4);
		this.links = new Int32Array(this.capacity * 4);
		this.links.fill(-1);
		this.parents = new Int32Array(this.capacity);
		this.parents.fill(-1);
		this.parentSides = new Int8Array(this.capacity);
		this.parentSides.fill(-1);
		this.cells = new Array(this.capacity);
		this.buckets = new Map();
		this.marks = new Uint32Array(this.capacity);
		this.mark = 0;
	}

	// Function: add
	// Adds rectangle `id` with `box` and optional per-side sticky tags.
	add(id, box, options = {}) {
		if (this.ids.has(id)) throw new Error(`Duplicate snappable id "${id}"`);
		const slot = this.count++;
		this._grow(slot + 1);
		this.ids.set(id, slot);
		this.slotIds[slot] = id;
		this.active[slot] = 1;
		this._setBox(slot, box);
		this._setSticky(slot, options.sticky);
		this.leaders[slot] = options.leader ? 1 : 0;
		this._index(slot);
		return id;
	}

	// Function: remove
	// Removes rectangle `id` and all of its adhesion links.
	remove(id) {
		const slot = this.ids.get(id);
		if (slot === undefined) return false;
		this._unindex(slot);
		for (const side of SIDES) this._unlink(slot, side);
		this.active[slot] = 0;
		this.slotIds[slot] = undefined;
		this.ids.delete(id);
		return true;
	}

	// Function: get
	// Returns a copy of rectangle `id` in the space coordinate system.
	get(id) {
		const slot = this.ids.get(id);
		return slot === undefined ? undefined : this._box(slot);
	}

	// Function: set
	// Replaces the geometry of rectangle `id` and updates its spatial index.
	set(id, box) {
		const slot = this._slot(id);
		this._unindex(slot);
		this._setBox(slot, box);
		this._index(slot);
		return this;
	}

	// Function: sticky
	// Replaces the sticky tags of rectangle `id`.
	sticky(id, sides) {
		const slot = this._slot(id);
		for (const side of SIDES) this._unlink(slot, side);
		this._setSticky(slot, sides);
		return this;
	}

	// Function: attach
	// Attaches `id` as a child of `targetId` through opposite matching sticky sides.
	attach(id, side, targetId, targetSide = undefined) {
		const slot = this._slot(id);
		const target = this._slot(targetId);
		side = sideIndex(side);
		this._attach(slot, side, target, sideIndex(targetSide ?? OPPOSITE[side]));
		return this;
	}

	// Function: detach
	// Detaches the link on `side` of rectangle `id`.
	detach(id, side) {
		this._unlink(this._slot(id), sideIndex(side));
		return this;
	}

	// Function: component
	// Returns the ids in the adhesion component containing `id`.
	component(id) {
		const slots = this._component(this._slot(id));
		const result = new Array(slots.length);
		for (let i = 0; i < slots.length; i++) result[i] = this._id(slots[i]);
		return result;
	}

	// Function: attachments
	// Returns the directed sticky attachments in this space.
	attachments() {
		const result = [];
		for (let slot = 0; slot < this.count; slot++) {
			const parent = this.parents[slot];
			if (!this.active[slot] || parent < 0) continue;
			const side = this.parentSides[slot];
			result.push({
				id: this._id(slot),
				side: sideName(side),
				targetId: this._id(parent),
				targetSide: sideName(OPPOSITE[side]),
			});
		}
		return result;
	}

	// Function: leader
	// Marks `id` as the explicit leader for its adhesion component.
	leader(id, value = true) {
		this.leaders[this._slot(id)] = value ? 1 : 0;
		return this;
	}

	// Function: begin
	// Starts a transaction that translates `id` and its owned descendants.
	begin(id, options = {}) {
		const slot = this._slot(id);
		if (options.pull === undefined) {
			if (this.leaders[slot]) return new SnapDrag(this, this._component(slot));
			const parent = this.parents[slot];
			return new SnapDrag(
				this,
				this._subtree(slot),
				parent < 0
					? undefined
					: { slot, side: this.parentSides[slot], target: parent },
			);
		}
		const side = sideIndex(options.pull);
		const target = this.links[slot * 4 + side];
		if (target < 0) {
			throw new Error("A pull gesture requires an existing sticky border link");
		}
		return new SnapDrag(this, [slot], { slot, side, target });
	}

	// Function: pull
	// Starts a one-palette pull gesture that breaks `side` past detach tolerance.
	pull(id, side) {
		return this.begin(id, { pull: side });
	}

	_slot(id) {
		const slot = this.ids.get(id);
		if (slot === undefined) throw new Error(`Unknown snappable id "${id}"`);
		return slot;
	}

	_id(slot) {
		return this.slotIds[slot];
	}

	_setBox(slot, box) {
		if (!(box.width >= 0) || !(box.height >= 0)) {
			throw new Error("Snappable boxes require non-negative width and height");
		}
		this.x[slot] = box.x;
		this.y[slot] = box.y;
		this.width[slot] = box.width;
		this.height[slot] = box.height;
	}

	_setSticky(slot, sides = {}) {
		const offset = slot * 4;
		for (const side of SIDES) {
			const tag = sides[sideName(side)];
			this.sticky[offset + side] = tag === undefined ? 0 : this._tag(tag);
		}
	}

	_tag(tag) {
		let value = this.tags.get(tag);
		if (value !== undefined) return value;
		value = ++this.tagCount;
		this.tags.set(tag, value);
		return value;
	}

	_attach(slot, side, target, targetSide) {
		if (slot === target || OPPOSITE[side] !== targetSide) {
			throw new Error(
				"Sticky borders must join opposite sides of different boxes",
			);
		}
		const tag = this.sticky[slot * 4 + side];
		if (!tag || tag !== this.sticky[target * 4 + targetSide]) {
			throw new Error("Sticky borders require matching tags");
		}
		if (
			this.links[slot * 4 + side] === target &&
			this.links[target * 4 + targetSide] === slot
		)
			return;
		if (this._component(slot).includes(target)) {
			throw new Error("Sticky borders cannot create adhesion cycles");
		}
		if (this.parents[slot] >= 0) this._unlink(slot, this.parentSides[slot]);
		this._unlink(slot, side);
		this._unlink(target, targetSide);
		this.links[slot * 4 + side] = target;
		this.links[target * 4 + targetSide] = slot;
		this.parents[slot] = target;
		this.parentSides[slot] = side;
	}

	_unlink(slot, side) {
		const offset = slot * 4 + side;
		const target = this.links[offset];
		if (target < 0) return;
		this.links[offset] = -1;
		const targetOffset = target * 4 + OPPOSITE[side];
		if (this.links[targetOffset] === slot) this.links[targetOffset] = -1;
		if (this.parents[slot] === target && this.parentSides[slot] === side) {
			this.parents[slot] = -1;
			this.parentSides[slot] = -1;
		}
		if (
			this.parents[target] === slot &&
			this.parentSides[target] === OPPOSITE[side]
		) {
			this.parents[target] = -1;
			this.parentSides[target] = -1;
		}
	}

	_component(slot) {
		this._nextMark();
		const result = [];
		const queue = [slot];
		this.marks[slot] = this.mark;
		for (let i = 0; i < queue.length; i++) {
			const current = queue[i];
			result.push(current);
			const offset = current * 4;
			for (const side of SIDES) {
				const target = this.links[offset + side];
				if (target >= 0 && this.marks[target] !== this.mark) {
					this.marks[target] = this.mark;
					queue.push(target);
				}
			}
		}
		return result;
	}

	_subtree(slot) {
		const result = [slot];
		for (let i = 0; i < result.length; i++) {
			const current = result[i];
			for (const childSide of SIDES) {
				const candidate = this.links[current * 4 + childSide];
				if (candidate >= 0 && this.parents[candidate] === current) {
					result.push(candidate);
				}
			}
		}
		return result;
	}

	_index(slot) {
		const cells = this._cells(slot);
		this.cells[slot] = cells;
		for (let i = 0; i < cells.length; i++) {
			const key = cells[i];
			let bucket = this.buckets.get(key);
			if (!bucket) this.buckets.set(key, (bucket = []));
			bucket.push(slot);
		}
	}

	_unindex(slot) {
		const cells = this.cells[slot];
		if (!cells) return;
		for (let i = 0; i < cells.length; i++) {
			const bucket = this.buckets.get(cells[i]);
			if (!bucket) continue;
			const index = bucket.indexOf(slot);
			if (index >= 0) bucket.splice(index, 1);
			if (bucket.length === 0) this.buckets.delete(cells[i]);
		}
		this.cells[slot] = undefined;
	}

	_cells(slot, x = this.x[slot], y = this.y[slot]) {
		const size = this.cellSize;
		const x0 = Math.floor(x / size);
		const x1 = Math.floor((x + this.width[slot]) / size);
		const y0 = Math.floor(y / size);
		const y1 = Math.floor((y + this.height[slot]) / size);
		const result = [];
		for (let cx = x0; cx <= x1; cx++) {
			for (let cy = y0; cy <= y1; cy++) result.push(cellKey(cx, cy));
		}
		return result;
	}

	_query(slot, x, y, padding, result) {
		const size = this.cellSize;
		const x0 = Math.floor((x - padding) / size);
		const x1 = Math.floor((x + this.width[slot] + padding) / size);
		const y0 = Math.floor((y - padding) / size);
		const y1 = Math.floor((y + this.height[slot] + padding) / size);
		for (let cx = x0; cx <= x1; cx++) {
			for (let cy = y0; cy <= y1; cy++) {
				const bucket = this.buckets.get(cellKey(cx, cy));
				if (!bucket) continue;
				for (let i = 0; i < bucket.length; i++) {
					const candidate = bucket[i];
					if (this.marks[candidate] !== this.mark) {
						this.marks[candidate] = this.mark;
						result.push(candidate);
					}
				}
			}
		}
	}

	_nextMark() {
		if (++this.mark === 0xffffffff) {
			this.marks.fill(0);
			this.mark = 1;
		}
	}

	_box(slot, x = this.x[slot], y = this.y[slot]) {
		return {
			id: this._id(slot),
			x,
			y,
			width: this.width[slot],
			height: this.height[slot],
		};
	}

	_grow(size) {
		if (size <= this.capacity) return;
		const capacity = Math.max(size, this.capacity * 2);
		this.active = grow(this.active, capacity);
		this.leaders = grow(this.leaders, capacity);
		this.x = grow(this.x, capacity);
		this.y = grow(this.y, capacity);
		this.width = grow(this.width, capacity);
		this.height = grow(this.height, capacity);
		const links = grow(this.links, capacity * 4);
		links.fill(-1, this.links.length);
		this.links = links;
		const parents = grow(this.parents, capacity);
		parents.fill(-1, this.parents.length);
		this.parents = parents;
		const parentSides = grow(this.parentSides, capacity);
		parentSides.fill(-1, this.parentSides.length);
		this.parentSides = parentSides;
		this.sticky = grow(this.sticky, capacity * 4);
		this.marks = grow(this.marks, capacity);
		this.cells.length = capacity;
		this.slotIds.length = capacity;
		this.capacity = capacity;
	}
}

// Type: SnapDrag
// A transient drag transaction whose `move` result remains valid until its next call.
class SnapDrag {
	constructor(space, slots, pull = undefined) {
		this.space = space;
		this.slots = slots;
		this.x = new Float64Array(slots.length);
		this.y = new Float64Array(slots.length);
		this.boxes = new Array(slots.length);
		this.candidates = [];
		this.guides = [];
		this.lastX = undefined;
		this.lastY = undefined;
		this.pull = pull;
		this.closed = false;
		for (let i = 0; i < slots.length; i++) {
			const slot = slots[i];
			this.x[i] = space.x[slot];
			this.y[i] = space.y[slot];
			space._unindex(slot);
		}
	}

	// Function: move
	// Resolves a component translation of `dx`, `dy` and returns boxes and guides.
	move(dx, dy) {
		if (this.closed) throw new Error("Snappable drag session is closed");
		const space = this.space;
		const candidates = this.candidates;
		if (this.pull) {
			this.pull.broken = pullsApart(dx, dy, space.detachTolerance);
		}
		candidates.length = 0;
		space._nextMark();
		for (let i = 0; i < this.slots.length; i++) {
			space._query(
				this.slots[i],
				this.x[i] + dx,
				this.y[i] + dy,
				space.tolerance + space.hysteresis,
				candidates,
			);
		}
		let bestX;
		let bestY;
		for (let i = 0; i < this.slots.length; i++) {
			const slot = this.slots[i];
			const x = this.x[i] + dx;
			const y = this.y[i] + dy;
			for (let j = 0; j < candidates.length; j++) {
				const target = candidates[j];
				if (!space.active[target]) continue;
				bestX = resolveAxis(
					space,
					slot,
					target,
					x,
					y,
					"x",
					bestX,
					this.lastX,
					this.pull,
				);
				bestY = resolveAxis(
					space,
					slot,
					target,
					x,
					y,
					"y",
					bestY,
					this.lastY,
					this.pull,
				);
			}
		}
		const correctionX = bestX?.delta ?? 0;
		const correctionY = bestY?.delta ?? 0;
		this.guides.length = 0;
		if (bestX) this.guides.push(guide(space, bestX, "x"));
		if (bestY) this.guides.push(guide(space, bestY, "y"));
		this.lastX = bestX?.key;
		this.lastY = bestY?.key;
		for (let i = 0; i < this.slots.length; i++) {
			this.boxes[i] = space._box(
				this.slots[i],
				this.x[i] + dx + correctionX,
				this.y[i] + dy + correctionY,
			);
		}
		this.dx = dx + correctionX;
		this.dy = dy + correctionY;
		this.adhesion = [];
		if (bestX?.kind === "adhesion") this.adhesion.push(bestX);
		if (bestY?.kind === "adhesion") this.adhesion.push(bestY);
		return { boxes: this.boxes, guides: this.guides, adhesion: this.adhesion };
	}

	// Function: end
	// Commits the latest resolved position and its selected adhesion links.
	end() {
		if (this.closed) return;
		const space = this.space;
		for (let i = 0; i < this.slots.length; i++) {
			const slot = this.slots[i];
			space.x[slot] = this.x[i] + (this.dx ?? 0);
			space.y[slot] = this.y[i] + (this.dy ?? 0);
			space._index(slot);
		}
		if (this.pull?.broken) space._unlink(this.pull.slot, this.pull.side);
		for (let i = 0; i < (this.adhesion?.length ?? 0); i++) {
			const candidate = this.adhesion[i];
			space._attach(
				candidate.slot,
				candidate.side,
				candidate.target,
				candidate.targetSide,
			);
		}
		this.closed = true;
	}

	// Function: cancel
	// Restores the session boxes to the spatial index without changing geometry.
	cancel() {
		if (this.closed) return;
		for (let i = 0; i < this.slots.length; i++)
			this.space._index(this.slots[i]);
		this.closed = true;
	}
}

function resolveAxis(space, slot, target, x, y, axis, best, previous, pull) {
	const sourceStart = axis === "x" ? x : y;
	const sourceSize = axis === "x" ? space.width[slot] : space.height[slot];
	const targetStart = axis === "x" ? space.x[target] : space.y[target];
	const targetSize = axis === "x" ? space.width[target] : space.height[target];
	const perpendicularStart = axis === "x" ? y : x;
	const perpendicularSize =
		axis === "x" ? space.height[slot] : space.width[slot];
	const targetPerpendicularStart =
		axis === "x" ? space.y[target] : space.x[target];
	const targetPerpendicularSize =
		axis === "x" ? space.height[target] : space.width[target];
	for (let sourcePoint = 0; sourcePoint < 3; sourcePoint++) {
		const sourceCoordinate = sourceStart + sourceSize * (sourcePoint / 2);
		for (let targetPoint = 0; targetPoint < 3; targetPoint++) {
			const targetCoordinate = targetStart + targetSize * (targetPoint / 2);
			const candidate = {
				slot,
				target,
				axis,
				delta: targetCoordinate - sourceCoordinate,
				kind: "alignment",
				targetCoordinate,
				key: `${slot}:${target}:${sourcePoint}:${targetPoint}`,
			};
			best = choose(space, candidate, best, previous, pull);
		}
	}
	const pairs =
		axis === "x"
			? [
					[LEFT, RIGHT],
					[RIGHT, LEFT],
				]
			: [
					[TOP, BOTTOM],
					[BOTTOM, TOP],
				];
	for (let i = 0; i < pairs.length; i++) {
		const [side, targetSide] = pairs[i];
		const tag = space.sticky[slot * 4 + side];
		if (!tag || tag !== space.sticky[target * 4 + targetSide]) continue;
		if (
			pull?.broken &&
			pull.slot === slot &&
			pull.side === side &&
			pull.target === target
		)
			continue;
		const overlap =
			Math.min(
				perpendicularStart + perpendicularSize,
				targetPerpendicularStart + targetPerpendicularSize,
			) - Math.max(perpendicularStart, targetPerpendicularStart);
		if (overlap < space.minOverlap) continue;
		const sourceCoordinate =
			side === LEFT || side === TOP ? sourceStart : sourceStart + sourceSize;
		const targetCoordinate =
			targetSide === LEFT || targetSide === TOP
				? targetStart
				: targetStart + targetSize;
		best = choose(
			space,
			{
				slot,
				target,
				axis,
				side,
				targetSide,
				overlap,
				delta: targetCoordinate - sourceCoordinate,
				kind: "adhesion",
				targetCoordinate,
				key: `${slot}:${target}:${side}:${targetSide}`,
			},
			best,
			previous,
			pull,
		);
	}
	return best;
}

function choose(space, candidate, best, previous, pull = undefined) {
	const held =
		pull &&
		pull.slot === candidate.slot &&
		pull.target === candidate.target &&
		pull.side === candidate.side;
	const limit = held
		? space.detachTolerance
		: candidate.key === previous
			? space.tolerance + space.hysteresis
			: space.tolerance;
	if (Math.abs(candidate.delta) > limit) return best;
	if (!best) return candidate;
	if (candidate.kind !== best.kind)
		return candidate.kind === "adhesion" ? candidate : best;
	const candidateDelta = Math.abs(candidate.delta);
	const bestDelta = Math.abs(best.delta);
	if (candidate.key === previous)
		return candidateDelta <= bestDelta + space.hysteresis ? candidate : best;
	if (best.key === previous)
		return bestDelta <= candidateDelta + space.hysteresis ? best : candidate;
	if (candidateDelta !== bestDelta)
		return candidateDelta < bestDelta ? candidate : best;
	return (candidate.overlap ?? 0) > (best.overlap ?? 0) ? candidate : best;
}

function guide(space, candidate, axis) {
	const source = candidate.slot;
	const target = candidate.target;
	const vertical = axis === "x";
	const coordinate = candidate.targetCoordinate;
	const sourceStart = vertical ? space.y[source] : space.x[source];
	const sourceEnd =
		sourceStart + (vertical ? space.height[source] : space.width[source]);
	const targetStart = vertical ? space.y[target] : space.x[target];
	const targetEnd =
		targetStart + (vertical ? space.height[target] : space.width[target]);
	return {
		axis,
		coordinate,
		from: Math.min(sourceStart, targetStart),
		to: Math.max(sourceEnd, targetEnd),
		kind: candidate.kind,
		source: {
			id: space._id(source),
			side: candidate.side === undefined ? undefined : sideName(candidate.side),
		},
		target: {
			id: space._id(target),
			side:
				candidate.targetSide === undefined
					? undefined
					: sideName(candidate.targetSide),
		},
	};
}

function sideIndex(side) {
	if (typeof side === "number" && side >= LEFT && side <= BOTTOM) return side;
	const value = { left: LEFT, top: TOP, right: RIGHT, bottom: BOTTOM }[side];
	if (value === undefined) throw new Error(`Unknown snappable side "${side}"`);
	return value;
}

function sideName(side) {
	return ["left", "top", "right", "bottom"][side];
}

function pullsApart(dx, dy, tolerance) {
	return dx * dx + dy * dy > tolerance * tolerance;
}

function cellKey(x, y) {
	return x * CELL_FACTOR + y;
}

function grow(values, size) {
	const result = new values.constructor(size);
	result.set(values);
	return result;
}

export { BOTTOM, LEFT, RIGHT, SnapDrag, Snappable, TOP };
export default Snappable;

// EOF
