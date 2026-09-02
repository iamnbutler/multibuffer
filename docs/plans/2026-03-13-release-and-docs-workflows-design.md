# Release & Docs Workflows Design

Status: implemented — every file below now exists and `package.json` no longer sets `private`. Kept as a historical design record.

## Overview

Three new workflows to establish semver releases and keep docs current:

1. **Release** — manual `workflow_dispatch`, bumps version, opens PR
2. **Release / Deploy** — triggers on merge of release PR, tags + creates draft GitHub Release with notes and benchmarks
3. **Docs / Update** — `gh aw` agentic workflow, weekly + post-release, updates all docs

## 1. Release (`release.yml`)

Standard GitHub Actions workflow (not `gh aw`).

**Trigger:** `workflow_dispatch` with input `bump` (choice: `major | minor | patch`).

**Steps:**

1. Checkout `main`
2. Read current version from `package.json`
3. Compute new version (e.g. `0.0.1` + `minor` → `0.1.0`)
4. Create branch `release/v{version}`
5. Update `version` field in `package.json`
6. Commit: `release: v{version}`
7. Push branch
8. Create PR titled `release: v{version}` targeting `main`

The PR goes through normal CI (typecheck, lint, test) and review. No special labels or automation needed — release-deploy identifies it by branch name and owns tagging and release notes.

## 2. Release / Deploy (`release-deploy.yml`)

Standard GitHub Actions workflow.

**Trigger:** `pull_request` merged where head branch matches `release/v*`.

**Steps:**

1. Checkout the merge commit on `main`
2. Extract version from `package.json`
3. Create and push tag `v{version}`
4. Find previous tag via `git describe --tags --abbrev=0 HEAD^`
5. Collect merged PRs between previous tag and HEAD using `gh pr list --search "is:merged merged:>{prev_tag_date}"`
6. Run benchmarks: `bun run bench --json`
7. Render release notes from `.github/release-notes-template.md`, populating:
   - `{{version}}` — the new version
   - `{{changes}}` — categorized PR list
   - `{{benchmarks}}` — formatted benchmark table
   - `{{compare_url}}` — GitHub compare link between tags
8. Create draft GitHub Release via `gh release create v{version} --draft --notes "..."`

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

## 3. Release Notes Template (`.github/release-notes-template.md`)

A `What's Changed` / `Benchmarks` / `Full Changelog` skeleton holding the three placeholders above. Release-deploy reads it and substitutes them. Kept as a separate file so the format can be tweaked without touching workflow YAML — see [`.github/release-notes-template.md`](../../.github/release-notes-template.md) for the current text.

## 4. Docs / Update (`docs-update.md`)

A `gh aw` agentic workflow following the same pattern as `code-simplifier.md`.

**Triggers:** `schedule: weekly`, `workflow_dispatch`, and a dispatch from release-deploy after a release is created.

**Scope:** `README.md` (architecture, status, test/bench counts, demo instructions), `CLAUDE.md` (file tree, architecture, subpath exports, constraints), and `docs/*.md` (glossary, bindings, anything else that drifted).

**Principles:** read the codebase to determine truth rather than inventing content, keep docs terse by trimming bloat and stale sections, and skip the PR entirely if nothing changed.

**Config:** `read-all` permissions for codebase inspection; `github` toolset plus file read/write; `create-pull-request` safe output with title prefix `[docs-update]`, labels `[docs, automation]`, `expires: 1d`, and `skip-if-match: 'is:pr is:open in:title "[docs-update]"'`.

## 5. package.json change

Remove `"private": true` to prepare for eventual npm publishing.

## File inventory and sequencing

Steps 1-3 can be one PR. Step 4 is independent. Step 5 can go with either.

| Step | File | Change |
|------|------|--------|
| 1 | `.github/release-notes-template.md` | New — release notes template |
| 2 | `.github/workflows/release.yml` | New — GitHub Actions workflow |
| 3 | `.github/workflows/release-deploy.yml` | New — GitHub Actions workflow (depends on the template) |
| 4 | `.github/workflows/docs-update.md` | New — `gh aw` workflow definition |
| 5 | `package.json` | Remove `"private": true` |
