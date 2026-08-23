# Implementor Agent Design

**Status:** Shipped. [`.github/workflows/implementor.md`](../../.github/workflows/implementor.md) is the authoritative definition and has evolved past this document — read it for the current triggers, phase steps, safe-output caps, and guardrails. This file records the design decisions and their rationale only.

**Goal:** A gh-aw workflow that takes scoped GitHub issues and implements them following the project's TDD discipline (Types → Tests → Implementation), creating draft PRs with working code.

**Architecture:** Scheduled (`0 7,14 * * *`) plus the `/implement` slash command and `workflow_dispatch`. One issue per run, with escape hatches for complexity. Project constraints are read from `CLAUDE.md` at runtime rather than baked in, so the agent tracks the repo as it changes; only the TDD phase structure is fixed.

---

## Design Decisions

**Types → Tests → Implementation, each its own commit.** The phases mirror the discipline in `CLAUDE.md`, and committing at every boundary (`feat(<module>): add types for <feature>`, `test(<module>): add tests for <feature>`, `feat(<module>): implement <feature>`) means a run that dies partway still leaves a reviewable, bisectable branch rather than one undifferentiated blob.

**One issue per run.** Scheduled runs take the oldest open issue labeled `agent:implement`; `/implement` runs take the issue they were invoked on. Narrow scope keeps PRs reviewable and contains a failure to a single issue.

**Labels as the state machine.** `agent:implement` marks work as available. The agent swaps it for `in-progress` as soon as it comments its plan, which claims the issue against concurrent and later runs. `in-progress` survives PR creation and clears only when the PR merges or closes. A decomposed parent gets a comment linking its children and loses `agent:implement`; the children carry the label forward.

**Escape hatches instead of best-effort guessing.** Vague issue → comment asking for clarification and exit. Too large (3+ modules, 500+ new lines, or multiple independent concerns) → decompose into sub-issues and exit. Approaching the 45-minute timeout → commit with a `WIP:` prefix, record the phase in memory, resume next run. Two WIP runs without progress → flag for a human and release the label. Broken existing tests → investigate and fix the implementation; escalate rather than editing tests to make them pass.

**Repo memory for cross-run continuity.** Tracks in-progress issues with their WIP branch and current phase, failed approaches (so the same one is never retried), parent→child decomposition mappings, and open-PR CI status. Memory is a hint, not truth — issues close and branches vanish between runs, so it is verified against live repository state before being acted on.

**Self-maintenance.** Every run checks its own open `[Implementor]` PRs and pushes fixes for CI failures its changes caused, leaving infrastructure-only failures and all human review comments alone; a maintainer's reply is not a signal for the agent to act.

## Safe Outputs

| Output | Configuration |
| --- | --- |
| `create-pull-request` | draft, `[Implementor] ` prefix, `automation`/`implementation` labels, max 1 |
| `push-to-pull-request-branch` | WIP updates and CI fixes, max 4 |
| `create-issue` | decomposition sub-issues, `agent:implement` label, max 4 |
| `add-comment` | plans and progress, max 8, older comments hidden |
| `add-labels` / `remove-labels` | `agent:implement` and `in-progress` only, max 10 |

## Known Drift

> This design called for delegating complex CI failures to a `/pr-fix` workflow. No such workflow exists in `.github/workflows/`, so the `/pr-fix` references still in `implementor.md` (lines 11 and 229) are inert and the agent has no fallback beyond its own fix attempts. Either build `pr-fix` or drop the references.
