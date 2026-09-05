# Implementor Agent Design

> **Status: Implemented** as [`.github/workflows/implementor.md`](../../.github/workflows/implementor.md). This document records the design intent; the workflow file is the source of truth for exact configuration.

**Goal:** A gh-aw workflow that takes scoped GitHub issues and implements them following the project's TDD discipline (Types → Tests → Implementation), creating draft PRs with working code.

**Architecture:** Scheduled + slash-command triggered gh-aw workflow. Single-issue focus per run with escape hatches for complexity (decompose into sub-issues, commit WIP). Reads [CLAUDE.md](../../CLAUDE.md) dynamically for project constraints while following a baked-in TDD phase structure.

---

## Triggers and Issue Selection

Runs twice daily at 7am and 2pm UTC (`0 7,14 * * *`), on `/implement` against any issue (with optional instructions), and on `workflow_dispatch` for ad-hoc runs. A scheduled run picks the oldest open issue labeled `agent:implement`, skipping any already marked `in-progress`; a command run works the issue it was invoked on. On starting, the agent swaps `agent:implement` for `in-progress` and branches as `implementor/<issue-number>-<short-desc>`.

## TDD Phases

| Phase | Work | Commit |
|---|---|---|
| 0. Understand | Read CLAUDE.md for current constraints, read the issue and its comments, check repo-memory for prior work and resume any existing WIP branch or PR. | — |
| 1. Plan | Identify affected modules (`buffer`, `multibuffer`, `editor`, `renderer`, `diff`) and the types to add or change, then comment the plan on the issue. If it is too large, decompose it into sub-issues labeled `agent:implement` and exit. | — |
| 2. Types | Create or modify type definitions; `bun run typecheck`. | `feat(<module>): add types for <feature>` |
| 3. Tests | Write tests that define the expected behavior and confirm with `bun test` that they fail for the right reason — missing implementation, not bad imports. | `test(<module>): add tests for <feature>` |
| 4. Implementation | Make the tests pass, then `bun run typecheck && bun run lint && bun test`. Broken existing tests are investigated and the implementation fixed — not the tests edited away. Iterate until green. | `feat(<module>): implement <feature>` |
| 5. Validate & Ship | Run the complete suite once more and open a draft PR linking the issue. If the timeout is approaching, commit WIP and record the phase in repo-memory instead. | — |

## Safe Outputs

| Output | Max/run | Purpose |
|---|---|---|
| `create-pull-request` | 1 | Draft only, `[Implementor]` title prefix, labeled `automation` + `implementation` |
| `push-to-pull-request-branch` | 4 | WIP updates and CI fixes |
| `create-issue` | 4 | Sub-issues from a decomposition, labeled `agent:implement` |
| `add-comment` | 8 | Plans, progress, delegation via `/pr-fix` |
| `add-labels` / `remove-labels` | 10 | Restricted to `agent:implement` and `in-progress` |

## Memory

Repo-memory carries in-progress issues (number, WIP branch, current phase, what remains), failed attempts and why they failed so the same approach is never retried, parent→child mappings from decompositions, and the CI status of open Implementor PRs. It is read at the start of a run and written at the end — and verified against live repository state first, since issues close and branches disappear between runs.

## State Transitions

An `agent:implement` label is detected, a plan is commented, and the label is swapped for `in-progress`. Work then proceeds across one or more runs with WIP commits pushed, and once the draft PR exists `in-progress` stays until it merges or closes. A decomposed issue takes a different path: the parent gets a comment linking its sub-issues and loses the label immediately.

## PR Maintenance

Every run, after the main work — or instead of it, when no issues are labeled — the agent checks open `[Implementor]` PRs. CI failures caused by its own changes are fixed and pushed, with complex ones delegated via a `/pr-fix` comment; merge conflicts are rebased. Infrastructure-only failures (runner problems, flaky external services) get a comment rather than a fix, and human review comments are left for the maintainer.

## Guardrails

**Must do:** read CLAUDE.md before every run, follow the `biome-ignore` + `expect:` convention, run the full validation suite before creating a PR, identify as `[Implementor]` in all outputs, and respect the architecture constraints — fixed-height lines, vanilla TypeScript, rendering-agnostic core.

**Must not:** add dependencies without filing a discussion issue, modify code outside the target issue's scope, create non-draft PRs, re-attempt a previously failed approach, or skip the types-first phase.

**Escape hatches:** a vague issue gets a clarification comment; an oversized one is decomposed into sub-issues; broken existing tests are investigated and fixed, escalating only after a genuine attempt; and two runs without meaningful progress flag the issue for human attention and drop the `in-progress` label.
