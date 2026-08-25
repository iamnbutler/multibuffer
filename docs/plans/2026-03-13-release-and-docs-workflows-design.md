# Release & Docs Workflows Design

> **Status: implemented.** All four files below are live, and `"private": true` has been
> removed from `package.json`. The live files are authoritative — this document keeps only
> the reasoning behind them, not a second copy of their behaviour.

| File | Role |
|------|------|
| [`.github/workflows/release.yml`](../../.github/workflows/release.yml) | Manual `workflow_dispatch`; bumps version, opens a `release/v*` PR |
| [`.github/workflows/release-deploy.yml`](../../.github/workflows/release-deploy.yml) | Fires on merge of that PR; tags, then drafts a GitHub Release |
| [`.github/release-notes-template.md`](../../.github/release-notes-template.md) | Release notes body |
| [`.github/workflows/docs-update.md`](../../.github/workflows/docs-update.md) | `gh aw` agentic workflow that keeps docs current |

## Why two workflows instead of one

Splitting at the PR boundary buys a human checkpoint for free. `release.yml` only bumps
`package.json` and opens the PR, so the version change goes through normal CI (typecheck,
lint, test) and review like any other change. It deliberately does not test, tag, or write
notes — those belong after the merge decision.

`release-deploy.yml` picks the work back up by matching the head branch against
`release/v*`, which means no labels, no shared state, and nothing to keep in sync between
the two. It creates the release as a **draft** so a human still reviews the generated notes
before anything is published.

`release.yml` also refuses to start if the target `release/v*` branch already exists, which
catches a second release being cut while one is still in flight.

## Release notes

Notes are assembled from a template file rather than inline YAML so the format can be
tweaked without touching workflow logic. It has exactly three placeholders —
`{{changes}}`, `{{benchmarks}}`, `{{compare_url}}` — substituted with bash parameter
expansion. There is no `{{version}}` placeholder; the tag already carries it.

Merged PRs are bucketed by conventional-commit prefix (`feat:` → Features, `fix:` → Fixes,
`perf:` → Performance, everything else → Other), and the release PR filters itself out by
its own `release:` prefix. When there is no previous tag, `{{compare_url}}` falls back to a
`/commits/` link instead of a comparison.

Benchmarks run via `bun run bench --json` (which emits `SuiteResult[]`) and are recorded but
**non-blocking** — a missed target renders as a `FAIL` row in the table rather than failing
the release, so regressions stay visible without holding up a ship.

After the release is drafted, `docs-update` is dispatched. That call is non-blocking too: a
failure logs a warning and the release still stands.

## Docs / Update

An agentic workflow in the same style as `code-simplifier.md`, running weekly, on manual
dispatch, and after each release. Its scope is `README.md`, `CLAUDE.md`, and `docs/*.md`.

The design rule is that the codebase is the only source of truth: read the file tree,
exports, and scripts, then correct the docs to match. It must not invent content, and it
exits without a PR when nothing has drifted. A `skip-if-match` guard keeps it from stacking
open `[docs-update]` PRs.

> **Known drift:** this document originally described the schedule as `0 7 * * 3` and the
> tools as the `github` toolset scoped to `repos, pull_requests`. The compiled workflow
> actually runs at `44 22 * * 3` (Wednesday 22:44 UTC) and requests `toolsets: [default]`.
> The live file wins; noted here so the discrepancy stays visible rather than being silently
> dropped.
