# Release & Docs Workflows Implementation Plan

> **Status: shipped.** All six tasks below are implemented. The files under `.github/` are
> authoritative and have evolved past this plan — read them, not this document, for current
> behaviour. Kept as a record of intent and of the decisions the YAML doesn't explain.

**Goal:** Establish semver releases with automated changelog/benchmarks, and an agentic docs-update workflow.

**Architecture:** Two standard GH Actions workflows handle the release lifecycle (open PR → merge → tag → draft release). One `gh aw` agentic workflow keeps docs current. A release notes template controls the format of draft releases.

**Tech Stack:** GitHub Actions, `gh` CLI, `jq`, Bun (benchmarks), `gh aw` (agentic workflow)

**Design doc:** [`2026-03-13-release-and-docs-workflows-design.md`](2026-03-13-release-and-docs-workflows-design.md)

---

### Task 1: Release notes template

Create [`.github/release-notes-template.md`](../../.github/release-notes-template.md) with `{{changes}}`, `{{benchmarks}}`, and `{{compare_url}}` placeholders. The release-deploy workflow reads it and substitutes real data using bash parameter expansion (`${NOTES//\{\{changes\}\}/$CHANGES}`) — not `sed`.

Commit: `chore: add release notes template`

---

### Task 2: Release workflow

Create [`.github/workflows/release.yml`](../../.github/workflows/release.yml): a `workflow_dispatch` workflow taking a `bump` choice input (patch/minor/major). It reads the current version from `package.json`, computes the next one, opens a `release/v<version>` branch with the bumped `package.json`, and files a PR against `main`.

Before branching it runs a `git ls-remote --exit-code --heads` check and `::error::`-aborts if the release branch already exists on origin, so two concurrent dispatches can't collide.

Commit: `ci: add release workflow`

---

### Task 3: Release / Deploy workflow

Create [`.github/workflows/release-deploy.yml`](../../.github/workflows/release-deploy.yml): triggered on `pull_request: [closed]` against `main`, gated on the PR being merged from a `release/v*` head. It tags and pushes, collects merged PRs since the previous tag, runs benchmarks, renders the notes template, creates a draft release, and dispatches docs-update.

Decisions worth keeping:

- **Previous-tag date uses `git log -1 --format=%cI` (committer date), not `%aI`.** Rebased commits keep their original author date, which would silently drop merged PRs from the changelog window.
- **PRs are bucketed by conventional-commit prefix** into Features / Fixes / Performance / Other, with `release:`-titled PRs filtered out so the release PR doesn't list itself.
- **Benchmarks never block the release.** Target misses render as `FAIL` rows in the table so they stay visible without gating the deploy.
- **The release is created as a draft** so a human reviews the notes before publishing.
- **The docs-update dispatch is non-blocking**, logging a warning on failure rather than swallowing it with `|| true`.

Commit: `ci: add release-deploy workflow`

---

### Task 4: Docs / Update agentic workflow

Create [`.github/workflows/docs-update.md`](../../.github/workflows/docs-update.md): a `gh aw` workflow that reads the codebase to determine truth, then updates `README.md`, `CLAUDE.md`, and `docs/*.md` to match. Weekly schedule plus manual dispatch, `read-all` permissions, and a `create-pull-request` safe output prefixed `[docs-update] `.

Note `skip-if-match` is nested **under `on:`**, alongside `schedule` and `workflow_dispatch` — not a top-level key.

Then run `gh aw compile` to generate `docs-update.lock.yml` and commit it alongside the `.md`.

Commit: `ci: add docs-update agentic workflow`

---

### Task 5: Remove `private` from package.json

Delete the `"private": true` line so the package can be published, then run `bun run typecheck` and `bun run lint`.

Commit: `chore: remove private flag from package.json`

---

### Task 6: Verify end-to-end

Review the five commits, confirm both release workflows are valid YAML, and check `bun run typecheck`, `bun run lint`, and `bun test` still pass.
