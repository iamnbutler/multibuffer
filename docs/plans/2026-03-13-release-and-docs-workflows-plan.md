# Release & Docs Workflows Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish semver releases with automated changelog/benchmarks, and an agentic docs-update workflow.

**Architecture:** Two standard GH Actions workflows handle the release lifecycle (open PR → merge → tag → draft release). One `gh aw` agentic workflow keeps docs current. A release notes template controls the format of draft releases.

**Tech Stack:** GitHub Actions, `gh` CLI, `jq`, Bun (benchmarks), `gh aw` (agentic workflow)

**Design doc:** `docs/plans/2026-03-13-release-and-docs-workflows-design.md`

---

### Task 1: Release notes template

Create `.github/release-notes-template.md` with `{{changes}}`, `{{benchmarks}}`, and `{{compare_url}}` placeholders. The release-deploy workflow populates these via `sed`. Commit as `chore: add release notes template`.

---

### Task 2: Release workflow

Create `.github/workflows/release.yml` — `workflow_dispatch` with a `bump` choice input (`major | minor | patch`). Reads version from `package.json`, computes new version, creates branch `release/v{version}`, bumps `package.json`, and opens a PR. Commit as `ci: add release workflow`.

---

### Task 3: Release / Deploy workflow

Create `.github/workflows/release-deploy.yml` — triggers on merge of `release/v*` PRs. Steps:
1. Create and push git tag
2. Collect merged PRs since previous tag via `gh pr list`
3. Run `bun run bench --json` and format output as a markdown table with `jq`
4. Render release notes from `.github/release-notes-template.md`
5. Create draft GitHub Release via `gh release create`
6. Dispatch `docs-update.lock.yml`

Commit as `ci: add release-deploy workflow`.

---

### Task 4: Docs / Update agentic workflow

Create `.github/workflows/docs-update.md` — `gh aw` workflow definition. Triggers: `schedule: weekly` + `workflow_dispatch`. Reads codebase to verify claims, then updates `README.md`, `CLAUDE.md`, and `docs/*.md` with minimal targeted edits. Creates a PR or exits gracefully if nothing is stale.

Run `gh aw compile` to generate `.github/workflows/docs-update.lock.yml`. Commit both as `ci: add docs-update agentic workflow`.

---

### Task 5: Remove `private` from package.json

Delete `"private": true,` from `package.json`. Run `bun run typecheck && bun run lint`. Commit as `chore: remove private flag from package.json`.

---

### Task 6: Verify end-to-end

```bash
git log --oneline main..HEAD  # expect 5 commits
bun run typecheck && bun run lint && bun test
```
