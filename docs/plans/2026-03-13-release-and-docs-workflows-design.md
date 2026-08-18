# Release & Docs Workflows Design

**Status:** Complete — everything below shipped. The files on disk are authoritative; read them for exact steps. This doc records the decisions behind them, not their contents. Task breakdown lives in [the companion plan](2026-03-13-release-and-docs-workflows-plan.md).

## Overview

Three workflows establish semver releases and keep docs current:

| Workflow | File | Trigger |
|---|---|---|
| Release | `.github/workflows/release.yml` | `workflow_dispatch` with `bump` input (`patch` / `minor` / `major`) |
| Release / Deploy | `.github/workflows/release-deploy.yml` | PR closed against `main`, gated on merged + head branch `release/v*` |
| Docs / Update | `.github/workflows/docs-update.md` (`gh aw`) | weekly cron, `workflow_dispatch`, dispatch from release-deploy |
| — | `.github/release-notes-template.md` | read by release-deploy |

`package.json` also dropped `"private": true`, to prepare for eventual npm publishing.

## 1. Release

Standard GitHub Actions workflow (not `gh aw`). Computes the next semver from `package.json`, creates branch `release/v{version}`, commits `release: v{version}`, pushes, and opens a PR against `main`. It aborts if that branch already exists, so two releases can't run at once.

It deliberately does **not** run tests, create tags, or generate release notes — CI covers the first on the PR, release-deploy covers the other two. The release PR needs no label or marker: release-deploy identifies it by branch name alone.

## 2. Release / Deploy

Tags the merge commit `v{version}`, collects merged PRs since the previous tag, runs benchmarks, renders the notes template, and creates a **draft** GitHub Release. It then dispatches `docs-update.lock.yml`; that dispatch is non-blocking and only warns on failure.

Three decisions that aren't obvious from the YAML:

- The previous tag comes from `git describe --tags --abbrev=0 HEAD^`, and the PR search cutoff is that tag's **committer** date (`%cI`), not its author date — otherwise rebased work falls outside the window. With no previous tag, all merged PRs are collected.
- PRs titled `release:` are filtered out so a release never lists itself.
- Benchmarks never block the release. A missed target renders as a `FAIL` row in the table, for visibility rather than enforcement.

PRs are grouped by conventional commit prefix in the title:

| Prefix | Section |
|--------|---------|
| `feat:` | Features |
| `fix:` | Fixes |
| `perf:` | Performance |
| everything else | Other |

Each entry is `- PR title (#number) @author`. Benchmarks render from `bun run bench --json` (which returns `SuiteResult[]`) as:

```
| Suite | Benchmark | avg | ops/sec | target | status |
|-------|-----------|-----|---------|--------|--------|
| Buffer | insert 10k chars | 0.02ms | 45,230 | <1ms | pass |
```

## 3. Release notes template

The template holds three placeholders — `{{changes}}`, `{{benchmarks}}`, and `{{compare_url}}` — which release-deploy substitutes with bash string replacement. It stays a separate file so the notes format can be tweaked without touching workflow YAML.

## 4. Docs / Update

A `gh aw` agentic workflow following the same pattern as `code-simplifier.md`. It reads the actual codebase to determine truth (file tree, exports, test and bench counts), then updates `README.md`, `CLAUDE.md`, and `docs/*.md`: trimming bloat and stale sections, never inventing content, and creating no PR when nothing changed.

- **Schedule:** `schedule: weekly`, which compiles to `cron: "44 22 * * 3"` in `docs-update.lock.yml`.
- **Safe outputs:** `create-pull-request` with title prefix `[docs-update] `, labels `[docs, automation]`, `expires: 1d`, guarded by `skip-if-match: 'is:pr is:open in:title "[docs-update]"'`.
- **Tools and permissions:** the `github` toolset (`[default]`) plus file read/write, under `permissions: read-all` — PR creation goes through safe outputs, not job permissions.
