# Implementor Agent Design

**Status:** Shipped. [`.github/workflows/implementor.md`](../../.github/workflows/implementor.md) is authoritative for triggers, caps, and step-by-step instructions; this document records the design intent behind them.

**Goal:** A gh-aw workflow that takes scoped GitHub issues and implements them following the project's TDD discipline (Types → Tests → Implementation), creating draft PRs with working code.

**Architecture:** A single-issue-per-run workflow with escape hatches for complexity (decompose into sub-issues, commit WIP). Project constraints are read from CLAUDE.md at runtime; the TDD phase structure is baked in.

## Triggers & Issue Selection

Runs twice daily at 7am and 2pm UTC (`0 7,14 * * *`), on `/implement` against any issue, or via `workflow_dispatch`. Scheduled runs pick the oldest open issue labeled `agent:implement`; command runs work the issue where `/implement` was invoked. Either way the agent swaps `agent:implement` for `in-progress` as it starts.

## TDD Phases

| Phase | Work | Commit |
| --- | --- | --- |
| 0 — Understand | Read CLAUDE.md and the issue; check repo-memory and existing WIP branches/PRs for work to resume. | — |
| 1 — Plan | Identify affected modules and the types to add or change, then comment the plan on the issue. Too vague → ask for clarification and exit. Too large → decompose into `agent:implement` sub-issues and exit. | — |
| 2 — Types | Create or modify type definitions; `bun run typecheck`. | `feat(<module>): add types for <feature>` |
| 3 — Tests | Write tests that fail for the right reason — missing implementation, not bad imports; `bun test`. | `test(<module>): add tests for <feature>` |
| 4 — Implementation | Make the tests pass under `bun run typecheck && bun run lint && bun test`. Broken existing tests indicate a bug in the new implementation, not in the tests; iterate until green. | `feat(<module>): implement <feature>` |
| 5 — Ship | Full suite once more, then a draft PR linking the issue. Near timeout, commit WIP and record the phase in repo-memory instead. | `WIP: <phase> for <feature>` |

## Safe Outputs

One draft PR per run under the `[Implementor]` prefix, pushes to its own PR branches, up to four `agent:implement` sub-issues, comments for plans and progress, and add/remove of the `agent:implement` and `in-progress` labels.

## Memory & State

Repo-memory carries what a single run can't: in-progress issues with their WIP branch and current phase, failed approaches and why they failed (never retried), and parent → child decomposition mappings. Labels are the public half of that state — `in-progress` stays on until the PR merges or closes; a decomposed parent gets a linking comment and loses its label.

## PR Maintenance

Every run also checks open `[Implementor]` PRs and fixes CI failures caused by its own changes, delegating harder ones with a `/pr-fix` comment. Human review comments are left untouched.

## Guardrails

Read CLAUDE.md every run, identify as `[Implementor]` in all outputs, and respect the architecture constraints (fixed-height lines, vanilla TypeScript, rendering-agnostic core); unavoidable type escapes follow the `biome-ignore` + `expect:` convention. Never add a dependency without filing a discussion issue first, touch code outside the target issue's scope, open a non-draft PR, or re-attempt an approach memory records as failed. Escape hatches escalate in order: clarify a vague issue, decompose a large one, investigate broken tests and back out if genuinely stuck, and after two runs without meaningful progress flag the issue for human attention.

## Known Drift

Two claims above no longer match the repository, recorded rather than rewritten since this is a historical design document.

- **Module list.** Phase 1 scopes work to `buffer`, `multibuffer`, `editor`, `renderer`, and `diff` — five of the eight directories now under `src/`, omitting `project/`, `react/`, and `worker/`. The live workflow's Step 2 lists the same stale five.
- **`/pr-fix` is inert.** This document and the live workflow both promise delegating complex CI failures via a `/pr-fix` comment, but no workflow declares that slash command; the declared ones are `implement`, `unbloat`, `repo-assist`, `test-assist`, and `perf-assist`. The comment is a no-op.
