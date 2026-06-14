# Implementor Agent Design

**Goal:** A gh-aw workflow that takes scoped GitHub issues and implements them following the project's TDD discipline (Types → Tests → Implementation), creating draft PRs with working code.

**Architecture:** Scheduled + slash-command triggered gh-aw workflow. Single-issue focus per run with escape hatches for complexity (decompose into sub-issues, commit WIP). Reads CLAUDE.md dynamically for project constraints while following a baked-in TDD phase structure.

---

## Triggers

Runs on a twice-daily schedule (7am and 2pm UTC, `0 7,14 * * *`), via the `/implement` slash command on any issue (with optional instructions), and via `workflow_dispatch` for ad-hoc runs.

## Issue Selection

Scheduled runs pick the oldest issue labeled `agent:implement`; command runs work on the issue where `/implement` was invoked. On starting, the agent swaps `agent:implement` for `in-progress`.

## TDD Phases

| Phase | Actions |
| --- | --- |
| 0 — Understand | Read CLAUDE.md for current constraints, read the issue thoroughly, check repo-memory for prior work, and check for existing WIP branches/PRs to resume. |
| 1 — Plan | Identify affected modules (buffer, multibuffer, editor, renderer, diff) and the types to change or create, then comment the plan on the issue. If too large, decompose into sub-issues labeled `agent:implement` and exit. |
| 2 — Types | Create or modify type definitions, run `bun run typecheck`, commit `feat(<module>): add types for <feature>`. |
| 3 — Tests | Write failing tests that define expected behavior, run `bun test` to confirm they fail for the right reasons, commit `test(<module>): add tests for <feature>`. |
| 4 — Implementation | Write implementation to make tests pass, run `bun run typecheck && bun run lint && bun test`, fix any existing tests that break, iterate until green, commit `feat(<module>): implement <feature>`. |
| 5 — Validate & Ship | Run the complete suite once more and create a draft PR linking the issue. If a timeout approaches, commit WIP and note progress in repo-memory. |

## Safe Outputs

| Output | Use |
| --- | --- |
| `create-pull-request` | Draft, `[Implementor]` prefix, max 1/run |
| `push-to-pull-request-branch` | WIP updates and CI fixes |
| `create-issue` | Sub-issues with `agent:implement` label, max 4/run |
| `add-comment` | Plans, progress, delegation via `/pr-fix` |
| `add-labels` / `remove-labels` | Manage `agent:implement` and `in-progress` |

## Memory

Repo-memory tracks in-progress issues (to resume across runs), WIP branch names and current phase, failed attempts with reasons (so no approach is retried), and parent→child issue mapping for decompositions.

## State Transitions

1. `agent:implement` detected → plan comment → swap to `in-progress`
2. Work proceeds across 1+ runs → WIP commits pushed
3. Draft PR created → `in-progress` stays until merged/closed
4. If decomposed → parent gets linking comment, label removed

## PR Maintenance

Each run checks open `[Implementor]` PRs for CI failures and auto-fixes those caused by its own changes, invoking `/pr-fix` on its own PRs for complex CI issues. Human review comments are left untouched.

## Guardrails

**Must do:** Read CLAUDE.md before every run; follow the `biome-ignore` with `expect:` convention; run the full validation suite before creating PRs; identify as `[Implementor]` in all outputs; respect architecture constraints (fixed-height lines, vanilla TS, rendering-agnostic).

**Must not:** Add dependencies without filing a discussion issue; modify code outside the target issue scope; create non-draft PRs; re-attempt a previously failed approach; skip the types-first phase.

**Escape hatches:** A vague issue gets a comment asking for clarification; a too-large issue is decomposed into sub-issues; implementation that breaks existing tests is investigated and fixed (escalate if stuck after a genuine attempt); work that can't resolve within 2 runs is flagged for human attention.
