const DATA_URL = "./perf-inspector.json";

const isObject = (value) =>
	value !== null && typeof value === "object" && !Array.isArray(value);

export const nextFrame = () =>
	new Promise((resolve) => requestAnimationFrame(() => resolve()));

export const settle = async (frames = 2) => {
	for (let i = 0; i < frames; i++) {
		await nextFrame();
	}
};

export const loadDataset = async () => {
	const logs = await fetch(DATA_URL).then((response) => response.json());
	return { logs };
};

export const cloneDataset = (value) => structuredClone(value);

export const countDomNodes = (root) => {
	let count = 1;
	for (const child of root.childNodes) {
		count += countDomNodes(child);
	}
	return count;
};

const serializeChildren = (node) => {
	const children = [];
	for (const childNode of node.childNodes) {
		const child = serializeNode(childNode);
		if (!child) {
			continue;
		}
		if (child.type === "#text" && child.value === "") {
			continue;
		}
		const previous = children[children.length - 1];
		if (child.type === "#text" && previous?.type === "#text") {
			previous.value += child.value;
		} else {
			children.push(child);
		}
	}
	return children;
};

const serializeNode = (node) => {
	switch (node.nodeType) {
		case Node.TEXT_NODE:
			return { type: "#text", value: node.data };
		case Node.ELEMENT_NODE:
			return {
				type: node.tagName.toLowerCase(),
				children: serializeChildren(node),
			};
		default:
			return null;
	}
};

const hashString = (text) => {
	let hash = 2166136261;
	for (let i = 0; i < text.length; i++) {
		hash ^= text.charCodeAt(i);
		hash = Math.imul(hash, 16777619);
	}
	return (hash >>> 0).toString(16).padStart(8, "0");
};

export const createSnapshot = (root) => {
	const tree = {
		type: "#root",
		children: serializeChildren(root),
	};
	const structure = JSON.stringify(tree);
	const text = root.textContent ?? "";
	return {
		structure,
		text,
		structureHash: hashString(structure),
		textHash: hashString(text),
	};
};

const getAt = (value, path) =>
	path.reduce((result, segment) => result?.[segment], value);

const setAt = (value, path, nextValue) => {
	const parent = getAt(value, path.slice(0, -1));
	parent[path.at(-1)] = nextValue;
	return value;
};

const deleteAt = (value, path) => {
	const parent = getAt(value, path.slice(0, -1));
	if (Array.isArray(parent)) {
		parent.splice(path.at(-1), 1);
	} else if (parent) {
		delete parent[path.at(-1)];
	}
	return value;
};

const walk = (value, visit, path = []) => {
	visit(value, path);
	if (Array.isArray(value)) {
		for (let i = 0; i < value.length; i++) {
			walk(value[i], visit, [...path, i]);
		}
	} else if (isObject(value)) {
		for (const key of Object.keys(value)) {
			walk(value[key], visit, [...path, key]);
		}
	}
};

const mutatePrimitive = (value, index) => {
	switch (typeof value) {
		case "string":
			return `${value} [patch ${index + 1}]`;
		case "number":
			return value + index + 0.5;
		case "boolean":
			return !value;
		case "undefined":
			return `undefined-${index + 1}`;
		default:
			return value === null ? `null-${index + 1}` : `value-${index + 1}`;
	}
};

const makeSyntheticLog = (seed) => ({
	type: seed % 2 ? "warning" : "log",
	message: `Synthetic benchmark log ${seed}`,
	data:
		seed % 3 === 0 ? [seed, { nested: true }, null] : { changed: true, seed },
	context: {
		origin: `Benchmark.synthetic.${seed}`,
		trace: 900000 + seed,
	},
	timestamp: 1800000000 + seed,
});

const firstByDistinctDepth = (entries, count) => {
	const result = [];
	const seen = new Set();
	for (const entry of entries) {
		if (seen.has(entry.path.length)) {
			continue;
		}
		seen.add(entry.path.length);
		result.push(entry);
		if (result.length >= count) {
			break;
		}
	}
	return result;
};

const describePath = (path) => path.join(".");
const pathStartsWith = (path, prefix) =>
	prefix.length <= path.length &&
	prefix.every((segment, index) => path[index] === segment);
const pathsOverlap = (a, b) => pathStartsWith(a, b) || pathStartsWith(b, a);

