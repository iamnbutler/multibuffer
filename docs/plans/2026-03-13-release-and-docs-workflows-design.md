# Release & Docs Workflows Design

## Overview

Three new workflows to establish semver releases and keep docs current:

1. **Release** — manual `workflow_dispatch`, bumps version, opens PR
2. **Release / Deploy** — triggers on merge of release PR, tags + creates draft GitHub Release with notes and benchmarks
3. **Docs / Update** — `gh aw` agentic workflow, weekly + post-release, updates all docs

## 1. Release (`release.yml`)

Standard GitHub Actions workflow (not `gh aw`). Triggered by `workflow_dispatch` with input `bump` (choice: `major | minor | patch`).

Checks out `main`, reads the current version from `package.json`, computes the new version (e.g. `0.0.1` + `minor` → `0.1.0`), creates branch `release/v{version}`, updates `package.json`, commits as `release: v{version}`, pushes, and opens a PR titled `release: v{version}` targeting `main`. Normal CI (typecheck, lint, test) and review apply — release-deploy identifies the PR by branch name, so no special labels needed. Tagging and release-notes generation are handled by release-deploy, not here.

## 2. Release / Deploy (`release-deploy.yml`)

Standard GitHub Actions workflow, triggered by `pull_request` merged where head branch matches `release/v*`.

Checks out the merge commit on `main`, extracts the version from `package.json`, creates and pushes tag `v{version}`, finds the previous tag via `git describe --tags --abbrev=0 HEAD^`, collects merged PRs between the two with `gh pr list --search "is:merged merged:>{prev_tag_date}"`, runs `bun run bench --json`, renders release notes from `.github/release-notes-template.md` (substituting `{{version}}`, `{{changes}}`, `{{benchmarks}}`, `{{compare_url}}`), and creates a draft GitHub Release via `gh release create v{version} --draft --notes "..."`.

PRs are grouped in `{{changes}}` by conventional-commit prefix in the title — `feat:` → Features, `fix:` → Fixes, `perf:` → Performance, everything else → Other — with each entry as `- PR title (#number) @author`.

The `{{benchmarks}}` table is rendered from `bun run bench --json` (which returns `SuiteResult[]`):

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

A `gh aw` agentic workflow following the same pattern as `code-simplifier.md`. Triggered by weekly schedule (Wednesday 7am UTC), `workflow_dispatch`, and dispatch from release-deploy after creating a release.

Updates `README.md` (architecture, status, test/bench counts, demo instructions), `CLAUDE.md` (file tree, architecture, subpath exports, constraints), and `docs/*.md` (glossary, bindings, anything that drifted). Reads the actual codebase to determine truth, keeps docs terse, never invents content, and skips when nothing changed.

Uses `create-pull-request` with title prefix `[docs-update]`, labels `[docs, automation]`, `expires: 1d`, and `skip-if-match: 'is:pr is:open in:title "[docs-update]"'`. Needs the `github` toolset (repos, pull_requests) plus file read/write, with `read-all` permissions for inspection and write for PR creation.

## 5. package.json change

Remove `"private": true` to prepare for eventual npm publishing.

## File inventory

New: `.github/workflows/release.yml`, `.github/workflows/release-deploy.yml`, `.github/release-notes-template.md`, `.github/workflows/docs-update.md`. Modified: `package.json` (remove `"private": true`).

## Sequencing

Land steps 1-3 together (release notes template, release workflow, release-deploy workflow — release-deploy depends on the template). Step 4 (docs-update workflow) is independent. Step 5 (remove `"private": true` from `package.json`) can ride with either.
