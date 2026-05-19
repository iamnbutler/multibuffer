# Release & Docs Workflows Design

## Overview

Three new workflows to establish semver releases and keep docs current: **Release** (manual `workflow_dispatch`, bumps version and opens PR), **Release / Deploy** (triggers on merge of release PR, tags and creates draft GitHub Release with notes and benchmarks), and **Docs / Update** (`gh aw` agentic workflow, weekly and post-release, updates all docs).

## 1. Release (`release.yml`)

Standard GitHub Actions workflow (not `gh aw`). Trigger: `workflow_dispatch` with input `bump` (choice: `major | minor | patch`).

The workflow checks out `main`, reads the current version from `package.json`, computes the new version (e.g. `0.0.1` + `minor` → `0.1.0`), creates branch `release/v{version}`, updates the `version` field, commits `release: v{version}`, pushes, and opens a PR titled `release: v{version}` targeting `main`.

The PR goes through normal CI (typecheck, lint, test) and review. No special labels or automation needed — release-deploy identifies it by branch name. Tests, tags, and release notes are all handled downstream by CI and release-deploy.

## 2. Release / Deploy (`release-deploy.yml`)

Standard GitHub Actions workflow. Trigger: `pull_request` merged where head branch matches `release/v*`.

The workflow checks out the merge commit on `main`, extracts the version from `package.json`, creates and pushes tag `v{version}`, finds the previous tag via `git describe --tags --abbrev=0 HEAD^`, collects merged PRs between previous tag and HEAD using `gh pr list --search "is:merged merged:>{prev_tag_date}"`, runs `bun run bench --json`, renders release notes from `.github/release-notes-template.md` (substituting `{{version}}`, `{{changes}}`, `{{benchmarks}}`, `{{compare_url}}`), and creates a draft GitHub Release via `gh release create v{version} --draft --notes "..."`.

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

Rendered from `bun run bench --json` output (`SuiteResult[]`):

```
| Suite | Benchmark | avg | ops/sec | target | status |
|-------|-----------|-----|---------|--------|--------|
| Buffer | insert 10k chars | 0.02ms | 45,230 | <1ms | pass |
```

## 3. Release Notes Template

Lives at `.github/release-notes-template.md` as a separate file so the format can be tweaked without touching workflow YAML. The release-deploy workflow reads it and substitutes the placeholders.

## 4. Docs / Update (`docs-update.md`)

A `gh aw` agentic workflow following the same pattern as `code-simplifier.md`. Triggers: weekly schedule (compiles to `0 7 * * 3` — Wednesday 7am UTC), `workflow_dispatch`, and dispatch from release-deploy after creating a release.

Scope covers `README.md` (architecture, status, test/bench counts, demo instructions), `CLAUDE.md` (file tree, architecture section, subpath exports, constraints), and `docs/*.md` (glossary, bindings, anything else that drifted). The agent reads the actual codebase to determine truth, keeps docs terse, doesn't invent content, and skips if nothing changed.

Safe outputs: `create-pull-request` with title prefix `[docs-update]`, labels `[docs, automation]`, expires `1d`, with `skip-if-match: 'is:pr is:open in:title "[docs-update]"'`. Tools: `github` toolset (repos, pull_requests) plus file read/write. Permissions: `read-all` for inspection, write for PR creation.

## 5. package.json change

Remove `"private": true` to prepare for eventual npm publishing.

## File inventory

New: `.github/workflows/release.yml`, `.github/workflows/release-deploy.yml`, `.github/release-notes-template.md`, `.github/workflows/docs-update.md`. Modified: `package.json` (remove `"private": true`).

## Sequencing

Steps 1-3 (template, release workflow, release-deploy workflow) can ship as one PR since release-deploy depends on the template. Step 4 (docs-update) is independent. Step 5 (package.json) can go with either.
