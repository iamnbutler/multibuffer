# Implementor Agent Design

**Goal:** A gh-aw workflow that takes scoped GitHub issues and implements them following the project's TDD discipline (Types → Tests → Implementation), creating draft PRs with working code.

**Architecture:** Scheduled + slash-command triggered gh-aw workflow. Single-issue focus per run with escape hatches for complexity (decompose into sub-issues, commit WIP). Reads CLAUDE.md dynamically for project constraints while following a baked-in TDD phase structure.

---

## Triggers

Scheduled twice daily at 7am and 2pm UTC (`0 7,14 * * *`), triggered by `/implement` on any issue (with optional instructions), or manually via `workflow_dispatch`.

## Issue Selection

Scheduled runs pick the oldest `agent:implement` issue; command runs work on the invoking issue. The agent swaps `agent:implement` for `in-progress` on start.

## TDD Phases

### Phase 0: Understand
Read CLAUDE.md, the issue, and repo-memory for prior work; check for existing WIP branches/PRs to resume.

### Phase 1: Plan
Identify affected modules (buffer, multibuffer, editor, renderer, diff) and types to change, then comment the plan on the issue. If too large → decompose into sub-issues labeled `agent:implement`, exit.

### Phase 2: Types
- Create or modify type definitions
- Run `bun run typecheck`
- Commit: `feat(<module>): add types for <feature>`

### Phase 3: Tests
- Write failing tests that define expected behavior
- Run `bun test` to confirm they fail for the right reasons
- Commit: `test(<module>): add tests for <feature>`

### Phase 4: Implementation
- Write implementation to make tests pass
- Run full validation: `bun run typecheck && bun run lint && bun test`
- If existing tests break → investigate and fix the implementation
- Iterate until green
- Commit: `feat(<module>): implement <feature>`

### Phase 5: Validate & Ship
Run the complete suite, create a draft PR linking the issue. If timeout approaches, commit WIP and note progress in repo-memory.

## Safe Outputs

- `create-pull-request` — draft, `[Implementor]` prefix, max 1/run
- `push-to-pull-request-branch` — WIP updates and CI fixes
- `create-issue` — sub-issues with `agent:implement` label, max 4/run
- `add-comment` — plans, progress, delegation via `/pr-fix`
- `add-labels` / `remove-labels` — manage `agent:implement` and `in-progress`

## Memory

Repo-memory tracks in-progress issues with their WIP branch and phase, failed attempts with reasons (no retry of same approach), and parent→child decomposition mappings.

## State Transitions

1. `agent:implement` detected → plan comment → swap to `in-progress`
2. Work proceeds across 1+ runs → WIP commits pushed
3. Draft PR created → `in-progress` stays until merged/closed
4. If decomposed → parent gets linking comment, label removed

## PR Maintenance

Each run checks open `[Implementor]` PRs for CI failures, auto-fixing its own; invokes `/pr-fix` for complex issues. Human review comments are left untouched.

## Guardrails

**Must do:** Read CLAUDE.md before every run, follow `biome-ignore expect:` convention, run full validation before creating PRs, identify as `[Implementor]` in all outputs, respect architecture constraints (fixed-height lines, vanilla TS, rendering-agnostic).

**Must not:** Add dependencies without a discussion issue, modify code outside target scope, create non-draft PRs, re-attempt a failed approach, or skip the types-first phase.

**Escape hatches:**
- Issue too vague → comment asking for clarification
- Issue too large → decompose into sub-issues
- Implementation breaks existing tests → investigate and fix; escalate if stuck after genuine attempt
- Can't resolve within 2 runs → flag for human attention
