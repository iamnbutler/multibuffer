# Release & Docs Workflows Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish semver releases with automated changelog/benchmarks, and an agentic docs-update workflow.

**Architecture:** Two standard GH Actions workflows handle the release lifecycle (open PR → merge → tag → draft release). One `gh aw` agentic workflow keeps docs current. A release notes template controls the format of draft releases.

**Tech Stack:** GitHub Actions, `gh` CLI, `jq`, Bun (benchmarks), `gh aw` (agentic workflow)

**Design doc:** `docs/plans/2026-03-13-release-and-docs-workflows-design.md`

> **Status: implemented.** Each task links to the file it produced; consult those files for the authoritative source. Sections below record intent and sequencing, not verbatim source.

---

### Task 1: Release notes template

Create [`.github/release-notes-template.md`](../../.github/release-notes-template.md) with `{{changes}}`, `{{benchmarks}}`, and `{{compare_url}}` placeholders. The release-deploy workflow reads this file and substitutes real data. Commit as `chore: add release notes template`.

---

### Task 2: Release workflow

Create [`.github/workflows/release.yml`](../../.github/workflows/release.yml): a `workflow_dispatch` job taking a `bump` choice (patch/minor/major). It reads the current version from `package.json`, computes the next semver, creates a `release/v*` branch, bumps `package.json`, and opens a PR against `main`. Needs `contents: write` and `pull-requests: write`. Commit as `ci: add release workflow`.

---

### Task 3: Release / Deploy workflow

Create [`.github/workflows/release-deploy.yml`](../../.github/workflows/release-deploy.yml), triggered when a `release/v*` PR merges into `main`. It: (1) creates and pushes a git tag, (2) collects merged PRs since the previous tag and categorizes them by `feat`/`fix`/`perf`/other, (3) runs `bun run bench --json` and formats a benchmark table with `jq`, (4) renders release notes from the template, (5) creates a draft GitHub Release, (6) dispatches `docs-update.lock.yml`. Needs `contents: write` and `actions: write`. Commit as `ci: add release-deploy workflow`.

---

### Task 4: Docs / Update agentic workflow

Create the `gh aw` workflow [`.github/workflows/docs-update.md`](../../.github/workflows/docs-update.md). It reads the codebase to determine truth, then updates `README.md`, `CLAUDE.md`, and `docs/*.md` to match — accuracy over prose, terse, focused, minimal diffs. Runs weekly / after releases / on manual dispatch, and opens a PR (labels `docs`, `automation`, prefix `[docs-update]`) or exits when nothing is stale. It does **not** add new docs, write tutorials, or touch source code.

Compile with `gh aw compile` to generate `docs-update.lock.yml` (note the step for the user if `gh aw` is unavailable). Commit both files as `ci: add docs-update agentic workflow`.

---

### Task 5: Remove `private` from package.json

Delete the `"private": true` line from `package.json`, run `bun run typecheck` and `bun run lint`, and commit as `chore: remove private flag from package.json`.

---

### Task 6: Verify end-to-end

Confirm `git log --oneline main..HEAD` shows the 5 expected commits (template, release, release-deploy, docs-update, package.json). Validate the workflow YAML parses, then run `bun run typecheck`, `bun run lint`, and `bun test`. Make a final commit only if these reveal issues.
