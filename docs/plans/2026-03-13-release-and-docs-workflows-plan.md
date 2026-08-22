# Release & Docs Workflows Implementation Plan

**Status:** Complete. All six tasks shipped. The files linked below are on disk and are authoritative — they have since evolved past this plan, so read them rather than these summaries when you need exact content.

**Goal:** Establish semver releases with automated changelog/benchmarks, and an agentic docs-update workflow.

**Architecture:** Two standard GH Actions workflows handle the release lifecycle (open PR → merge → tag → draft release). One `gh aw` agentic workflow keeps docs current. A release notes template controls the format of draft releases.

**Tech Stack:** GitHub Actions, `gh` CLI, `jq`, Bun (benchmarks), `gh aw` (agentic workflow)

**Design doc:** [`2026-03-13-release-and-docs-workflows-design.md`](2026-03-13-release-and-docs-workflows-design.md)

---

### Task 1: Release notes template

Create [`.github/release-notes-template.md`](../../.github/release-notes-template.md) with `{{changes}}`, `{{benchmarks}}` and `{{compare_url}}` placeholders. Release / Deploy reads the file and substitutes real values with bash string replacement (`NOTES="${NOTES//\{\{changes\}\}/$CHANGES}"`) — not `sed`.

Commit: `chore: add release notes template`

---

### Task 2: Release workflow

Create [`.github/workflows/release.yml`](../../.github/workflows/release.yml): a `workflow_dispatch` workflow taking a `patch`/`minor`/`major` bump choice. It reads the current version from `package.json` with `jq`, computes the next semver, creates a `release/v<version>` branch, bumps `package.json`, and opens a PR titled `release: v<version>` against `main`.

The shipped file aborts with `::error::` if `git ls-remote --exit-code --heads` finds the release branch already on origin. That guard was not in the original plan; it stops two concurrent releases from clobbering each other.

Commit: `ci: add release workflow`

---

### Task 3: Release / Deploy workflow

Create [`.github/workflows/release-deploy.yml`](../../.github/workflows/release-deploy.yml): triggers when a `release/v*` PR merges into `main`. It creates and pushes the tag, collects merged PRs since the previous tag, runs benchmarks, renders release notes from the template, creates a draft GitHub Release, and dispatches docs-update.

Decisions that the file alone makes easy to miss:

- PRs are bucketed by conventional-commit prefix into Features / Fixes / Performance / Other, and titles starting with `release:` are filtered out so the release PR never appears in its own notes.
- The "since previous tag" cutoff uses `git log -1 --format=%cI` (committer date). Author dates go stale on rebase, which would silently drop merged PRs from the changelog.
- Benchmarks never block the release; a missed target renders as a `FAIL` row in the notes table for visibility.
- The release is created as a **draft** so a human reviews the generated notes before publishing.
- The docs-update dispatch is non-blocking — failure logs a warning rather than failing the release.

Commit: `ci: add release-deploy workflow`

---

### Task 4: Docs / Update agentic workflow

Create [`.github/workflows/docs-update.md`](../../.github/workflows/docs-update.md): a `gh aw` workflow that reads the codebase to determine truth, then updates `README.md`, `CLAUDE.md` and `docs/*.md` to match, opening a `[docs-update]` PR or exiting when nothing is stale. It runs weekly, on manual dispatch, and after releases. Note that `skip-if-match` is nested under `on:` in the shipped file, not a top-level key.

Then run `gh aw compile` to generate `.github/workflows/docs-update.lock.yml`. The `.lock.yml` is what Actions actually runs, so commit it alongside the `.md`. If `gh aw` is unavailable in your environment, flag this step for the user to run manually.

Commit: `ci: add docs-update agentic workflow`

---

### Task 5: Remove `private` from package.json

Delete the `"private": true` line from `package.json` so the package can be published, then run `bun run typecheck` and `bun run lint`.

Commit: `chore: remove private flag from package.json`

---

### Task 6: Verify end-to-end

Review the five commits with `git log --oneline main..HEAD`, confirm both release workflow YAML files parse, and check that `bun run typecheck`, `bun run lint` and `bun test` still pass.
