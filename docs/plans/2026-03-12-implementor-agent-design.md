# Implementor Agent Design

**Goal:** A gh-aw workflow that takes scoped GitHub issues and implements them following the project's TDD discipline (Types → Tests → Implementation), creating draft PRs with working code.

**Architecture:** Scheduled + slash-command triggered gh-aw workflow, one issue per run. Reads CLAUDE.md dynamically for project constraints while following a baked-in TDD phase structure.

**Status:** Shipped as [`.github/workflows/implementor.md`](../../.github/workflows/implementor.md). Where this design and the live workflow disagree, the workflow is authoritative.

---

## Triggers and Issue Selection

Runs twice daily (`0 7,14 * * *`), on `workflow_dispatch`, and on `/implement <instructions>` posted to any issue. Scheduled runs take the oldest open issue labeled `agent:implement` that is not already `in-progress`; command runs take the issue the command was posted on. The label swap to `in-progress` happens once the agent commits to the issue at the end of planning — not at selection — and `in-progress` stays until the PR is merged or closed. Run timeout is 45 minutes.

## TDD Phases

| Phase | Work | Commit |
| --- | --- | --- |
| 0. Understand | Read CLAUDE.md for current constraints; read repo-memory and resume any WIP branch | — |
| 1. Plan | Read the issue and its comments, identify affected modules and the types to change, comment the plan on the issue, branch `implementor/<issue>-<desc>` | — |
| 2. Types | Create or modify type definitions; `bun run typecheck` | `feat(<module>): add types for <feature>` |
| 3. Tests | Write failing tests defining the behavior; confirm they fail for the right reason (missing implementation, not bad imports) | `test(<module>): add tests for <feature>` |
| 4. Implementation | Make the tests pass; `bun run typecheck && bun run lint && bun test`; if existing tests break, fix the implementation rather than the tests; iterate until green | `feat(<module>): implement <feature>` |
| 5. Ship | Re-run the full suite, then open a draft PR linking the issue | — |

Phase 1 has two early exits: an issue too vague to act on gets a comment asking for clarification, and an issue too large (3+ modules, 500+ lines, or multiple independent concerns) is decomposed into sub-issues labeled `agent:implement` and linked from the parent, whose own label is then removed.

> **Known gap:** both this design and the live workflow enumerate the affected modules as `buffer`, `multibuffer`, `editor`, `renderer`, and `diff`, but `src/` now also contains `project/`, `react/`, and `worker/`. Issues touching those three are not covered by the module list.

## Safe Outputs

| Output | Configuration |
| --- | --- |
| `create-pull-request` | draft, `[Implementor] ` prefix, labels `automation` + `implementation`, max 1/run |
| `push-to-pull-request-branch` | WIP updates and CI fixes, max 4/run |
| `create-issue` | decomposition sub-issues labeled `agent:implement`, max 4/run |
| `add-comment` | plans, progress, escalations; max 8/run, older comments hidden |
| `add-labels` / `remove-labels` | `agent:implement` and `in-progress` only, max 10/run |

## Memory

Read at the start of every run, written at the end. Tracks in-progress issues (number, WIP branch, phase, what remains), failed attempts and why they failed, parent→child mappings from decompositions, and CI status of open Implementor PRs. Memory goes stale — issues close, PRs merge, branches disappear — so it is verified against live repository state before being acted on.

## WIP Protocol

Roughly five minutes before the timeout the agent commits what it has under a `WIP:` prefix, pushes, records the branch, phase, and an incremented WIP-run count in memory, and comments the branch name on the issue. The next run picks this up at Phase 0. If two or more WIP runs pass on the same issue without meaningful progress, the agent flags it for human attention, removes `in-progress`, and stops working on it.

## PR Maintenance

Every run ends by checking open `[Implementor]` PRs. It fixes CI failures caused by its own changes and rebases merge conflicts, but comments rather than acting on infrastructure-only failures (runner issues, flaky external services), and leaves human review comments for the maintainer.

> **Not yet realized:** the workflow delegates complex CI failures by dropping a `/pr-fix` comment, but no `pr-fix` workflow exists in `.github/workflows/`, so that comment is currently inert.

## Guardrails

Beyond the phase discipline above, the agent respects the architecture constraints in CLAUDE.md (fixed-height lines, vanilla TypeScript, rendering-agnostic core) and the `biome-ignore` + `expect:` convention, and identifies itself as `[Implementor]` in every comment, issue, and PR. It must never add a dependency without a discussion issue, make breaking changes without maintainer approval, modify code outside the target issue's scope, or re-attempt an approach that memory records as failed.
