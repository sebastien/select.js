// Project: Select.js
// Author:  Sebastien Pierre
// License: BSD-3
// Created: 2026-10-07

import { expect, test } from "bun:test"
import { spawnSync } from "node:child_process"
import path from "node:path"

test("update-icons propagates updater failures without regenerating fixtures", () => {
	const result = spawnSync("make", ["-f", "src/mk/rules.mk", "update-icons", "CMD=false"], {
		cwd: path.resolve(import.meta.dir, ".."),
		encoding: "utf8",
	})
	expect(result.error).toBeUndefined()
	expect(result.status).not.toBe(0)
	expect(result.stdout).not.toContain("regenerating example fixtures")
})

// EOF
