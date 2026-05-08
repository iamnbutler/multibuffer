# Release & Docs Workflows Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish semver releases with automated changelog/benchmarks, and an agentic docs-update workflow.

**Architecture:** Two standard GH Actions workflows handle the release lifecycle (open PR → merge → tag → draft release). One `gh aw` agentic workflow keeps docs current. A release notes template controls the format of draft releases.

**Tech Stack:** GitHub Actions, `gh` CLI, `jq`, Bun (benchmarks), `gh aw` (agentic workflow)

**Design doc:** `docs/plans/2026-03-13-release-and-docs-workflows-design.md`

---

### Task 1: Release notes template

Create `.github/release-notes-template.md` with `{{changes}}`, `{{benchmarks}}`, and `{{compare_url}}` placeholders. The release-deploy workflow substitutes these via `sed`. Commit as `chore: add release notes template`.

### Task 2: Release workflow

Create `.github/workflows/release.yml` (a `workflow_dispatch` job with `bump: patch|minor|major` input). It reads `package.json` version, computes the next semver, creates a `release/v*` branch, bumps `package.json`, pushes, and opens a PR via `gh`. Commit as `ci: add release workflow`.

### Task 3: Release / Deploy workflow

Create `.github/workflows/release-deploy.yml`, triggered when a `release/v*` PR merges to `main`. Steps: tag and push `vX.Y.Z`, find the previous tag, collect merged PRs since then via `gh pr list` (categorized by `feat`/`fix`/`perf`/other), run `bun run bench --json` and format a results table with `jq`, render the release-notes template, create a draft GitHub Release, and dispatch `docs-update.lock.yml`. Commit as `ci: add release-deploy workflow`.

### Task 4: Docs / Update agentic workflow

Create `.github/workflows/docs-update.md` — a `gh aw` workflow on a weekly schedule + `workflow_dispatch`. It reads `package.json`, source layout, and existing docs; identifies stale claims (wrong paths, wrong test/benchmark counts, wrong exports, filler); applies minimal targeted edits; runs `bun run typecheck` and `bun run lint`; opens a PR titled `[docs-update] …` with `docs`/`automation` labels (1d expiry). Run `gh aw compile` to generate `.lock.yml`, then commit as `ci: add docs-update agentic workflow`.

### Task 5: Remove `private` from package.json

Delete the `"private": true` line in `package.json`. Run `bun run typecheck` and `bun run lint`. Commit as `chore: remove private flag from package.json`.

### Task 6: Verify end-to-end

Confirm 5 commits (`git log --oneline main..HEAD`), validate workflow YAML parses, and run `bun run typecheck && bun run lint && bun test`. Commit any fixes.
