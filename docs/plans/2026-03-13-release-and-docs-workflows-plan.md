# Release & Docs Workflows Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish semver releases with automated changelog/benchmarks, and an agentic docs-update workflow.

**Architecture:** Two standard GH Actions workflows handle the release lifecycle (open PR → merge → tag → draft release). One `gh aw` agentic workflow keeps docs current. A release notes template controls the format of draft releases.

**Tech Stack:** GitHub Actions, `gh` CLI, `jq`, Bun (benchmarks), `gh aw` (agentic workflow)

**Design doc:** `docs/plans/2026-03-13-release-and-docs-workflows-design.md`

> The full source for each file below now lives in the repository. This plan references those files rather than inlining them; read the actual file for exact contents.

---

### Task 1: Release notes template

**Create:** `.github/release-notes-template.md`

A markdown skeleton with `{{changes}}`, `{{benchmarks}}`, and `{{compare_url}}` placeholders. The release-deploy workflow reads this file and substitutes real data via shell parameter expansion.

Commit: `chore: add release notes template`

---

### Task 2: Release workflow

**Create:** `.github/workflows/release.yml`

A `workflow_dispatch` workflow with a `bump` choice input (patch/minor/major). It reads the current version from `package.json`, computes the next semver, creates a `release/v*` branch, bumps the version, and opens a PR against `main`. Needs `contents: write` and `pull-requests: write`.

Commit: `ci: add release workflow`

---

### Task 3: Release / Deploy workflow

**Create:** `.github/workflows/release-deploy.yml`

Triggers when a `release/v*` PR merges into `main`. It tags and pushes the release, finds the previous tag, collects merged PRs since then (categorizing by `feat`/`fix`/`perf`/other and excluding the release PR), runs benchmarks and formats them into a table, renders release notes from the Task 1 template, creates a draft GitHub Release, and dispatches the docs-update workflow. Needs `contents: write` and `actions: write`.

Commit: `ci: add release-deploy workflow`

---

### Task 4: Docs / Update agentic workflow

**Create:** `.github/workflows/docs-update.md`

A `gh aw` workflow (weekly schedule + manual dispatch) that keeps docs accurate and terse. It reads the codebase to determine truth, then makes minimal, targeted updates to `README.md`, `CLAUDE.md`, and `docs/*.md`, verifying claims (file tree, exports, test/benchmark counts, keybindings) against the actual source. It opens a `[docs-update]` PR or exits gracefully when nothing is stale. It does not add new docs, write tutorials, or touch source code.

After authoring, run `gh aw compile` to generate `docs-update.lock.yml` (note this for the user if `gh aw` is unavailable).

Commit: `ci: add docs-update agentic workflow`

---

### Task 5: Remove `private` from package.json

Delete the `"private": true` line from `package.json`, then run `bun run typecheck` and `bun run lint`.

Commit: `chore: remove private flag from package.json`

---

### Task 6: Verify end-to-end

Confirm the five new commits (template, release, release-deploy, docs-update, package.json) via `git log --oneline main..HEAD`. Validate the two release workflow YAML files parse (e.g. `python3 -c "import yaml; yaml.safe_load(open('<file>'))"`), then run `bun run typecheck`, `bun run lint`, and `bun test`. Make a final commit only if these reveal issues.
