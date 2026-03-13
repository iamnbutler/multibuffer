# Implementor Agent Design

**Goal:** A gh-aw workflow that takes scoped GitHub issues and implements them following the project's TDD discipline (Types → Tests → Implementation), creating draft PRs with working code.

**Architecture:** Scheduled + slash-command triggered gh-aw workflow. Single-issue focus per run with escape hatches for complexity (decompose into sub-issues, commit WIP). Reads CLAUDE.md/AGENTS.md dynamically for project constraints while following a baked-in TDD phase structure.

---

## Triggers

- **Scheduled:** Twice daily at 7am and 2pm UTC (`0 7,14 * * *`)
- **Slash command:** `/implement` on any issue, with optional instructions
- **Manual:** `workflow_dispatch` for ad-hoc runs

## Issue Selection

- **Scheduled runs:** Picks oldest issue labeled `agent:implement`
- **Command runs:** Works on the issue where `/implement` was invoked
- Agent removes `agent:implement` and adds `in-progress` when it starts

## TDD Phases

### Phase 0: Understand
- Read CLAUDE.md and AGENTS.md for current project constraints
- Read the issue thoroughly
- Check repo-memory for prior work on this issue
- Check for existing WIP branches/PRs to resume

### Phase 1: Plan
- Identify affected modules (buffer, multibuffer, editor, renderer, diff)
- Identify types that need to change or be created
- Comment implementation plan on the issue
- If too large → decompose into sub-issues labeled `agent:implement`, exit

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
- Run complete suite one final time
- Create draft PR linking the issue
- If timeout approaching → commit WIP, note progress in repo-memory

## Safe Outputs

- `create-pull-request` — draft, `[Implementor]` prefix, max 1/run
- `push-to-pull-request-branch` — WIP updates and CI fixes
- `create-issue` — sub-issues with `agent:implement` label, max 4/run
- `add-comment` — plans, progress, delegation via `/pr-fix`
- `add-labels` / `remove-labels` — manage `agent:implement` and `in-progress`

## Memory

Repo-memory tracks:
- Issues in-progress (to resume across runs)
- WIP branch names and current phase
- Failed attempts with reasons (no retry of same approach)
- Parent→child issue mapping for decompositions

## State Transitions

1. `agent:implement` detected → plan comment → swap to `in-progress`
2. Work proceeds across 1+ runs → WIP commits pushed
3. Draft PR created → `in-progress` stays until merged/closed
4. If decomposed → parent gets linking comment, label removed

## PR Maintenance

- Each run checks open `[Implementor]` PRs for CI failures
- Auto-fixes failures caused by its own changes
- Can invoke `/pr-fix` on its own PRs for complex CI issues
- Leaves human review comments untouched

## Guardrails

**Must do:**
- Read CLAUDE.md before every run
- Follow `biome-ignore` with `expect:` convention
- Run full validation suite before creating PRs
- Identify as `[Implementor]` in all outputs
- Respect architecture constraints (fixed-height lines, vanilla TS, rendering-agnostic)

**Must not:**
- Add dependencies without filing a discussion issue
- Modify code outside target issue scope
- Create non-draft PRs
- Re-attempt a previously failed approach
- Skip the types-first phase

**Escape hatches:**
- Issue too vague → comment asking for clarification
- Issue too large → decompose into sub-issues
- Implementation breaks existing tests → investigate and fix; escalate if stuck after genuine attempt
- Can't resolve within 2 runs → flag for human attention
