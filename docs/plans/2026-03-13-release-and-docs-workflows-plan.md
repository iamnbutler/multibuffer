# Release & Docs Workflows Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Status:** Implemented. This plan is retained as a record; the source it once inlined now lives in the repo and is linked per task below.

**Goal:** Establish semver releases with automated changelog/benchmarks, and an agentic docs-update workflow.

**Architecture:** Two standard GH Actions workflows handle the release lifecycle (open PR → merge → tag → draft release). One `gh aw` agentic workflow keeps docs current. A release notes template controls the format of draft releases.

**Tech Stack:** GitHub Actions, `gh` CLI, `jq`, Bun (benchmarks), `gh aw` (agentic workflow)

**Design doc:** `docs/plans/2026-03-13-release-and-docs-workflows-design.md`

---

### Task 1: Release notes template

Create [`.github/release-notes-template.md`](../../.github/release-notes-template.md) — a `## What's Changed` / `## Benchmarks` / `**Full Changelog**` skeleton with `{{changes}}`, `{{benchmarks}}`, and `{{compare_url}}` placeholders that the release-deploy workflow fills via string replacement.

### Task 2: Release workflow

Create [`.github/workflows/release.yml`](../../.github/workflows/release.yml) — a `workflow_dispatch` workflow taking a `patch`/`minor`/`major` bump input. It reads the current version from `package.json`, computes the next version, creates a `release/v*` branch, bumps `package.json`, and opens a release PR.

### Task 3: Release / Deploy workflow

Create [`.github/workflows/release-deploy.yml`](../../.github/workflows/release-deploy.yml) — triggered when a `release/v*` PR merges to `main`. It tags the commit, collects merged PRs since the previous tag (categorized into Features/Fixes/Performance/Other), runs benchmarks and formats them into a table, renders release notes from the template, creates a draft GitHub Release, and dispatches the docs-update workflow.

### Task 4: Docs / Update agentic workflow

Create [`.github/workflows/docs-update.md`](../../.github/workflows/docs-update.md) — a `gh aw` workflow (weekly + `workflow_dispatch`) that reads the codebase to determine truth, then makes minimal, targeted corrections to `README.md`, `CLAUDE.md`, and `docs/*.md`, opening a PR only when something is stale. Compile with `gh aw compile` to generate `docs-update.lock.yml`.

### Task 5: Remove `private` from package.json

Delete the `"private": true` line from `package.json` so the package can be published.

### Task 6: Verify end-to-end

Confirm the five commits (template, release, release-deploy, docs-update, package.json), validate the workflow YAML parses, and ensure `bun run typecheck`, `bun run lint`, and `bun test` pass.
