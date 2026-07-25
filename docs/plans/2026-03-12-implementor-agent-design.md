# Implementor Agent Design

**Goal:** A gh-aw workflow that takes scoped GitHub issues and implements them following the project's TDD discipline (Types → Tests → Implementation), creating draft PRs with working code.

**Architecture:** Scheduled + slash-command triggered gh-aw workflow. Single-issue focus per run with escape hatches for complexity (decompose into sub-issues, commit WIP). Reads CLAUDE.md dynamically for project constraints while following a baked-in TDD phase structure.

---

## Triggers & Issue Selection

Runs twice daily at 7am and 2pm UTC (`0 7,14 * * *`), on `/implement` (with optional instructions) on any issue, and via `workflow_dispatch` for ad-hoc runs. Scheduled runs pick the oldest issue labeled `agent:implement`; command runs work on the issue where `/implement` was invoked. The agent removes `agent:implement` and adds `in-progress` when it starts.

## TDD Phases

| Phase | Steps | Commit |
|---|---|---|
| 0. Understand | Read CLAUDE.md for current project constraints and read the issue thoroughly. Check repo-memory for prior work and for existing WIP branches/PRs to resume. | — |
| 1. Plan | Identify affected modules (buffer, multibuffer, editor, renderer, diff) and the types to change or create, then comment the implementation plan on the issue. Too large → decompose into sub-issues labeled `agent:implement`, exit. | — |
| 2. Types | Create or modify type definitions; run `bun run typecheck`. | `feat(<module>): add types for <feature>` |
| 3. Tests | Write failing tests that define expected behavior; run `bun test` to confirm they fail for the right reasons. | `test(<module>): add tests for <feature>` |
| 4. Implementation | Write implementation to make tests pass; run full validation `bun run typecheck && bun run lint && bun test`. Broken existing tests → investigate and fix the implementation. Iterate until green. | `feat(<module>): implement <feature>` |
| 5. Validate & Ship | Run the complete suite one final time, then create a draft PR linking the issue. Timeout approaching → commit WIP, note progress in repo-memory. | — |

## Safe Outputs

- `create-pull-request` — draft, `[Implementor]` prefix, max 1/run
- `push-to-pull-request-branch` — WIP updates and CI fixes
- `create-issue` — sub-issues with `agent:implement` label, max 4/run
- `add-comment` — plans, progress, delegation via `/pr-fix`
- `add-labels` / `remove-labels` — manage `agent:implement` and `in-progress`

## Memory

Repo-memory tracks in-progress issues (to resume across runs), WIP branch names and current phase, failed attempts with reasons (no retry of the same approach), and parent→child issue mapping for decompositions.

## State Transitions

1. `agent:implement` detected → plan comment → swap to `in-progress`
2. Work proceeds across 1+ runs → WIP commits pushed
3. Draft PR created → `in-progress` stays until merged/closed
4. If decomposed → parent gets linking comment, label removed

## PR Maintenance

Each run checks open `[Implementor]` PRs for CI failures and auto-fixes those caused by its own changes, invoking `/pr-fix` on its own PRs for complex CI issues. Human review comments are left untouched.

## Guardrails

Beyond the phase order above:

**Must do:**
- Follow `biome-ignore` with `expect:` convention
- Identify as `[Implementor]` in all outputs
- Respect architecture constraints (fixed-height lines, vanilla TS, rendering-agnostic)

**Must not:**
- Add dependencies without filing a discussion issue
- Modify code outside target issue scope
- Create non-draft PRs

**Escape hatches:** An issue too vague to act on gets a comment asking for clarification. If stuck after a genuine attempt, or unresolved within 2 runs, flag for human attention.
