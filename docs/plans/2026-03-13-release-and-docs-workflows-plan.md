# Release & Docs Workflows Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Status:** Implemented. All files below now exist in the repo; this plan is retained as a record. Paths link to the live files for the current content.

**Goal:** Establish semver releases with automated changelog/benchmarks, and an agentic docs-update workflow.

**Architecture:** Two standard GH Actions workflows handle the release lifecycle (open PR → merge → tag → draft release). One `gh aw` agentic workflow keeps docs current. A release notes template controls the format of draft releases.

**Tech Stack:** GitHub Actions, `gh` CLI, `jq`, Bun (benchmarks), `gh aw` (agentic workflow)

**Design doc:** `docs/plans/2026-03-13-release-and-docs-workflows-design.md`

---

### Task 1: Release notes template

Create [`.github/release-notes-template.md`](../../.github/release-notes-template.md) with `{{changes}}`, `{{benchmarks}}`, and `{{compare_url}}` placeholders. The release-deploy workflow reads this file and substitutes real data into the placeholders.

---

### Task 2: Release workflow

Create [`.github/workflows/release.yml`](../../.github/workflows/release.yml). A `workflow_dispatch` workflow taking a `bump` choice (patch/minor/major). It reads the current version from `package.json`, computes the next semver, creates a `release/v*` branch with the bumped version, and opens a PR against `main`.

---

### Task 3: Release / Deploy workflow

Create [`.github/workflows/release-deploy.yml`](../../.github/workflows/release-deploy.yml). Triggers when a `release/v*` PR merges and:

1. Creates and pushes a git tag.
2. Collects merged PRs since the previous tag (via `gh pr list --search`), categorizing by conventional-commit prefix into Features / Fixes / Performance / Other.
3. Runs benchmarks (`bun run bench --json`) and formats them into a markdown table with `jq`.
4. Renders release notes by substituting the template placeholders.
5. Creates a draft GitHub Release.
6. Dispatches the docs-update workflow (`gh workflow run docs-update.lock.yml`).

---

### Task 4: Docs / Update agentic workflow

Create [`.github/workflows/docs-update.md`](../../.github/workflows/docs-update.md), a `gh aw` workflow that keeps `README.md`, `CLAUDE.md`, and `docs/*.md` accurate by reading the codebase as the source of truth and opening a PR with minimal, targeted updates (or exiting if nothing is stale). Runs weekly, after releases, or on manual dispatch.

Compile with `gh aw compile` to generate `.github/workflows/docs-update.lock.yml`.

---

### Task 5: Remove `private` from package.json

Delete the `"private": true` line in `package.json` so the package can be published.

---

### Task 6: Verify end-to-end

Confirm the expected commits (template, release, release-deploy, docs-update, package.json), validate the workflow YAML parses, and ensure CI still passes:

```bash
bun run typecheck
bun run lint
bun test
```
