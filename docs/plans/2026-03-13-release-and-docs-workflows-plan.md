# Release & Docs Workflows Implementation Plan

> **Status:** Implemented — every file below exists on `main`. Kept as a historical record of intent; the shipped files are the source of truth and have already drifted from the snippets this plan originally inlined.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish semver releases with automated changelog/benchmarks, and an agentic docs-update workflow.

**Architecture:** Two standard GH Actions workflows handle the release lifecycle (open PR → merge → tag → draft release). One `gh aw` agentic workflow keeps docs current. A release notes template controls the format of draft releases.

**Tech Stack:** GitHub Actions, `gh` CLI, `jq`, Bun (benchmarks), `gh aw` (agentic workflow)

**Design doc:** [`2026-03-13-release-and-docs-workflows-design.md`](2026-03-13-release-and-docs-workflows-design.md)

---

## Deliverables

Each task is one commit, in this order:

| # | File | Commit message |
|---|------|----------------|
| 1 | [`.github/release-notes-template.md`](../../.github/release-notes-template.md) | `chore: add release notes template` |
| 2 | [`.github/workflows/release.yml`](../../.github/workflows/release.yml) | `ci: add release workflow` |
| 3 | [`.github/workflows/release-deploy.yml`](../../.github/workflows/release-deploy.yml) | `ci: add release-deploy workflow` |
| 4 | [`.github/workflows/docs-update.md`](../../.github/workflows/docs-update.md) + its generated `.lock.yml` | `ci: add docs-update agentic workflow` |
| 5 | `package.json` (remove `"private": true`) | `chore: remove private flag from package.json` |

---

### Task 1: Release notes template

Three placeholders — `{{changes}}`, `{{benchmarks}}`, `{{compare_url}}` — under `## What's Changed`, `## Benchmarks`, and a `**Full Changelog**` line. Release / Deploy reads the file and substitutes real values with bash parameter expansion.

### Task 2: Release workflow

`workflow_dispatch` with a required `bump` choice (`patch` / `minor` / `major`). Reads the current version from `package.json` with `jq`, computes the next semver, creates branch `release/v<version>`, commits the bump as `github-actions[bot]`, and opens a PR against `main`. Needs `contents: write` and `pull-requests: write`.

The shipped workflow also fails fast if the release branch already exists on the remote, guarding against two releases in flight at once.

### Task 3: Release / Deploy workflow

Runs on `pull_request: [closed]` against `main`, gated on `merged == true` and a head ref starting with `release/v`. Needs `contents: write` and `actions: write`, plus a full-depth checkout so tag history is available.

Six steps: create and push the `v<version>` tag; collect merged PRs; run benchmarks; render release notes from the template; create a **draft** GitHub Release; dispatch docs-update.

**Collecting changes.** `gh pr list --search` finds PRs merged since the previous tag's commit date (all merged PRs if there is no previous tag), the release PR itself is filtered out by its `release:` title prefix, and `jq` buckets the rest by conventional-commit prefix into `### Features` / `### Fixes` / `### Performance` / `### Other`. Sections with no entries are omitted; an empty result becomes "No categorized changes." The output goes to a file rather than a step output to avoid shell-escaping problems.

**Benchmarks.** `bun run bench --json` feeds a `jq` program that emits a markdown table of suite, benchmark, average (µs under 0.01ms, otherwise ms), ops/sec with thousands separators, target, and pass/FAIL. Results are recorded for visibility only — a missed target shows as a FAIL row and does not block the release.

**Dispatch.** `gh workflow run docs-update.lock.yml` is non-blocking; a failure warns rather than failing the job.

### Task 4: Docs / Update agentic workflow

A `gh aw` markdown workflow: weekly schedule plus `workflow_dispatch`, `permissions: read-all`, `engine: claude`, `strict: true`, 20-minute timeout, `skip-if-match` on an open `[docs-update]` PR, and a `create-pull-request` safe output titled `[docs-update] ` with labels `docs` and `automation`, expiring after 1 day. It imports `shared/formatting.md` and `shared/reporting.md`.

The prompt directs the agent to read the codebase first, treat it as the only source of truth, and make minimal targeted edits to `README.md`, `CLAUDE.md`, and `docs/*.md` — verifying the `src/` file tree, test and benchmark counts, `package.json` exports and scripts, glossary terms against real type and function names, and `docs/bindings.md` against `src/editor/input-handler.ts`. It explicitly does not add new docs, write tutorials, touch source code, or rewrite accurate prose for style. If nothing is stale it exits with a status message.

**Compile before committing:** `gh aw compile` generates `.github/workflows/docs-update.lock.yml`. Commit the `.md` and the `.lock.yml` together. If `gh aw` is unavailable locally, flag this step for the user to run.

### Task 5: Remove `private` from package.json

Delete the `"private": true` line so the package can be published, then run `bun run typecheck` and `bun run lint`.

---

### Task 6: Verify end-to-end

`git log --oneline main..HEAD` should show the five commits above. Check that both new YAML workflows parse (`python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))"`, likewise for `release-deploy.yml`), then confirm CI is still green:

```bash
bun run typecheck
bun run lint
bun test
```

Commit again only if these reveal a problem.