export const createPatchPhases = (base) => {
	const primitives = [];
	const arrays = [];
	const objects = [];

	walk(base, (value, path) => {
		if (Array.isArray(value)) {
			if (value.length > 1) {
				arrays.push({ path, length: value.length });
			}
		} else if (isObject(value)) {
			objects.push({ path, size: Object.keys(value).length });
		} else {
			primitives.push({
				path,
				type: value === null ? "null" : typeof value,
			});
		}
	});

	const primitiveTargets = firstByDistinctDepth(
		primitives.sort((a, b) => a.path.length - b.path.length),
		3,
	);
	const arrayTargets = firstByDistinctDepth(
		arrays
			.filter((entry) => entry.path.length > 0)
			.sort((a, b) => a.path.length - b.path.length),
		2,
	);
	const nestedArrayTarget =
		arrays.find((entry) => entry.path.length > 2) || arrayTargets[0];
	const entryObjectTarget =
		objects.find((entry) => entry.path.length === 2) ||
		objects.find((entry) => entry.path.length > 0);
	const objectRetypeTarget =
		objects.find(
			(entry) =>
				entry.path.length > 2 &&
				entry.path.at(-1) !== "context" &&
				!pathsOverlap(entry.path, arrayTargets[0]?.path || []) &&
				!pathsOverlap(entry.path, nestedArrayTarget?.path || []),
		) || entryObjectTarget;
	const nestedObjectTarget =
		objects.find(
			(entry) =>
				entry.path.at(-1) === "context" &&
				!pathsOverlap(entry.path, objectRetypeTarget?.path || []),
		) ||
		objects.find(
			(entry) =>
				entry.path.length > 2 &&
				!pathsOverlap(entry.path, objectRetypeTarget?.path || []),
		) ||
		entryObjectTarget;

	const phases = [];

	if (primitiveTargets.length) {
		phases.push({
			name: "content",
			operations: primitiveTargets.map((target, index) => ({
				name: `update ${describePath(target.path)}`,
				apply(next) {
					setAt(
						next,
						target.path,
						mutatePrimitive(getAt(next, target.path), index),
					);
				},
			})),
		});
	}

	if (arrayTargets.length) {
		const operations = [];
		for (const target of arrayTargets) {
			operations.push({
				name: `swap ${describePath(target.path)} [0 <-> last]`,
				apply(next) {
					const list = getAt(next, target.path);
					const last = list.length - 1;
					[list[0], list[last]] = [list[last], list[0]];
				},
			});
			if (target.length > 3) {
				operations.push({
					name: `swap ${describePath(target.path)} [1 <-> 2]`,
					apply(next) {
						const list = getAt(next, target.path);
						[list[1], list[2]] = [list[2], list[1]];
					},
				});
			}
		}
		phases.push({ name: "move", operations });
	}

	if (primitiveTargets[0] || objectRetypeTarget || nestedArrayTarget) {
		const operations = [];
		if (primitiveTargets[0]) {
			operations.push({
				name: `retype ${describePath(primitiveTargets[0].path)} primitive -> object`,
				apply(next) {
					const previous = getAt(next, primitiveTargets[0].path);
					setAt(next, primitiveTargets[0].path, {
						type: "retagged",
						previous,
					});
				},
			});
		}
		if (objectRetypeTarget) {
			operations.push({
				name: `retype ${describePath(objectRetypeTarget.path)} object -> string`,
				apply(next) {
					const previous = getAt(next, objectRetypeTarget.path);
					if (
						previous &&
						typeof previous === "object" &&
						!Array.isArray(previous)
					) {
						setAt(next, objectRetypeTarget.path, "[entry replaced by string]");
					}
				},
			});
		}
		if (nestedArrayTarget) {
			operations.push({
				name: `retype ${describePath(nestedArrayTarget.path)} array -> object`,
				apply(next) {
					const previous = getAt(next, nestedArrayTarget.path);
					if (Array.isArray(previous)) {
						setAt(next, nestedArrayTarget.path, {
							retyped: "array",
							size: previous.length,
						});
					}
				},
			});
		}
		phases.push({ name: "type", operations });
	}

	if (nestedObjectTarget || arrayTargets[0]) {
		const operations = [];
		if (arrayTargets[0]) {
			operations.push({
				name: `append ${describePath(arrayTargets[0].path)}`,
				apply(next) {
					const list = getAt(next, arrayTargets[0].path);
					if (Array.isArray(list)) {
						list.push(makeSyntheticLog(list.length + 1));
					}
				},
			});
			operations.push({
				name: `remove ${describePath(arrayTargets[0].path)}[1]`,
				apply(next) {
					const list = getAt(next, arrayTargets[0].path);
					if (Array.isArray(list) && list.length > 1) {
						list.splice(1, 1);
					}
				},
			});
		}
		if (nestedArrayTarget) {
			operations.push({
				name: `append ${describePath(nestedArrayTarget.path)}`,
				apply(next) {
					const list = getAt(next, nestedArrayTarget.path);
					if (Array.isArray(list)) {
						list.push({ extra: true });
					}
				},
			});
		}
		if (nestedObjectTarget) {
			operations.push({
				name: `add ${describePath(nestedObjectTarget.path)}.benchmark`,
				apply(next) {
					const object = getAt(next, nestedObjectTarget.path);
					if (object && typeof object === "object" && !Array.isArray(object)) {
						object.benchmark = "added";
					}
				},
			});
			operations.push({
				name: `remove ${describePath(nestedObjectTarget.path)}.benchmark`,
				apply(next) {
					const object = getAt(next, nestedObjectTarget.path);
					if (object && typeof object === "object" && !Array.isArray(object)) {
						deleteAt(next, [...nestedObjectTarget.path, "benchmark"]);
					}
				},
			});
		}
		phases.push({ name: "add-remove", operations });
	}

	return phases;
};
