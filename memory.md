# Test Improver Memory

## Commands
- bun test/typecheck/lint — CI only; no coverage configured
- CI: install→build:demo→typecheck→lint→test

## Framework
- bun:test; tests/ mirrors src/; helpers.ts + property-helpers.ts (merged #234)
- num() unwraps branded types; biome-ignore for branded casts

## Open PRs
- branch test-assist/multi-cursor-undo-redo: 5 multi-cursor undo/redo tests

## Backlog
1. anchor bias-at-boundary — BLOCKED (excerptAt not bias-aware)
2. singleton optimization — unimplemented feature
3. edit-proxy cross-excerpt — BLOCKED
4. Playwright e2e (#119)
5. fast-check fuzz (#80) — UNBLOCKED (#234 merged)
6. reDiff→edit view consistency test — UNBLOCKED (#244 closed)

## Round-Robin
Last: 2026-03-19 run 23290644078; tasks 1,2,3,7. Next: 4,5,6,7.

## Notes
- #234, #245 merged 2026-03-18; #244 closed by maintainer
- Multi-cursor #302, find/replace #300, Canvas #294/#297, WebGPU #291, events #301 all merged
- Pre-existing: 10 canvas/webgpu test failures (browser env); src/react/ typecheck errors
- Repo Assist active; avoid overlap before new PRs/issues
