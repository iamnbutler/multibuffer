# Release & Docs Workflows Design

> **Status: shipped.** All five items below exist. The live files are authoritative; this document records the original design and the points where the implementation diverged from it — see [Drift from the live files](#drift-from-the-live-files).

## Overview

Three workflows to establish semver releases and keep docs current:

1. **[Release](../../.github/workflows/release.yml)** — manual `workflow_dispatch`, bumps version, opens PR
2. **[Release / Deploy](../../.github/workflows/release-deploy.yml)** — triggers on merge of the release PR, tags and creates a draft GitHub Release with notes and benchmarks
3. **[Docs / Update](../../.github/workflows/docs-update.md)** — `gh aw` agentic workflow, weekly + post-release, updates all docs

## 1. Release (`release.yml`)

Standard GitHub Actions workflow (not `gh aw`), triggered by `workflow_dispatch` with a `bump` input (`major | minor | patch`). It reads the current version from `package.json`, computes the next one, creates branch `release/v{version}`, writes the new version back, commits it as `release: v{version}`, pushes, and opens a PR titled `release: v{version}` against `main`.

The PR goes through normal CI (typecheck, lint, test) and review. No special labels or automation needed — release-deploy identifies it by branch name. This workflow deliberately does not run tests, create tags, or generate notes; CI and release-deploy own those.

## 2. Release / Deploy (`release-deploy.yml`)

Standard GitHub Actions workflow, triggered when a PR whose head branch matches `release/v*` merges into `main`. It checks out the merge commit, reads the version from `package.json`, pushes tag `v{version}`, finds the previous tag via `git describe --tags --abbrev=0 HEAD^`, collects the PRs merged since that tag's date with `gh pr list --search`, runs `bun run bench --json`, renders [`.github/release-notes-template.md`](../../.github/release-notes-template.md) by substituting `{{changes}}`, `{{benchmarks}}` and `{{compare_url}}`, and publishes a draft release with `gh release create --draft`.

### PR categorization

PRs are grouped by the conventional commit prefix in their title:

| Prefix | Section |
|--------|---------|
| `feat` | Features |
| `fix` | Fixes |
| `perf` | Performance |
| everything else | Other |

Each entry renders as `- PR title (#number) @author`. The release PR itself is excluded, the query is capped at 100 PRs, and an empty result renders as `No categorized changes.`

### Benchmark table format

Rendered from `bun run bench --json` output (which returns `SuiteResult[]`):

```
| Suite | Benchmark | avg | ops/sec | target | status |
|-------|-----------|-----|---------|--------|--------|
| Buffer | insert 10k chars | 0.02ms | 45,230 | <1ms | pass |
```

Averages below 0.01ms render in µs. A missed target renders as `FAIL` for visibility but does not block the release.

## 3. Release notes template (`.github/release-notes-template.md`)

Kept as [a separate file](../../.github/release-notes-template.md) so the format can be tweaked without touching workflow YAML. It carries three placeholders — `{{changes}}`, `{{benchmarks}}`, `{{compare_url}}` — which release-deploy substitutes.

## 4. Docs / Update (`docs-update.md`)

A `gh aw` agentic workflow following the same pattern as `code-simplifier.md`. It runs on a weekly schedule and `workflow_dispatch`, and release-deploy dispatches it after publishing a release. Its scope is `README.md` (architecture, status, test/bench counts, demo instructions), `CLAUDE.md` (file tree, subpath exports, constraints) and `docs/*.md`.

The agent determines truth by reading the codebase — file tree, test count, bench count, exports — rather than inventing content, keeps docs terse by trimming bloat and stale sections, and creates no PR when nothing changed. Its `create-pull-request` safe output uses title prefix `[docs-update]`, labels `[docs, automation]` and `expires: 1d`; a `skip-if-match` query suppresses the run while such a PR is already open.

## 5. package.json change

Remove `"private": true` to prepare for eventual npm publishing.

## Drift from the live files

Verified by reading each live file. Where they disagree with this document, the live file is correct.

| Design says | Live behaviour |
|---|---|
| §2 substitutes a `{{version}}` placeholder | The template has no `{{version}}` — only the three placeholders above |
| Categorizes on `feat:` / `fix:` / `perf:` | The jq filter matches `test("^feat")` and friends *without* the colon, so `feature: …` also lands under Features |
| Weekly schedule "compiles to something like `0 7 * * 3` — Wednesday 7am UTC" | `docs-update.lock.yml` compiles to `44 22 * * 3` |
| `github` toolset scoped to `(repos, pull_requests)` | `toolsets: [default]` |
| `skip-if-match` declared under safe outputs | Declared under `on:` |
| "`read-all` for inspection, write for PR creation" | `permissions: read-all` only — the PR is created through safe outputs, not workflow write permission |

Present in the live workflows but absent from this design: release.yml aborts if the `release/v*` branch already exists on the remote; release-deploy dates the previous tag with `%cI` (committer date) and treats a failed docs-update dispatch as a non-blocking warning; docs-update.md sets `timeout-minutes: 20`, `strict: true`, a network allowlist, and imports `shared/formatting.md` and `shared/reporting.md`.
