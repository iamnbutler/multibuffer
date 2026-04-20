# Release & Docs Workflows Design

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

The PR goes through normal CI (typecheck, lint, test) and review. No special labels or automation needed — the release-deploy workflow identifies it by branch name.

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
7. Render release notes from `.github/release-notes-template.md`
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

Provides the format for draft releases; the release-deploy workflow substitutes `{{changes}}`, `{{benchmarks}}`, and `{{compare_url}}`. See `.github/release-notes-template.md`.

## 4. Docs / Update (`docs-update.md`)

A `gh aw` agentic workflow. **Triggers:** weekly schedule, `workflow_dispatch`, post-release dispatch. **Scope:** `README.md`, `CLAUDE.md`, `docs/*.md`.

**Principles:** Read the codebase for truth; keep docs terse; don't invent content; skip if nothing changed.

**Safe outputs:** `create-pull-request` (prefix `[docs-update]`, labels `[docs, automation]`, expires `1d`); skip if open `[docs-update]` PR exists.

**Tools/Permissions:** `github` toolset, `read-all` + write for PR creation.

## 5. package.json change

Remove `"private": true` to prepare for eventual npm publishing.

## File inventory

New files:

| File | Type |
|------|------|
| `.github/workflows/release.yml` | GitHub Actions workflow |
| `.github/workflows/release-deploy.yml` | GitHub Actions workflow |
| `.github/release-notes-template.md` | Release notes template |
| `.github/workflows/docs-update.md` | `gh aw` workflow definition |

Modified files:

| File | Change |
|------|--------|
| `package.json` | Remove `"private": true` |

## Sequencing

1. Add release notes template
2. Add release workflow
3. Add release-deploy workflow (depends on template)
4. Add docs-update workflow
5. Remove `private` from package.json

Steps 1-3 can be one PR. Step 4 is independent. Step 5 can go with either.
