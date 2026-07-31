# Release & Docs Workflows Implementation Plan

> **Status:** Implemented. Every task below is complete and the files listed are live in the repo. The links point at the current versions, which have since evolved past what this plan originally specified.

**Goal:** Establish semver releases with automated changelog/benchmarks, and an agentic docs-update workflow.

**Architecture:** Two standard GH Actions workflows handle the release lifecycle (open PR → merge → tag → draft release). One `gh aw` agentic workflow keeps docs current. A release notes template controls the format of draft releases.

**Tech Stack:** GitHub Actions, `gh` CLI, `jq`, Bun (benchmarks), `gh aw` (agentic workflow)

**Design doc:** [`2026-03-13-release-and-docs-workflows-design.md`](./2026-03-13-release-and-docs-workflows-design.md)

---

### Task 1: Release notes template

Create [`.github/release-notes-template.md`](../../.github/release-notes-template.md) with `{{changes}}`, `{{benchmarks}}`, and `{{compare_url}}` placeholders. The release-deploy workflow reads this file and substitutes real data at release time.

Commit: `chore: add release notes template`

---

### Task 2: Release workflow

Create [`.github/workflows/release.yml`](../../.github/workflows/release.yml). Triggered by `workflow_dispatch` with a `bump` choice input (patch/minor/major). It reads the current version from `package.json`, computes the next semver, creates a `release/v*` branch, bumps `package.json`, pushes, and opens a PR against `main`.

Needs `contents: write` and `pull-requests: write`.

Commit: `ci: add release workflow`

---

### Task 3: Release / Deploy workflow

Create [`.github/workflows/release-deploy.yml`](../../.github/workflows/release-deploy.yml). Triggered when a `release/v*` PR merges into `main`. It:

1. Creates and pushes a git tag
2. Collects merged PRs since the previous tag, categorized into Features / Fixes / Performance / Other
3. Runs benchmarks (`bun run bench --json`) and formats them into a markdown table
4. Renders release notes from the Task 1 template
5. Creates a draft GitHub Release
6. Dispatches `docs-update.lock.yml`

Needs `contents: write` and `actions: write`, plus `fetch-depth: 0` on checkout so `git describe` can find the previous tag.

Commit: `ci: add release-deploy workflow`

---

### Task 4: Docs / Update agentic workflow

Create [`.github/workflows/docs-update.md`](../../.github/workflows/docs-update.md) — a `gh aw` workflow that reads the codebase to determine truth, then updates `README.md`, `CLAUDE.md`, and `docs/*.md` to match. Runs weekly or on dispatch, opens a `[docs-update]` PR, and exits gracefully when nothing is stale. Its guiding principles are accuracy over prose, terseness, describing what exists rather than aspirations, and minimal diffs.

Run `gh aw compile` to generate `.github/workflows/docs-update.lock.yml`, then commit both files.

Commit: `ci: add docs-update agentic workflow`

---

### Task 5: Remove `private` from package.json

Delete the `"private": true` line from `package.json` so the package can be published, then run `bun run typecheck` and `bun run lint`.

Commit: `chore: remove private flag from package.json`

---

### Task 6: Verify end-to-end

Confirm 5 commits on the branch (`git log --oneline main..HEAD`), that both new workflow YAML files parse, and that `bun run typecheck`, `bun run lint`, and `bun test` all pass.
