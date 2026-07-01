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

The PR goes through normal CI (typecheck, lint, test) and review. No special labels or automation needed — the release-deploy workflow identifies it by branch name. Tags and release notes are left to release-deploy.

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

```markdown
## What's Changed

{{changes}}

## Benchmarks

{{benchmarks}}

**Full Changelog**: {{compare_url}}
```

The release-deploy workflow reads this template and substitutes the placeholders. Keeping it as a separate file so it's easy to tweak the format without touching workflow YAML.

## 4. Docs / Update (`docs-update.md`)

A `gh aw` agentic workflow following the same pattern as `code-simplifier.md`.

**Triggers:** `schedule: weekly` (compiles to something like `0 7 * * 3` — Wednesday 7am UTC), `workflow_dispatch`, and dispatch by release-deploy after creating a release.

**Scope — files to update:** `README.md` (architecture, status, test/bench counts, demo instructions), `CLAUDE.md` (file tree, architecture, subpath exports, constraints), and `docs/*.md` (glossary, bindings, any others that drifted).

**Principles:** Read the actual codebase to determine truth (file tree, test/bench counts, exports); keep docs terse — trim bloat and stale sections; don't invent content; skip (no PR) if nothing changed.

**Safe outputs:** `create-pull-request` with title prefix `[docs-update]`, labels `[docs, automation]`, expires `1d`, and `skip-if-match: 'is:pr is:open in:title "[docs-update]"'`.

**Tools:** `github` toolset (repos, pull_requests) + file read/write. **Permissions:** `read-all` for codebase inspection, write for PR creation.

## 5. package.json change

Remove `"private": true` to prepare for eventual npm publishing.

## File inventory

New: `.github/workflows/release.yml` and `release-deploy.yml` (GitHub Actions workflows), `.github/release-notes-template.md` (template), `.github/workflows/docs-update.md` (`gh aw` workflow). Modified: `package.json` (remove `"private": true`).

## Sequencing

1. Add release notes template
2. Add release workflow
3. Add release-deploy workflow (depends on template)
4. Add docs-update workflow
5. Remove `private` from package.json

Steps 1-3 can be one PR. Step 4 is independent. Step 5 can go with either.
