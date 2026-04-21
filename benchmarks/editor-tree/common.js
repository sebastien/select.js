const DOC_SIZES = [
	{
		name: "small",
		sections: 8,
		paragraphsPerSection: 4,
		sentencesPerParagraph: 2,
		listEvery: 2,
		listItems: 4,
	},
	{
		name: "medium",
		sections: 28,
		paragraphsPerSection: 6,
		sentencesPerParagraph: 3,
		listEvery: 2,
		listItems: 5,
	},
	{
		name: "large",
		sections: 80,
		paragraphsPerSection: 8,
		sentencesPerParagraph: 3,
		listEvery: 2,
		listItems: 6,
	},
];

const WORDS = [
	"alpha",
	"beta",
	"gamma",
	"delta",
	"omega",
	"vector",
	"matrix",
	"signal",
	"cursor",
	"marker",
	"thread",
	"canvas",
	"editor",
	"layout",
	"render",
	"patch",
	"update",
	"anchor",
	"stream",
	"buffer",
	"inline",
	"block",
	"section",
	"paragraph",
];

const isObject = (value) =>
	value !== null && typeof value === "object" && !Array.isArray(value);

const buildIdFactory = (prefix) => {
	let next = 1;
	return () => `${prefix}-${next++}`;
};

const sentence = (seed, wordCount) => {
	const words = [];
	for (let i = 0; i < wordCount; i++) {
		words.push(WORDS[(seed + i * 7) % WORDS.length]);
	}
	return `${words.join(" ")}.`;
};

const textNode = (id, value) => ({
	id,
	type: "text",
	value,
});

const elementNode = (id, tag, children, attrs = null) => ({
	id,
	type: "element",
	tag,
	attrs,
	children,
});

const createParagraph = ({
	id,
	sectionIndex,
	paragraphIndex,
	sentenceCount,
}) => {
	const seed = sectionIndex * 97 + paragraphIndex * 13;
	const intro = sentence(seed, 8 + (paragraphIndex % 3));
	const emphasis = sentence(seed + 5, 6 + (sectionIndex % 2));
	const strong = sentence(seed + 11, 5 + ((sectionIndex + paragraphIndex) % 3));
	const tail = Array.from({ length: sentenceCount }, (_, i) =>
		sentence(seed + i * 17 + 3, 8 + ((sectionIndex + i) % 4)),
	).join(" ");

	return elementNode(id(), "p", [
		textNode(id(), `${intro} `),
		elementNode(id(), "em", [textNode(id(), `${emphasis} `)]),
		textNode(id(), " "),
		elementNode(id(), "strong", [textNode(id(), `${strong} `)]),
		textNode(id(), ` ${tail}`),
	]);
};

const createSection = ({
	id,
	sectionIndex,
	paragraphsPerSection,
	sentencesPerParagraph,
	listEvery,
	listItems,
}) => {
	const children = [
		elementNode(id(), "h2", [
			textNode(id(), `Section ${sectionIndex + 1}: editor document block`),
		]),
	];

	for (let i = 0; i < paragraphsPerSection; i++) {
		children.push(
			createParagraph({
				id,
				sectionIndex,
				paragraphIndex: i,
				sentenceCount: sentencesPerParagraph,
			}),
		);
	}

	if (sectionIndex % listEvery === 0) {
		children.push(
			elementNode(
				id(),
				"ul",
				Array.from({ length: listItems }, (_, i) =>
					elementNode(id(), "li", [
						textNode(id(), `Item ${i + 1} for section ${sectionIndex + 1}. `),
						elementNode(id(), "span", [
							textNode(id(), sentence(sectionIndex * 19 + i * 5, 7)),
						]),
					]),
				),
			),
		);
	}

	if (sectionIndex % 3 === 0) {
		children.push(
			elementNode(id(), "blockquote", [
				elementNode(id(), "p", [
					textNode(id(), sentence(sectionIndex * 23 + 3, 10)),
				]),
			]),
		);
	}

	return elementNode(id(), "section", children);
};

export const SIZE_NAMES = DOC_SIZES.map((_) => _.name);

export const nextFrame = () =>
	new Promise((resolve) => requestAnimationFrame(() => resolve()));

export const settle = async (frames = 2) => {
	for (let i = 0; i < frames; i++) {
		await nextFrame();
	}
};

export const getSizeConfig = (name) => {
	const config = DOC_SIZES.find((_) => _.name === name);
	if (!config) {
		throw new Error(`Unsupported size \"${name}\"`);
	}
	return config;
};

