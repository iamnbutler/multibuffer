# Release & Docs Workflows Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Status:** Implemented. All files below now exist in the repo; this plan is kept as a historical record. See the live files for authoritative source.

**Goal:** Establish semver releases with automated changelog/benchmarks, and an agentic docs-update workflow.

**Architecture:** Two standard GH Actions workflows handle the release lifecycle (open PR → merge → tag → draft release). One `gh aw` agentic workflow keeps docs current. A release notes template controls the format of draft releases.

**Tech Stack:** GitHub Actions, `gh` CLI, `jq`, Bun (benchmarks), `gh aw` (agentic workflow)

**Design doc:** `docs/plans/2026-03-13-release-and-docs-workflows-design.md`

---

### Task 1: Release notes template

Create [`.github/release-notes-template.md`](../../.github/release-notes-template.md) — the `{{changes}}` / `{{benchmarks}}` / `{{compare_url}}` placeholders are read and substituted by the release-deploy workflow.

### Task 2: Release workflow

Create [`.github/workflows/release.yml`](../../.github/workflows/release.yml) — `workflow_dispatch` with a `bump` choice (patch/minor/major). Computes the next version from `package.json`, bumps it on a `release/v*` branch, and opens a PR against `main`.

### Task 3: Release / Deploy workflow

Create [`.github/workflows/release-deploy.yml`](../../.github/workflows/release-deploy.yml) — triggers when a `release/v*` PR merges. It tags and pushes the version, collects merged PRs since the previous tag (categorized into Features/Fixes/Performance/Other), runs benchmarks into a table, renders release notes from the template, creates a draft GitHub Release, and dispatches the docs-update workflow.

### Task 4: Docs / Update agentic workflow

Create [`.github/workflows/docs-update.md`](../../.github/workflows/docs-update.md) — a `gh aw` workflow (weekly / post-release / manual) that reads the codebase to determine truth, updates `README.md`, `CLAUDE.md`, and `docs/*.md` to match, and opens a PR (or exits if nothing is stale). Compile with `gh aw compile` to generate `docs-update.lock.yml`.

### Task 5: Remove `private` from package.json

Delete the `"private": true` line so the package can be published, then run `bun run typecheck` and `bun run lint`.

### Task 6: Verify end-to-end

Review the new files (`git log --oneline main..HEAD`, expecting 5 commits), validate the workflow YAML parses, and confirm `bun run typecheck`, `bun run lint`, and `bun test` all pass.
