# Implementor Agent Design

**Goal:** A gh-aw workflow that takes scoped GitHub issues and implements them following the project's TDD discipline (Types → Tests → Implementation), creating draft PRs with working code.

**Architecture:** Scheduled + slash-command triggered gh-aw workflow. Single-issue focus per run with escape hatches for complexity (decompose into sub-issues, commit WIP). Reads CLAUDE.md dynamically for project constraints while following a baked-in TDD phase structure.

**Status:** Implemented as [`.github/workflows/implementor.md`](../../.github/workflows/implementor.md), which is the authoritative source for triggers, safe-output caps, and step-by-step instructions. This document records the decisions behind it.

---

## Triggers and Issue Selection

Runs twice daily at 7am and 2pm UTC (`0 7,14 * * *`), on `/implement` against any issue (with optional instructions), and via `workflow_dispatch`. Scheduled runs pick the oldest open issue labeled `agent:implement`; command runs use the issue the command was invoked on. On starting, the agent swaps `agent:implement` for `in-progress`.

## TDD Phases

Each phase commits before the next begins, so a run that times out resumes from a known state.

| Phase | Work | Commit |
| --- | --- | --- |
| 0. Understand | Read CLAUDE.md and the issue; check repo-memory and any WIP branch to resume | — |
| 1. Plan | Identify affected modules and the types that change; comment the plan on the issue. Too large → decompose into `agent:implement` sub-issues and exit | — |
| 2. Types | Create or modify type definitions; `bun run typecheck` | `feat(<module>): add types for <feature>` |
| 3. Tests | Write failing tests; `bun test` confirms they fail for the right reason | `test(<module>): add tests for <feature>` |
| 4. Implementation | Make the tests pass; `bun run typecheck && bun run lint && bun test`. Broken existing tests are investigated and fixed, not edited away | `feat(<module>): implement <feature>` |
| 5. Ship | Full suite once more, then a draft PR linking the issue. Near timeout → commit WIP and record progress in repo-memory | `WIP: <phase> for <feature>` (only when timing out) |

Module scope at design time was `buffer/`, `multibuffer/`, `editor/`, `renderer/`, and `diff/`; `src/` has since added `react/`, `worker/`, and `project/`.

## Safe Outputs

Draft `[Implementor]`-prefixed PRs (max 1/run), pushes to those PR branches, up to 4 sub-issues labeled `agent:implement`, comments for plans and progress, and add/remove of the `agent:implement` and `in-progress` labels. Exact caps live in the workflow frontmatter.

## Memory

Repo-memory carries what a single run cannot: in-progress issues with their WIP branch and phase, failed approaches and why (never retried), and parent→child mappings for decompositions. It is read at the start of every run and checked against live repository state before being acted on.

## State Transitions

1. `agent:implement` detected → plan comment → label swapped to `in-progress`
2. Work proceeds across 1+ runs → WIP commits pushed
3. Draft PR created → `in-progress` stays until merged/closed
4. If decomposed → parent gets a linking comment, label removed

## PR Maintenance

Every run also checks open `[Implementor]` PRs and fixes CI failures caused by its own changes, leaving human review comments for the maintainer. Complex failures were meant to be delegated with a `/pr-fix` comment, but no workflow in `.github/workflows/` handles that command, so the delegation is currently a no-op.

## Guardrails

**Must not:** add dependencies without a discussion issue, touch code outside the target issue's scope, open non-draft PRs, or re-attempt an approach memory records as failed.

Beyond the phases above, every run identifies itself as `[Implementor]`, follows the `biome-ignore` + `expect:` convention, and respects the architecture constraints (fixed-height lines, vanilla TypeScript, rendering-agnostic core).

**Escape hatches:** a vague issue gets a clarifying comment; a large one gets decomposed; failing tests get investigated, escalating only after a genuine attempt; anything unresolved after 2 runs is flagged for human attention.
