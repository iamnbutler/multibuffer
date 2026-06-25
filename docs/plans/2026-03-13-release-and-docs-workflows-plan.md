# Release & Docs Workflows Implementation Plan

> **Status:** Implemented. All tasks below have shipped; this document is retained as the historical plan of record. See the referenced files for current source.

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish semver releases with automated changelog/benchmarks, and an agentic docs-update workflow.

**Architecture:** Two standard GH Actions workflows handle the release lifecycle (open PR → merge → tag → draft release). One `gh aw` agentic workflow keeps docs current. A release notes template controls the format of draft releases.

**Tech Stack:** GitHub Actions, `gh` CLI, `jq`, Bun (benchmarks), `gh aw` (agentic workflow)

**Design doc:** `docs/plans/2026-03-13-release-and-docs-workflows-design.md`

---

### Task 1: Release notes template

Create `.github/release-notes-template.md` with `{{changes}}`, `{{benchmarks}}`, and `{{compare_url}}` placeholders. The release-deploy workflow reads it and substitutes real data via shell parameter expansion.

### Task 2: Release workflow

Create `.github/workflows/release.yml`. A `workflow_dispatch` job (input: `bump` = patch/minor/major) computes the next semver from `package.json`, bumps it on a `release/v*` branch, and opens a release PR against `main`.

### Task 3: Release / Deploy workflow

Create `.github/workflows/release-deploy.yml`. Triggered when a `release/v*` PR merges, it: tags and pushes the version, collects merged PRs since the previous tag and categorizes them (feat/fix/perf/other) with `jq`, runs benchmarks into a formatted table, renders release notes from the Task 1 template, creates a draft GitHub Release, and dispatches the docs-update workflow.

### Task 4: Docs / Update agentic workflow

Create `.github/workflows/docs-update.md` — a `gh aw` workflow (weekly + dispatch) that reads the codebase to determine truth, then updates `README.md`, `CLAUDE.md`, and `docs/*.md` to match, opening a PR with minimal targeted diffs or exiting if nothing is stale. Compile with `gh aw compile` to generate `docs-update.lock.yml`.

### Task 5: Remove `private` from package.json

Delete the `"private": true` line so the package can be published.

### Task 6: Verify end-to-end

Confirm 5 commits (template, release, release-deploy, docs-update, package.json), validate the workflow YAML parses, and ensure `bun run typecheck`, `bun run lint`, and `bun test` all pass.
