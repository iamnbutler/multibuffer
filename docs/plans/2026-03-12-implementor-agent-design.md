# Implementor Agent Design

**Goal:** A gh-aw workflow that takes scoped GitHub issues and implements them following the project's TDD discipline (Types → Tests → Implementation), creating draft PRs with working code.

**Architecture:** Scheduled + slash-command triggered gh-aw workflow. Single-issue focus per run with escape hatches for complexity (decompose into sub-issues, commit WIP). Reads CLAUDE.md dynamically for project constraints while following a baked-in TDD phase structure.

---

## Triggers

Scheduled twice daily at 7am and 2pm UTC (`0 7,14 * * *`); the `/implement` slash command on any issue, with optional instructions; and `workflow_dispatch` for ad-hoc runs.

## Issue Selection

Scheduled runs pick the oldest issue labeled `agent:implement`; command runs work on the issue where `/implement` was invoked. On start, the agent removes `agent:implement` and adds `in-progress`.

## TDD Phases

**Phase 0 — Understand:** Read CLAUDE.md for current constraints and the issue thoroughly; check repo-memory for prior work and existing WIP branches/PRs to resume.

**Phase 1 — Plan:** Identify affected modules (buffer, multibuffer, editor, renderer, diff) and the types that need to change, then comment an implementation plan on the issue. If too large, decompose into sub-issues labeled `agent:implement` and exit.

**Phase 2 — Types:** Create or modify type definitions, run `bun run typecheck`, commit `feat(<module>): add types for <feature>`.

**Phase 3 — Tests:** Write failing tests that define expected behavior, run `bun test` to confirm they fail for the right reasons, commit `test(<module>): add tests for <feature>`.

**Phase 4 — Implementation:** Write code to make tests pass, then run the full validation suite `bun run typecheck && bun run lint && bun test`. If existing tests break, investigate and fix; iterate until green. Commit `feat(<module>): implement <feature>`.

**Phase 5 — Validate & Ship:** Run the complete suite once more and create a draft PR linking the issue. If a timeout approaches, commit WIP and note progress in repo-memory.

## Safe Outputs

- `create-pull-request` — draft, `[Implementor]` prefix, max 1/run
- `push-to-pull-request-branch` — WIP updates and CI fixes
- `create-issue` — sub-issues with `agent:implement` label, max 4/run
- `add-comment` — plans, progress, delegation via `/pr-fix`
- `add-labels` / `remove-labels` — manage `agent:implement` and `in-progress`

## Memory

Repo-memory tracks in-progress issues (to resume across runs), WIP branch names and current phase, failed attempts with reasons (to avoid retrying the same approach), and parent→child issue mappings for decompositions.

## State Transitions

1. `agent:implement` detected → plan comment → swap to `in-progress`
2. Work proceeds across 1+ runs → WIP commits pushed
3. Draft PR created → `in-progress` stays until merged/closed
4. If decomposed → parent gets linking comment, label removed

## PR Maintenance

Each run checks open `[Implementor]` PRs for CI failures and auto-fixes those caused by its own changes, invoking `/pr-fix` for complex CI issues. Human review comments are left untouched.

## Guardrails

**Must do:** Read CLAUDE.md before every run; follow the `biome-ignore` / `expect:` convention; run the full validation suite before creating PRs; identify as `[Implementor]` in all outputs; respect architecture constraints (fixed-height lines, vanilla TS, rendering-agnostic).

**Must not:** Add dependencies without filing a discussion issue; modify code outside the target issue's scope; create non-draft PRs; re-attempt a previously failed approach; skip the types-first phase.

**Escape hatches:** Vague issue → comment asking for clarification. Too large → decompose into sub-issues. Existing tests break → investigate and fix, escalate if stuck after a genuine attempt. Can't resolve within 2 runs → flag for human attention.