export const buildDocumentForSize = (name) => {
	const config = getSizeConfig(name);
	const id = buildIdFactory(name);
	const sections = Array.from({ length: config.sections }, (_, sectionIndex) =>
		createSection({
			id,
			sectionIndex,
			paragraphsPerSection: config.paragraphsPerSection,
			sentencesPerParagraph: config.sentencesPerParagraph,
			listEvery: config.listEvery,
			listItems: config.listItems,
		}),
	);

	return elementNode(
		id(),
		"article",
		[
			elementNode(id(), "h1", [textNode(id(), `Benchmark document (${name})`)]),
			...sections,
		],
		{ "data-size": name },
	);
};

export const cloneDocument = (value) => structuredClone(value);

export const countDomNodes = (root) => {
	let count = 0;
	const walker = document.createTreeWalker(root, NodeFilter.SHOW_ALL);
	while (walker.nextNode()) {
		count++;
	}
	return count;
};

export const countDocumentNodes = (root) => {
	let count = 0;
	const walk = (node) => {
		count++;
		if (node?.type === "element") {
			for (const child of node.children || []) {
				walk(child);
			}
		}
	};
	walk(root);
	return count;
};

export const countTextCharacters = (root) => {
	let count = 0;
	const walk = (node) => {
		if (!node) {
			return;
		}
		if (node.type === "text") {
			count += node.value.length;
			return;
		}
		for (const child of node.children || []) {
			walk(child);
		}
	};
	walk(root);
	return count;
};

const walkWithContext = (
	node,
	visit,
	context = { depth: 0, sectionId: null, parentId: null },
) => {
	if (!node) {
		return;
	}
	visit(node, context);
	if (node.type !== "element") {
		return;
	}
	const nextSectionId = node.tag === "section" ? node.id : context.sectionId;
	for (const child of node.children || []) {
		walkWithContext(child, visit, {
			depth: context.depth + 1,
			sectionId: nextSectionId,
			parentId: node.id,
		});
	}
};

const indexDocument = (root) => {
	const elements = [];
	const texts = [];
	walkWithContext(root, (node, context) => {
		if (node.type === "element") {
			elements.push({
				id: node.id,
				tag: node.tag,
				depth: context.depth,
				sectionId: context.sectionId,
				parentId: context.parentId,
			});
		} else if (node.type === "text") {
			texts.push({
				id: node.id,
				depth: context.depth,
				sectionId: context.sectionId,
				parentId: context.parentId,
			});
		}
	});
	return {
		elements,
		texts,
		sections: elements.filter((_) => _.tag === "section"),
		paragraphs: elements.filter((_) => _.tag === "p"),
		lists: elements.filter((_) => _.tag === "ul"),
		listItems: elements.filter((_) => _.tag === "li"),
	};
};

const findNodeById = (node, id, parent = null, index = -1) => {
	if (!node) {
		return null;
	}
	if (node.id === id) {
		return { node, parent, index };
	}
	if (node.type !== "element") {
		return null;
	}
	for (let i = 0; i < node.children.length; i++) {
		const hit = findNodeById(node.children[i], id, node, i);
		if (hit) {
			return hit;
		}
	}
	return null;
};

const detachNodeById = (root, id) => {
	const hit = findNodeById(root, id);
	if (!hit || !hit.parent || !Array.isArray(hit.parent.children)) {
		return null;
	}
	return hit.parent.children.splice(hit.index, 1)[0] || null;
};

const insertChildByParentId = (root, parentId, node, position = null) => {
	const hit = findNodeById(root, parentId);
	if (!hit || hit.node.type !== "element") {
		return false;
	}
	const children = hit.node.children || (hit.node.children = []);
	const index =
		position === null
			? children.length
			: Math.max(0, Math.min(position, children.length));
	children.splice(index, 0, node);
	return true;
};

const swapChildrenById = (root, parentId, leftChildId, rightChildId) => {
	const hit = findNodeById(root, parentId);
	if (!hit || hit.node.type !== "element") {
		return false;
	}
	const children = hit.node.children || [];
	const leftIndex = children.findIndex((_) => _.id === leftChildId);
	const rightIndex = children.findIndex((_) => _.id === rightChildId);
	if (leftIndex < 0 || rightIndex < 0 || leftIndex === rightIndex) {
		return false;
	}
	[children[leftIndex], children[rightIndex]] = [
		children[rightIndex],
		children[leftIndex],
	];
	return true;
};

const appendTextById = (root, id, suffix) => {
	const hit = findNodeById(root, id);
	if (!hit || hit.node.type !== "text") {
		return false;
	}
	hit.node.value += suffix;
	return true;
};

