# Release & Docs Workflows Implementation Plan

> **Status: implemented.** Every task below has shipped, and the live files have since evolved past this plan. This document is kept as a record of intent — **the files it links to are authoritative.** See [Drift from the live files](#drift-from-the-live-files) for the known differences.

**Goal:** Establish semver releases with automated changelog/benchmarks, and an agentic docs-update workflow.

**Architecture:** Two standard GH Actions workflows handle the release lifecycle (open PR → merge → tag → draft release). One `gh aw` agentic workflow keeps docs current. A release notes template controls the format of draft releases.

**Tech Stack:** GitHub Actions, `gh` CLI, `jq`, Bun (benchmarks), `gh aw` (agentic workflow)

**Design doc:** [`2026-03-13-release-and-docs-workflows-design.md`](./2026-03-13-release-and-docs-workflows-design.md)

---

## Tasks

### Task 1: Release notes template

Create [`.github/release-notes-template.md`](../../.github/release-notes-template.md) — a `What's Changed` / `Benchmarks` / `Full Changelog` skeleton with `{{changes}}`, `{{benchmarks}}`, and `{{compare_url}}` placeholders. The release-deploy workflow reads it and substitutes real data.

### Task 2: Release workflow

Create [`.github/workflows/release.yml`](../../.github/workflows/release.yml). Manual `workflow_dispatch` with a `bump` choice (patch/minor/major). It reads the current version from `package.json` with `jq`, computes the next semver in shell, branches to `release/v<version>`, bumps `package.json`, and opens a PR against `main` with `gh pr create`. Needs `contents: write` and `pull-requests: write`.

### Task 3: Release / Deploy workflow

Create [`.github/workflows/release-deploy.yml`](../../.github/workflows/release-deploy.yml). Triggers on a `release/v*` PR closing as merged. It tags the release and pushes the tag, finds the previous tag via `git describe`, collects merged PRs since then with `gh pr list --search`, categorizes them by conventional-commit prefix into Features / Fixes / Performance / Other, runs `bun run bench --json`, formats the results into a markdown table with `jq`, renders the template, creates a **draft** GitHub Release, and dispatches docs-update. Needs `contents: write` and `actions: write`, plus a full-depth checkout so tag history is available.

### Task 4: Docs / Update agentic workflow

Create [`.github/workflows/docs-update.md`](../../.github/workflows/docs-update.md) and compile it with `gh aw compile` to generate [`docs-update.lock.yml`](../../.github/workflows/docs-update.lock.yml). It runs weekly or on dispatch, reads the codebase to establish ground truth, and opens a `[docs-update]` PR updating `README.md`, `CLAUDE.md`, and `docs/*.md` — or exits cleanly when nothing is stale. Its guiding principles are accuracy over prose, terseness, describing only what exists, and minimal diffs. It imports [`shared/formatting.md`](../../.github/workflows/shared/formatting.md) and [`shared/reporting.md`](../../.github/workflows/shared/reporting.md), and explicitly does *not* add new doc files, write tutorials, touch source code, or rewrite accurate docs for style.

### Task 5: Publishable package

Remove `"private": true` from [`package.json`](../../package.json), then run `bun run typecheck` and `bun run lint`.

### Task 6: Verify end-to-end

Confirm five commits (template, release, release-deploy, docs-update, package.json), check both new YAML files parse, and run `bun run typecheck && bun run lint && bun test`.

---

## Drift from the live files

This plan originally embedded each file verbatim. Those dumps had fallen out of date, so they were replaced with the summaries above. The differences found when they were removed are recorded here — in each case **the live file is correct**:

| File | Plan said | Live file does |
|---|---|---|
| `release.yml` | Created the release branch unconditionally | Guards first with `git ls-remote --exit-code --heads`, erroring out if a release is already in progress |
| `release-deploy.yml` | `git log -1 --format=%aI` for the previous tag's date | Uses `%cI` (committer date), which is what tag history actually orders by |
| `release-deploy.yml` | `gh workflow run docs-update.lock.yml \|\| true` | Logs an explicit non-blocking warning instead of silently swallowing the failure |
| `release-deploy.yml` | — | Carries two comments noting that benchmarks are recorded for visibility but never block a release |
| `docs-update.md` | `skip-if-match` declared as a top-level key | Declared under `on:` |

**Verified as still accurate:** the release-notes template's three placeholders and their substitution; the benchmark `jq` contract — it destructures `.[] | .suite as $s | .results[]` reading `name`, `avgMs`, `opsPerSec`, `targetMs`, and `passed`, which matches `SuiteResult` and `BenchmarkResult` in `benchmarks/harness.ts` field for field; and `bun run bench --json`, which `benchmarks/index.ts` supports via a `--json` argv check that silences the human-readable output.
