# Implementor Agent Design

**Goal:** A gh-aw workflow that takes scoped GitHub issues and implements them following the project's TDD discipline (Types → Tests → Implementation), creating draft PRs with working code.

**Architecture:** Scheduled + slash-command triggered gh-aw workflow. Single-issue focus per run with escape hatches for complexity (decompose into sub-issues, commit WIP). Reads CLAUDE.md dynamically for project constraints while following a baked-in TDD phase structure.

---

## Triggers & Issue Selection

- **Scheduled:** Twice daily (7am/2pm UTC) — picks oldest `agent:implement` issue
- **Slash command:** `/implement` on any issue, with optional instructions
- **Manual:** `workflow_dispatch`

On start, removes `agent:implement` and adds `in-progress`.

## TDD Phases

### Phase 0: Understand
Read CLAUDE.md, the issue, repo-memory for prior work, and any existing WIP branches/PRs.

### Phase 1: Plan
Identify affected modules and types, then comment the plan on the issue. If too large → decompose into sub-issues labeled `agent:implement` and exit.

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
Run the complete suite, create a draft PR linking the issue. If timeout approaching → commit WIP and note progress in repo-memory.

## Safe Outputs

- `create-pull-request` — draft, `[Implementor]` prefix, max 1/run
- `push-to-pull-request-branch` — WIP updates and CI fixes
- `create-issue` — sub-issues with `agent:implement` label, max 4/run
- `add-comment` — plans, progress, delegation via `/pr-fix`
- `add-labels` / `remove-labels` — manage `agent:implement` and `in-progress`

## Memory

Repo-memory tracks in-progress issues (branch names and phase), failed attempts with reasons (no retry of same approach), and parent→child mappings for decompositions.

## State Transitions

1. `agent:implement` detected → plan comment → swap to `in-progress`
2. Work proceeds across 1+ runs → WIP commits pushed
3. Draft PR created → `in-progress` stays until merged/closed
4. If decomposed → parent gets linking comment, label removed

## PR Maintenance

Each run checks open `[Implementor]` PRs for CI failures and auto-fixes failures caused by its own changes. For complex CI issues, invokes `/pr-fix`. Never modifies human review comments.

## Guardrails

**Must do:** Read CLAUDE.md before every run; use `biome-ignore` with `expect:` convention; run full validation before PRs; identify as `[Implementor]`; respect architecture constraints (fixed-height lines, vanilla TS, rendering-agnostic).

**Must not:** Add dependencies without a discussion issue; modify code outside issue scope; create non-draft PRs; retry a failed approach; skip types-first phase.

**Escape hatches:**
- Issue too vague → ask for clarification
- Issue too large → decompose into sub-issues
- Tests break → investigate and fix; escalate if stuck
- Unresolvable in 2 runs → flag for human attention
