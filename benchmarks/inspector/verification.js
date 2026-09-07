// Project: Select.js
// Author: Sebastien Pierre
// License: BSD
// Created: 2026-09-07

// Compare complete, ordered checkpoints, not just hashes or their intersection.
function compareSnapshots(baseline, candidate) {
	const expected = baseline?.snapshots || [];
	const actual = candidate?.snapshots || [];
	const mismatches = [];
	if (!expected.length || expected.length !== actual.length) {
		mismatches.push({
			label: "checkpoints",
			reason: "empty or unequal checkpoint count",
		});
	}
	for (let i = 0; i < expected.length; i++) {
		const a = expected[i];
		const b = actual[i];
		if (
			!b ||
			a.label !== b.label ||
			typeof a.structure !== "string" ||
			typeof a.text !== "string" ||
			a.structure !== b.structure ||
			a.text !== b.text
		) {
			mismatches.push({ label: a.label, reason: "checkpoint mismatch" });
		}
	}
	return { ok: mismatches.length === 0, mismatches };
}

export { compareSnapshots };
// EOF
