# Test Improver Memory

## Commands
- bun test/typecheck/lint — CI only; no coverage
- bun run fuzz — tests/fuzz/ (fast-check, separate from main suite)
- bun run test:e2e — Playwright (needs serve:playground)
- CI: install→build:demo→typecheck→lint→test

## Framework
- bun:test; tests/ mirrors src/; helpers.ts + property-helpers.ts
- fuzz/arbitraries.ts — fast-check shared arbitraries
- num() unwraps branded types; biome-ignore for branded casts

## Open PRs
- #312: 5 multi-cursor undo/redo tests (clean)

## Backlog (all blocked/done)
1. anchor bias-at-boundary — BLOCKED
2. singleton optimization — unimplemented
3. edit-proxy cross-excerpt — BLOCKED
4-6. e2e/fuzz/reDiff — all DONE

## Round-Robin
Last: 2026-03-20 run 23338889370; tasks 4,5,6,7. Next: 1,2,3,7.

## Notes
- All unblocked items done; 3 todos still blocked on unimplemented APIs
- 2026-03-19 wave: ProjectTree, Playwright, fuzz, bracketMatch, DiffEditorView, lang queries — all w/ tests
- Repo Assist active; avoid overlap
- Pre-existing: canvas/webgpu test failures (browser); src/react/ typecheck errors
