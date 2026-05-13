# Release & Docs Workflows Design

## Overview

Three new workflows to establish semver releases and keep docs current:

1. **Release** — manual `workflow_dispatch`, bumps version, opens PR
2. **Release / Deploy** — triggers on merge of release PR, tags + creates draft GitHub Release with notes and benchmarks
3. **Docs / Update** — `gh aw` agentic workflow, weekly + post-release, updates all docs

## 1. Release (`release.yml`)

Standard GitHub Actions workflow. Triggered by `workflow_dispatch` with a `bump` input (`major | minor | patch`).

Reads the current version from `package.json`, computes the new version, creates branch `release/v{version}`, updates `package.json`, commits `release: v{version}`, pushes, and opens a PR targeting `main`. The PR goes through normal CI and review — release-deploy identifies it by branch name, so no special labels are needed. Tag creation and release notes are handled by release-deploy, not here.

## 2. Release / Deploy (`release-deploy.yml`)

Standard GitHub Actions workflow. Triggered when a `release/v*` PR is merged.

Checks out the merge commit, extracts the version from `package.json`, creates and pushes tag `v{version}`, then finds the previous tag via `git describe --tags --abbrev=0 HEAD^`. Collects merged PRs in the range with `gh pr list --search "is:merged merged:>{prev_tag_date}"`, runs `bun run bench --json`, and renders `.github/release-notes-template.md` by substituting `{{version}}`, `{{changes}}` (categorized PR list), `{{benchmarks}}` (formatted table), and `{{compare_url}}` (GitHub compare link). Finally creates a draft release: `gh release create v{version} --draft --notes "..."`.

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

A `gh aw` agentic workflow following the same pattern as `code-simplifier.md`. Triggers: weekly schedule (`0 7 * * 3` — Wednesday 7am UTC), `workflow_dispatch`, and dispatch from release-deploy after creating a release.

Scope covers `README.md` (architecture, status, test/bench counts, demo instructions), `CLAUDE.md` (file tree, architecture, subpath exports, constraints), and `docs/*.md` (glossary, bindings, anything else that drifted). The agent reads the codebase to determine truth, keeps docs terse, never invents content, and skips when nothing changed.

Safe outputs: `create-pull-request` with title prefix `[docs-update]`, labels `[docs, automation]`, `expires: 1d`, and `skip-if-match: 'is:pr is:open in:title "[docs-update]"'`. Uses the `github` toolset (repos, pull_requests) plus file read/write, with `read-all` permissions and write for PR creation.

## 5. package.json change

Remove `"private": true` to prepare for eventual npm publishing.

## File inventory

New: `.github/workflows/release.yml`, `.github/workflows/release-deploy.yml` (GitHub Actions); `.github/release-notes-template.md` (template); `.github/workflows/docs-update.md` (`gh aw`). Modified: `package.json` (remove `"private": true`).

## Sequencing

Bundle as one PR: release notes template, release workflow, and release-deploy (which depends on the template). The docs-update workflow ships independently, and the `package.json` change can ride with either.
