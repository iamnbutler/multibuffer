# Release & Docs Workflows Implementation Plan

> **Status:** Implemented. The files described below now exist in the repo and are the source of truth — this plan is retained as a record of the work. Code excerpts have been replaced with references to the shipped files.

**Goal:** Establish semver releases with automated changelog/benchmarks, and an agentic docs-update workflow.

**Architecture:** Two standard GH Actions workflows handle the release lifecycle (open PR → merge → tag → draft release). One `gh aw` agentic workflow keeps docs current. A release notes template controls the format of draft releases.

**Tech Stack:** GitHub Actions, `gh` CLI, `jq`, Bun (benchmarks), `gh aw` (agentic workflow)

**Design doc:** `docs/plans/2026-03-13-release-and-docs-workflows-design.md`

---

### Task 1: Release notes template

Create `.github/release-notes-template.md` — a markdown skeleton with `{{changes}}`, `{{benchmarks}}`, and `{{compare_url}}` placeholders. The release-deploy workflow reads this file and substitutes real data into the placeholders.

### Task 2: Release workflow

Create `.github/workflows/release.yml` — a `workflow_dispatch` job taking a `bump` input (`patch`/`minor`/`major`). It reads the current version from `package.json`, computes the next semver, creates a `release/v*` branch, bumps `package.json`, and opens a release PR via `gh pr create`.

### Task 3: Release / Deploy workflow

Create `.github/workflows/release-deploy.yml` — triggered when a `release/v*` PR merges into `main`. It tags the merge commit, collects merged PRs since the previous tag (categorizing by `feat`/`fix`/`perf`/other), runs benchmarks and renders them as a table, fills the Task 1 template, creates a **draft** GitHub Release, and dispatches the docs-update workflow.

### Task 4: Docs / Update agentic workflow

Create `.github/workflows/docs-update.md` — a `gh aw` workflow that reads the codebase to determine truth, then updates `README.md`, `CLAUDE.md`, and `docs/*.md` to match, opening a PR (or exiting if nothing is stale). Runs weekly, after releases, or on manual dispatch. Compile with `gh aw compile` to generate `docs-update.lock.yml`.

### Task 5: Remove `private` from package.json

Delete the `"private": true` line so the package can be published, then run `bun run typecheck` and `bun run lint`.

---

### Task 6: Verify end-to-end

Review the new files (`git log --oneline main..HEAD` — expect 5 commits), validate the workflow YAML parses, and confirm `bun run typecheck`, `bun run lint`, and `bun test` all pass.
