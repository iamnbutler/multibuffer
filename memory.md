# Test Improver Memory

## Commands
- bun test/typecheck/lint — CI only; bun run fuzz; bun run test:e2e (needs serve:playground)
- CI: install→build:demo→typecheck→lint→test; no coverage

## Framework
- bun:test; tests/ mirrors src/; helpers.ts + property-helpers.ts
- num() unwraps branded types; biome-ignore for branded casts

## Open PRs
- #312: multi-cursor undo/redo tests (clean)
- #335: ProjectTree get/has dir tests
- NEW: cross-line word movement tests (branch: test-assist/cursor-cross-line-word-movement)

## Backlog
1–3. anchor bias/singleton/edit-proxy — BLOCKED; 4–6. DONE

## Round-Robin
Last: 2026-03-23 run 23433056720; tasks 2,3,7. Next: 4,5,6,7.

## Notes
- CHECK open PRs before Task 3 (avoid RA overlap)
- Pre-existing failures: canvas/webgpu; src/react/ typecheck
- No test.todo items remain in any test file
- Maintainer added 215 tests in #348 — most gaps now filled
- cursor.test.ts word movement: only single-line; cross-line (NEW PR) fills gap
