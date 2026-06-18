# Release & Docs Workflows Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish semver releases with automated changelog/benchmarks, and an agentic docs-update workflow.

**Architecture:** Two standard GH Actions workflows handle the release lifecycle (open PR → merge → tag → draft release). One `gh aw` agentic workflow keeps docs current. A release notes template controls the format of draft releases.

**Tech Stack:** GitHub Actions, `gh` CLI, `jq`, Bun (benchmarks), `gh aw` (agentic workflow)

**Design doc:** `docs/plans/2026-03-13-release-and-docs-workflows-design.md`

> **Status:** Implemented. Each task below summarizes intent and points to the file it produced; the live files are the source of truth.

---

### Task 1: Release notes template

Create `.github/release-notes-template.md` — a markdown skeleton with `{{changes}}`, `{{benchmarks}}`, and `{{compare_url}}` placeholders that the release-deploy workflow fills in via shell substitution. Commit as `chore: add release notes template`.

---

### Task 2: Release workflow

Create `.github/workflows/release.yml` — a `workflow_dispatch` workflow taking a `bump` input (`patch`/`minor`/`major`). It reads the current version from `package.json`, computes the next semver, creates a `release/v*` branch, bumps `package.json`, and opens a PR against `main`. Needs `contents: write` and `pull-requests: write`. Commit as `ci: add release workflow`.

---

### Task 3: Release / Deploy workflow

Create `.github/workflows/release-deploy.yml` — triggered when a `release/v*` PR merges into `main`. It tags the release, collects merged PRs since the previous tag (categorized into Features/Fixes/Performance/Other), runs benchmarks and formats them as a table, renders the notes from the template, creates a **draft** GitHub Release, and dispatches the docs-update workflow. Needs `contents: write` and `actions: write`. Commit as `ci: add release-deploy workflow`.

---

### Task 4: Docs / Update agentic workflow

Create `.github/workflows/docs-update.md` — a `gh aw` workflow (weekly schedule + manual dispatch) that reads the codebase to determine truth, then makes minimal, targeted updates to `README.md`, `CLAUDE.md`, and `docs/*.md`, opening a `[docs-update]` PR (or exiting if nothing is stale). It verifies file trees, exports, and test/benchmark counts against reality, and does not add new docs or touch source code. Compile with `gh aw compile` to generate `docs-update.lock.yml` (note for the user if `gh aw` is unavailable). Commit both files as `ci: add docs-update agentic workflow`.

---

### Task 5: Remove `private` from package.json

Delete the `"private": true` line so the package can be published. Run `bun run typecheck` and `bun run lint`, then commit as `chore: remove private flag from package.json`.

---

### Task 6: Verify end-to-end

Review the five new commits (`git log --oneline main..HEAD`), validate the workflow YAML parses, and confirm CI still passes (`bun run typecheck`, `bun run lint`, `bun test`). Add a final fix-up commit only if needed.
