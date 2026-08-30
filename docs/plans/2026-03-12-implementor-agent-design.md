# Implementor Agent Design

**Goal:** A gh-aw workflow that takes scoped GitHub issues and implements them following the project's TDD discipline (Types → Tests → Implementation), creating draft PRs with working code.

**Architecture:** Scheduled + slash-command triggered gh-aw workflow. Single-issue focus per run with escape hatches for complexity (decompose into sub-issues, commit WIP). Reads CLAUDE.md dynamically for project constraints while following a baked-in TDD phase structure.

> **Status:** Shipped. [`.github/workflows/implementor.md`](../../.github/workflows/implementor.md) is authoritative for triggers, caps, and steps; this records the original design intent and has drifted where noted below.

---

## Triggers and Issue Selection

Runs twice daily at 7am and 2pm UTC (`0 7,14 * * *`), on `/implement <instructions>` against any issue, or via `workflow_dispatch`. Scheduled runs pick the oldest issue labeled `agent:implement`; command runs work on the invoking issue. On starting, the agent swaps `agent:implement` for `in-progress`.

## TDD Phases

| Phase | Work | Commit |
| --- | --- | --- |
| 0. Understand | Read CLAUDE.md and the issue; check repo-memory for prior work and any WIP branch/PR to resume | — |
| 1. Plan | Identify affected modules and the types that must change; comment the plan on the issue. Too large → decompose into sub-issues labeled `agent:implement` and exit | — |
| 2. Types | Define or modify types; `bun run typecheck` | `feat(<module>): add types for <feature>` |
| 3. Tests | Write failing tests that define the behavior; `bun test` to confirm they fail for the right reasons | `test(<module>): add tests for <feature>` |
| 4. Implementation | Make the tests pass; iterate on `bun run typecheck && bun run lint && bun test` until green, fixing the implementation when existing tests break | `feat(<module>): implement <feature>` |
| 5. Validate & ship | Full suite once more, then a draft PR linking the issue. Timeout approaching → commit WIP and record progress in repo-memory | — |

## Safe Outputs

| Output | Limits |
| --- | --- |
| `create-pull-request` | draft, `[Implementor]` prefix, max 1/run |
| `push-to-pull-request-branch` | WIP updates and CI fixes, max 4/run |
| `create-issue` | sub-issues labeled `agent:implement`, max 4/run |
| `add-comment` | plans, progress, delegation via `/pr-fix`; max 8/run |
| `add-labels` / `remove-labels` | `agent:implement` and `in-progress` only |

## Memory

Repo-memory tracks in-progress issues (to resume across runs), WIP branch names and the current phase, failed attempts and their reasons so the same approach is not retried, and parent→child mapping for decompositions.

## State Transitions

1. `agent:implement` detected → plan comment → swap to `in-progress`
2. Work proceeds across 1+ runs → WIP commits pushed
3. Draft PR created → `in-progress` stays until merged/closed
4. If decomposed → parent gets linking comment, label removed

## PR Maintenance

Each run checks open `[Implementor]` PRs for CI failures and auto-fixes those caused by its own changes, delegating complex ones via `/pr-fix`. Human review comments are left untouched.

## Guardrails

**Must do:** follow the `biome-ignore` + `expect:` convention, identify as `[Implementor]` in all outputs, and respect the architecture constraints (fixed-height lines, vanilla TS, rendering-agnostic). The phase table above already covers reading CLAUDE.md, types-first ordering, and full validation before a PR.

**Must not:** add dependencies without filing a discussion issue, touch code outside the target issue's scope, create non-draft PRs, or re-attempt a previously failed approach.

**Escape hatches:** vague issue → ask for clarification; oversized issue → decompose; stuck after a genuine attempt, or unresolved within 2 runs → escalate for human attention.

## Known Drift

- **Module scope.** Phase 1 was written against `buffer, multibuffer, editor, renderer, diff`; `src/` now also holds `project/`, `react/`, and `worker/`.
- **`/pr-fix` is inert.** This design and the live workflow both reference delegating to `/pr-fix`, but no workflow in `.github/workflows/` handles that command, so delegation is a no-op.
