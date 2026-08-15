# Release & Docs Workflows Implementation Plan

**Status:** Complete. All six tasks below shipped; every file listed exists on disk.

**Goal:** Establish semver releases with automated changelog/benchmarks, and an agentic docs-update workflow.

**Architecture:** Two standard GH Actions workflows handle the release lifecycle (open PR → merge → tag → draft release). One `gh aw` agentic workflow keeps docs current. A release notes template controls the format of draft releases.

**Tech Stack:** GitHub Actions, `gh` CLI, `jq`, Bun (benchmarks), `gh aw` (agentic workflow)

**Design doc:** `docs/plans/2026-03-13-release-and-docs-workflows-design.md`

> This plan originally inlined the full source of every file it created. Those copies have since drifted from what shipped, so they were replaced with pointers to the real files. **The files on disk are authoritative — read them, not a description of them.**

Each task was committed separately with the message shown.

---

### Task 1: Release notes template

**Creates:** `.github/release-notes-template.md` — commit `chore: add release notes template`

Holds the three placeholders `{{changes}}`, `{{benchmarks}}`, and `{{compare_url}}`, substituted by release-deploy via bash string replacement (not `sed`).

---

### Task 2: Release workflow

**Creates:** `.github/workflows/release.yml` — commit `ci: add release workflow`

Manual `workflow_dispatch` with a `bump` choice input (`major | minor | patch`). Computes the next semver from `package.json`, creates a `release/v*` branch, bumps the version, and opens a PR against `main`. Aborts with an error if the release branch already exists, so two releases can't run concurrently.

---

### Task 3: Release / Deploy workflow

**Creates:** `.github/workflows/release-deploy.yml` — commit `ci: add release-deploy workflow`

Triggers when a `release/v*` PR merges into `main`. It creates and pushes the git tag, collects merged PRs since the previous tag, runs benchmarks, renders the release notes from the template, creates a **draft** GitHub Release, and dispatches docs-update.

Non-obvious details worth preserving:

- PRs are bucketed by conventional-commit prefix into Features / Fixes / Performance / Other; the `release:` PR itself is filtered out.
- The previous tag's cutoff uses the **committer** date (`git log -1 --format=%cI`), not the author date — rebased commits keep stale author dates and would silently drop PRs from the changelog.
- Benchmarks never block the release. A missed target renders as a `FAIL` row in the notes table for visibility only.
- The docs-update dispatch is non-blocking and logs a warning on failure rather than failing the job.

---

### Task 4: Docs / Update agentic workflow

**Creates:** `.github/workflows/docs-update.md` — commit `ci: add docs-update agentic workflow`

A `gh aw` workflow that reads the codebase to determine truth, then updates `README.md`, `CLAUDE.md`, and `docs/*.md` to match. Runs weekly, after releases, or on manual dispatch; opens a PR or exits cleanly when nothing is stale. Its operating principles (accuracy over prose, terse, minimal diffs) and its explicit non-goals live in the workflow body.

Note `skip-if-match` is nested **under `on:`**, not a top-level key.

Compile with `gh aw compile` to generate `.github/workflows/docs-update.lock.yml`; commit the lock file alongside the source.

---

### Task 5: Remove `private` from package.json

**Modifies:** `package.json` — commit `chore: remove private flag from package.json`

Delete the `"private": true` line so the package can be published, then run `bun run typecheck` and `bun run lint`.

---

### Task 6: Verify end-to-end

Expect 5 commits (`git log --oneline main..HEAD`) — template, release, release-deploy, docs-update, package.json.

Validate that both new workflows parse:

```bash
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release.yml'))"
python3 -c "import yaml; yaml.safe_load(open('.github/workflows/release-deploy.yml'))"
```

Then confirm CI is green:

```bash
bun run typecheck
bun run lint
bun test
```