const makeSyntheticChunk = (prefix, seed) =>
	elementNode(`${prefix}-container`, "div", [
		elementNode(`${prefix}-h3`, "h3", [
			textNode(`${prefix}-h3-text`, `Inserted editor chunk ${seed}`),
		]),
		elementNode(`${prefix}-p`, "p", [
			textNode(
				`${prefix}-p-text`,
				`${sentence(seed * 31 + 2, 9)} ${sentence(seed * 37 + 3, 8)}`,
			),
		]),
		elementNode(`${prefix}-aside`, "aside", [
			elementNode(`${prefix}-code`, "code", [
				textNode(`${prefix}-code-text`, sentence(seed * 41 + 5, 6)),
			]),
		]),
	]);

export const createPatchPhases = (base) => {
	const index = indexDocument(base);
	const deepTextTargets = [...index.texts]
		.sort((left, right) => right.depth - left.depth)
		.slice(0, 4);
	const sectionIds = index.sections.map((_) => _.id);
	const sourceSectionId = sectionIds[1] || sectionIds[0];
	const targetSectionId = sectionIds.at(-1) || sectionIds[0];
	const sourceParagraph =
		index.paragraphs.find((_) => _.sectionId === sourceSectionId) ||
		index.paragraphs[0];
	const sourceListItem =
		index.listItems[Math.floor(index.listItems.length / 2)] ||
		index.listItems[0];
	const targetList =
		index.lists.find((_) => _.sectionId === targetSectionId) || index.lists[0];
	const reorderSection =
		index.sections[Math.floor(index.sections.length / 2)] || index.sections[0];
	const reorderSectionChildren =
		reorderSection &&
		findNodeById(base, reorderSection.id)
			?.node?.children?.filter((_) => _.type === "element")
			.map((_) => _.id);

	const syntheticChunk = makeSyntheticChunk("synthetic-chunk", 1);

	const phases = [];

	if (deepTextTargets.length) {
		phases.push({
			name: "deep-text",
			operations: deepTextTargets.map((target, index) => ({
				name: `append text to ${target.id}`,
				apply(next) {
					appendTextById(next, target.id, ` [inserted-${index + 1}]`);
				},
			})),
		});
	}

	if (sourceParagraph && targetSectionId) {
		const moveOperations = [
			{
				name: `cut/paste ${sourceParagraph.id} -> ${targetSectionId}`,
				apply(next) {
					const moved = detachNodeById(next, sourceParagraph.id);
					if (moved) {
						insertChildByParentId(next, targetSectionId, moved, 1);
					}
				},
			},
		];

		if (sourceListItem && targetList) {
			moveOperations.push({
				name: `cut/paste ${sourceListItem.id} -> ${targetList.id}`,
				apply(next) {
					const moved = detachNodeById(next, sourceListItem.id);
					if (moved) {
						insertChildByParentId(next, targetList.id, moved, 0);
					}
				},
			});
		}

		phases.push({
			name: "move",
			operations: moveOperations,
		});
	}

	if (reorderSection && reorderSectionChildren?.length >= 3) {
		phases.push({
			name: "reorder",
			operations: [
				{
					name: `swap ${reorderSectionChildren[0]} <-> ${reorderSectionChildren.at(-1)}`,
					apply(next) {
						swapChildrenById(
							next,
							reorderSection.id,
							reorderSectionChildren[0],
							reorderSectionChildren.at(-1),
						);
					},
				},
				{
					name: `move ${reorderSectionChildren[1]} to top`,
					apply(next) {
						const moved = detachNodeById(next, reorderSectionChildren[1]);
						if (moved) {
							insertChildByParentId(next, reorderSection.id, moved, 0);
						}
					},
				},
			],
		});
	}

	if (targetSectionId) {
		phases.push({
			name: "add-remove",
			operations: [
				{
					name: `insert ${syntheticChunk.id}`,
					apply(next) {
						insertChildByParentId(
							next,
							targetSectionId,
							structuredClone(syntheticChunk),
						);
					},
				},
				{
					name: `remove ${syntheticChunk.id}`,
					apply(next) {
						detachNodeById(next, syntheticChunk.id);
					},
				},
			],
		});
	}

	return phases;
};

export const isDocumentNode = (value) => {
	if (!isObject(value)) {
		return false;
	}
	if (value.type === "text") {
		return typeof value.value === "string";
	}
	if (value.type === "element") {
		return (
			typeof value.tag === "string" &&
			Array.isArray(value.children) &&
			value.children.every((_) => isDocumentNode(_))
		);
	}
	return false;
};
