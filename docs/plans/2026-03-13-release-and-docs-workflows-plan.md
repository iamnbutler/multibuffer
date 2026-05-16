# Release & Docs Workflows Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish semver releases with automated changelog/benchmarks, and an agentic docs-update workflow.

**Architecture:** Two standard GH Actions workflows handle the release lifecycle (open PR → merge → tag → draft release). One `gh aw` agentic workflow keeps docs current. A release notes template controls the format of draft releases.

**Tech Stack:** GitHub Actions, `gh` CLI, `jq`, Bun (benchmarks), `gh aw` (agentic workflow)

**Design doc:** `docs/plans/2026-03-13-release-and-docs-workflows-design.md`

---

### Task 1: Release notes template

Create `.github/release-notes-template.md` with `{{changes}}`, `{{benchmarks}}`, and `{{compare_url}}` placeholders. The release-deploy workflow substitutes these via `sed`. Commit as `chore: add release notes template`.

---

### Task 2: Release workflow

Create `.github/workflows/release.yml`: a `workflow_dispatch` job with a `bump` choice input (`patch`/`minor`/`major`). Reads current version from `package.json`, computes the next version, creates a `release/v<version>` branch, bumps `package.json`, pushes, and opens a PR. Commit as `ci: add release workflow`.

---

### Task 3: Release / Deploy workflow

Create `.github/workflows/release-deploy.yml`: triggers when a `release/v*` PR merges to `main`. Steps:
1. Tag the merge commit and push
2. Find previous tag, collect merged PRs since then via `gh pr list --search`
3. Categorize PRs by conventional-commit prefix (`feat`/`fix`/`perf`/other)
4. Run `bun run bench --json` and format results as a markdown table with `µs`/`ms`/ops-per-sec/target/status columns
5. Render release notes from the template via shell variable substitution
6. Create a draft GitHub Release with `gh release create --draft`
7. Dispatch the docs-update workflow (`gh workflow run docs-update.lock.yml`)

Commit as `ci: add release-deploy workflow`.

---

### Task 4: Docs / Update agentic workflow

Create `.github/workflows/docs-update.md` (gh aw definition): runs weekly + on dispatch, read-only permissions, imports `shared/formatting.md` and `shared/reporting.md`, emits a single `create-pull-request` safe-output with `[docs-update] ` title prefix.

The agent reads `package.json`, `src/` structure, and existing docs, then compares against reality to find stale content (wrong paths/counts, mismatched exports, outdated architecture, filler). Targets: `README.md`, `CLAUDE.md`, `docs/glossary.md`, `docs/bindings.md`. Applies minimal targeted edits, runs `bun run typecheck` + `bun run lint`, opens a PR. Exits gracefully if nothing is stale. Does NOT add new sections, write tutorials, or change source code.

After authoring, run `gh aw compile` to generate `.github/workflows/docs-update.lock.yml`. Commit as `ci: add docs-update agentic workflow`.

---

### Task 5: Remove `private` from package.json

Delete `"private": true` from `package.json`. Run `bun run typecheck` and `bun run lint`. Commit as `chore: remove private flag from package.json`.

---

### Task 6: Verify end-to-end

Confirm 5 commits exist (`git log --oneline main..HEAD`), validate workflow YAML parses, and run `bun run typecheck` / `bun run lint` / `bun test`. Fix any issues with an additional commit.
