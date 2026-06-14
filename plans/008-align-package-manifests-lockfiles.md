# Plan 008: Align package manifests and lockfiles

> **Executor instructions**: Follow this plan step by step. Run every verification command and confirm the expected result before moving to the next step. If anything in the STOP conditions section occurs, stop and report; do not improvise. When done, update the status row for this plan in `plans/README.md` unless a reviewer told you they maintain the index.
>
> **Drift check (run first)**: `git diff --stat 49d5b95..HEAD -- package.json bun.lock package-lock.json README.md AGENTS.md mise.toml`
> If any in-scope file changed since this plan was written, compare Current state excerpts against live code before proceeding.

## Status

- **Priority**: P2
- **Effort**: S
- **Risk**: LOW
- **Depends on**: none
- **Category**: dx
- **Planned at**: commit `49d5b95`, 2026-06-15

## Why this matters

The repository advertises Bun tooling, but both `bun.lock` and `package-lock.json` exist and disagree with `package.json`. Contributors using different package managers can install materially different toolchains. This makes CI/debugging and dependency audits less reproducible.

## Current state

- `mise.toml` pins Bun and Python tools.
- `package.json` is the manifest used by Bun scripts.
- `bun.lock` records older package specs than `package.json`.
- `package-lock.json` records still older npm specs.

Relevant excerpts:

```json
// package.json:31-39
"devDependencies": {
	"eslint": "^10.3.0",
	"happy-dom": "^20.9.0",
	"preact": "^10.29.1",
	"solid-js": "^1.9.12"
},
"dependencies": {
	"playwright": "^1.60.0"
}
```

```json
// bun.lock:7-15
"dependencies": {
  "playwright": "^1.59.1",
},
"devDependencies": {
  "eslint": "^10.2.1",
  "happy-dom": "^20.9.0",
  "preact": "^10.29.1",
  "solid-js": "^1.9.12",
},
```

`package-lock.json` also records `playwright` as `^1.59.1` and `eslint` as `^8.31.0` near lines 12-15 at planning time.

Repo conventions to match:

- `mise.toml` declares `bun = "1"`; package scripts use Bun and Make.
- Do not modify vendored `deps/sdk`.
- Do not run installs unless the operator accepts lockfile mutation; this plan itself authorizes the executor to update lockfiles as part of the scoped work.

## Commands you will need

| Purpose | Command | Expected on success |
|---------|---------|---------------------|
| Inspect package manager | `bun pm pkg get scripts` | exits 0 and shows Bun-readable scripts |
| Refresh Bun lockfile | `bun install` | exits 0 and updates `bun.lock` consistently with `package.json` |
| Tests | `bun test tests/dist-exports.test.js` | exits 0 |
| Lint/check | `make check` | exit 0 |

## Scope

**In scope**:

- `package.json`
- `bun.lock`
- `package-lock.json` only to remove it or refresh it if the maintainer wants dual package-manager support
- `README.md` or `AGENTS.md` only for a short package-manager policy note if needed

**Out of scope**:

- Moving Playwright between dependency sections; that is plan 009.
- Upgrading unrelated dependency majors.
- Editing `deps/sdk`.

## Git workflow

- Branch suggestion: `advisor/008-package-lock-policy`.
- Commit message example: `[Update] deps: align package locks`.
- Do not push or open a PR unless instructed.

## Steps

### Step 1: Choose the authoritative package manager

Use repo evidence: `mise.toml` pins Bun and `package.json` scripts use `bun test`. Recommended decision: Bun is authoritative, keep `bun.lock`, and remove `package-lock.json` unless the maintainer explicitly wants npm support.

If uncertain, ask the maintainer before deleting `package-lock.json`.

**Verify**: `bun pm pkg get scripts` -> exits 0.

### Step 2: Refresh the authoritative lockfile

Run `bun install` to refresh `bun.lock` against `package.json`. Review the diff and ensure only expected dependency spec/version metadata changed.

**Verify**: `git diff -- package.json bun.lock package-lock.json` -> shows only package-manager policy and lock alignment changes.

### Step 3: Handle the secondary lockfile

If Bun-only is selected, delete `package-lock.json` and add a short note to README or AGENTS if needed: use Bun for dependency installation. If dual support is required, refresh `package-lock.json` with npm in a separate explicit step and document the maintenance cost.

**Verify**: `git status --short package.json bun.lock package-lock.json README.md AGENTS.md` -> only intended files changed.

### Step 4: Run checks

Run a small test plus lint/check. Do not require full `bun test` unless the known baseline has been separately resolved.

**Verify**: `bun test tests/dist-exports.test.js` -> exits 0; `make check` -> exits 0.

## Test plan

- This is tooling/dependency metadata work; no new unit tests are expected.
- Verification is lockfile consistency plus existing test/check commands.

## Done criteria

- [ ] There is one clear package-manager policy.
- [ ] `bun.lock` matches `package.json` dependency specs.
- [ ] `package-lock.json` is either removed with rationale or refreshed intentionally.
- [ ] `bun test tests/dist-exports.test.js` exits 0.
- [ ] `make check` exits 0.

## STOP conditions

Stop and report if:

- `bun install` produces large unexpected dependency upgrades unrelated to manifest alignment.
- The maintainer wants dual npm/Bun support but npm refresh produces conflicts or major changes.
- You discover CI or publishing depends on `package-lock.json`.

## Maintenance notes

- Plan 009 should run after this so dependency-section changes happen against a clean package-manager baseline.
- Reviewers should ensure future dependency bumps update only the authoritative lockfile unless policy changes.

// EOF
