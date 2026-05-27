# Release & Docs Workflows Design

## Overview

Three new workflows to establish semver releases and keep docs current:

1. **Release** — manual `workflow_dispatch`, bumps version, opens PR
2. **Release / Deploy** — triggers on merge of release PR, tags + creates draft GitHub Release with notes and benchmarks
3. **Docs / Update** — `gh aw` agentic workflow, weekly + post-release, updates all docs

## 1. Release (`release.yml`)

Standard GitHub Actions workflow (not `gh aw`). Triggered by `workflow_dispatch` with input `bump` (choice: `major | minor | patch`).

Checks out `main`, reads the current version from `package.json`, computes the new version (e.g. `0.0.1` + `minor` → `0.1.0`), creates branch `release/v{version}`, updates the `version` field, commits as `release: v{version}`, pushes, and opens a PR titled `release: v{version}` targeting `main`. The PR goes through normal CI (typecheck, lint, test) and review. No special labels or automation needed — the release-deploy workflow identifies it by branch name. Tag creation, release notes, and tests are handled elsewhere (release-deploy and CI respectively).

## 2. Release / Deploy (`release-deploy.yml`)

Standard GitHub Actions workflow. Triggered by `pull_request` merged where head branch matches `release/v*`.

Checks out the merge commit on `main`, extracts the version from `package.json`, creates and pushes tag `v{version}`, finds the previous tag via `git describe --tags --abbrev=0 HEAD^`, collects merged PRs between previous tag and HEAD using `gh pr list --search "is:merged merged:>{prev_tag_date}"`, runs `bun run bench --json`, renders release notes from `.github/release-notes-template.md` (substituting `{{version}}`, `{{changes}}` for categorized PR list, `{{benchmarks}}` for benchmark table, `{{compare_url}}` for the GitHub compare link), and creates a draft GitHub Release via `gh release create v{version} --draft --notes "..."`.

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

A `gh aw` agentic workflow following the same pattern as `code-simplifier.md`. Triggered weekly (compiles to roughly `0 7 * * 3` — Wednesday 7am UTC), via `workflow_dispatch`, or dispatched by release-deploy after creating a release.

Scope covers `README.md` (architecture, status, test/bench counts, demo instructions), `CLAUDE.md` (file tree, architecture section, subpath exports, constraints), and `docs/*.md` (glossary, bindings, anything else that drifted). The agent reads the actual codebase to determine truth (file tree, test count, bench count, exports), keeps docs terse — trimming bloat and stale sections, doesn't invent content, and skips if nothing changed (no PR created).

Safe outputs: `create-pull-request` with title prefix `[docs-update]`, labels `[docs, automation]`, expires `1d`; `skip-if-match: 'is:pr is:open in:title "[docs-update]"'`. Uses the `github` toolset (repos, pull_requests) plus file read/write. Permissions: `read-all` for codebase inspection, write for PR creation.

## 5. package.json change

Remove `"private": true` to prepare for eventual npm publishing.

## File inventory

New: `.github/workflows/release.yml`, `.github/workflows/release-deploy.yml` (GitHub Actions workflows), `.github/release-notes-template.md` (release notes template), `.github/workflows/docs-update.md` (`gh aw` workflow definition). Modified: `package.json` (remove `"private": true`).

## Sequencing

Add the release notes template, then the release workflow, then release-deploy (depends on template); add docs-update; remove `private` from `package.json`. The first three can ship in one PR, docs-update is independent, and the `package.json` change can go with either.
