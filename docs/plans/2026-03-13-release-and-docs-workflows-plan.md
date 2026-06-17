# Release & Docs Workflows Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish semver releases with automated changelog/benchmarks, and an agentic docs-update workflow.

**Architecture:** Two standard GH Actions workflows handle the release lifecycle (open PR → merge → tag → draft release). One `gh aw` agentic workflow keeps docs current. A release notes template controls the format of draft releases.

**Tech Stack:** GitHub Actions, `gh` CLI, `jq`, Bun (benchmarks), `gh aw` (agentic workflow)

**Design doc:** `docs/plans/2026-03-13-release-and-docs-workflows-design.md`

> The tasks below were implemented. Each references the file it produced — read that file for the
> authoritative, current source rather than a snapshot embedded here. Commit each task on its own.

---

### Task 1: Release notes template

Create `.github/release-notes-template.md` — a Markdown skeleton with `{{changes}}`, `{{benchmarks}}`,
and `{{compare_url}}` placeholders. The release-deploy workflow reads this file and substitutes real
data for each placeholder.

Commit: `chore: add release notes template`.

---

### Task 2: Release workflow

Create `.github/workflows/release.yml` — a `workflow_dispatch` workflow taking a `bump` choice
(`patch`/`minor`/`major`). It reads the current version from `package.json`, computes the next semver,
creates a `release/v*` branch, bumps `package.json`, and opens a PR against `main`. Needs `contents:write`
and `pull-requests: write`.

Commit: `ci: add release workflow`.

---

### Task 3: Release / Deploy workflow

Create `.github/workflows/release-deploy.yml` — triggered when a `release/v*` PR merges into `main`. It
creates and pushes a git tag, collects merged PRs since the previous tag (categorized into
Features/Fixes/Performance/Other via `gh pr list` + `jq`), runs `bun run bench --json` and formats a
benchmark table, renders release notes from the Task 1 template, creates a draft GitHub Release, then
dispatches the docs-update workflow. Needs `contents: write` and `actions: write`.

Commit: `ci: add release-deploy workflow`.

---

### Task 4: Docs / Update agentic workflow

Create `.github/workflows/docs-update.md` — a `gh aw` workflow that runs weekly/after-releases/on-dispatch,
reads the codebase to determine truth, and updates `README.md`, `CLAUDE.md`, and `docs/*.md` to match
(accurate, terse, minimal-diff). It verifies file trees, exports, and test/benchmark counts against
reality, then opens a `[docs-update]` PR or exits if nothing is stale. It does not add new doc sections,
write tutorials, or touch source code.

Compile with `gh aw compile` to generate `.github/workflows/docs-update.lock.yml` (run manually if
`gh aw` is unavailable). Commit both files: `ci: add docs-update agentic workflow`.

---

### Task 5: Remove `private` from package.json

Delete the `"private": true` line from `package.json`, run `bun run typecheck` and `bun run lint`, then
commit: `chore: remove private flag from package.json`.

---

### Task 6: Verify end-to-end

Confirm `git log --oneline main..HEAD` shows the 5 expected commits (template, release, release-deploy,
docs-update, package.json). Validate the workflow YAML parses, then run `bun run typecheck`, `bun run lint`,
and `bun test`. Commit a final fix only if these steps reveal issues.
