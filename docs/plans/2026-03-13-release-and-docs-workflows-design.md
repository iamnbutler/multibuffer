# Release & Docs Workflows Design

> **Status:** implemented. All four files below exist and `"private"` is gone from `package.json`.
> The live files are authoritative — where this document and the workflow disagree, the workflow wins.

## Overview

Three workflows establish semver releases and keep docs current:

1. **Release** — manual `workflow_dispatch`, bumps version, opens PR
2. **Release / Deploy** — triggers on merge of release PR, tags + creates draft GitHub Release with notes and benchmarks
3. **Docs / Update** — `gh aw` agentic workflow, weekly + post-release, updates all docs

## 1. Release ([`.github/workflows/release.yml`](../../.github/workflows/release.yml))

Standard GitHub Actions workflow (not `gh aw`), triggered by `workflow_dispatch` with input `bump` (choice: `major | minor | patch`).

It checks out `main`, reads the current version from `package.json`, computes the new one (e.g. `0.0.1` + `minor` → `0.1.0`), then creates branch `release/v{version}`, updates the `version` field, commits as `release: v{version}`, pushes, and opens a PR of the same title targeting `main`.

That PR goes through normal CI (typecheck, lint, test) and review. No special labels or automation needed — release-deploy identifies it by branch name. Tagging and release notes are release-deploy's job, not this workflow's.

## 2. Release / Deploy ([`.github/workflows/release-deploy.yml`](../../.github/workflows/release-deploy.yml))

Standard GitHub Actions workflow, triggered on a merged `pull_request` whose head branch matches `release/v*`.

It checks out the merge commit on `main`, extracts the version from `package.json`, pushes tag `v{version}`, finds the previous tag via `git describe --tags --abbrev=0 HEAD^`, and collects PRs merged since that tag's date with `gh pr list --search "is:merged merged:>{prev_tag_date}"` (excluding the release PR itself). It then runs `bun run bench --json`, renders [`.github/release-notes-template.md`](../../.github/release-notes-template.md) — substituting `{{changes}}` with the categorized PR list, `{{benchmarks}}` with the formatted table, and `{{compare_url}}` with the GitHub compare link between tags — and publishes a draft release via `gh release create v{version} --draft`.

### PR categorization

PRs grouped by conventional commit prefix in title:

| Prefix | Section |
|--------|---------|
| `feat:` | Features |
| `fix:` | Fixes |
| `perf:` | Performance |
| everything else | Other |

Each entry: `- PR title (#number) @author`

### Benchmark table format

Rendered from `bun run bench --json` output (which returns `SuiteResult[]`):

```
| Suite | Benchmark | avg | ops/sec | target | status |
|-------|-----------|-----|---------|--------|--------|
| Buffer | insert 10k chars | 0.02ms | 45,230 | <1ms | pass |
```

## 3. Release notes template ([`.github/release-notes-template.md`](../../.github/release-notes-template.md))

Kept as a separate file so the format can be tweaked without touching workflow YAML. Release-deploy reads it and substitutes the three placeholders described in §2.

## 4. Docs / Update ([`.github/workflows/docs-update.md`](../../.github/workflows/docs-update.md))

A `gh aw` agentic workflow following the same pattern as `code-simplifier.md`. It runs on a weekly `schedule`, on `workflow_dispatch`, and when dispatched by release-deploy after a release. It has `read-all` permissions for codebase inspection plus the `github` toolset, and emits a `create-pull-request` safe output with title prefix `[docs-update]` and labels `[docs, automation]`, skipped while such a PR is already open.

Its scope is `README.md` (architecture, status, test/bench counts, demo instructions), `CLAUDE.md` (file tree, architecture, subpath exports, constraints), and `docs/*.md`. The guiding rule is to read the actual codebase to determine truth rather than invent content, keep docs terse by trimming bloat and stale sections, and create no PR when nothing changed.

## 5. package.json change

Remove `"private": true` to prepare for eventual npm publishing.

## Sequencing

Steps 1–3 (template, then release, then release-deploy which depends on the template) can be one PR. Step 4 is independent. Step 5 can go with either.

## Drift from the live files

Noted rather than silently corrected, since this is a historical design document:

- §2 originally listed a `{{version}}` placeholder. The live template has no such placeholder and release-deploy substitutes only `{{changes}}`, `{{benchmarks}}`, and `{{compare_url}}` — the version reaches the notes through the release title and compare URL instead.
- §4 originally specified the `github` toolset scoped to `repos, pull_requests`; the live workflow uses `toolsets: [default]`.
- The `skip-if-match` guard was designed as a safe-output setting; the live workflow declares it under `on:`.
