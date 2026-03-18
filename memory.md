# Test Improver Memory

## Commands
- bun test/typecheck/lint — CI only (bun not in runner); no coverage configured
- CI: install→build:demo→typecheck→lint→test

## Framework
- bun:test; tests/ mirrors src/; tests/helpers.ts (shared), property-helpers.ts (pending #234)
- num() unwraps branded types; biome-ignore for branded casts

## Open PRs
- #234 OPEN: property-helpers shared PRNG extraction — clean
- #245 OPEN: 3 missing setExcerpts invariant tests — clean

## Backlog
1. anchor bias-at-boundary — BLOCKED (excerptAt not bias-aware)
2. singleton optimization — feature unimplemented
3. edit-proxy cross-excerpt — BLOCKED
4. e2e Playwright (#119)
5. fast-check fuzz (#80, approved) — precursor #234 pending
6. reDiff→edit view consistency regression test — BLOCKED pending #239/#246/#250

## Round-Robin
Last: 2026-03-18 run 23240527188; tasks: 4,5,6,7. Next: 1,2,3,7.

## Notes
- setExcerpts() bug (#244): doesn't update _bufferToExcerpts; fix PRs: #239, #246, #250 (all open)
- PR #243 (Implementor): MultiBuffer observer events on/off — open, clean, 14 tests
- controller.test.ts: local editBuffer helper + inline mbRow/mbPoint casts (vs helpers.ts)
- Repo Assist active; check for overlap before PRs/issues
