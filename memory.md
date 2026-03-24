# Test Improver Memory

## Commands
- bun test/typecheck/lint/fuzz/test:e2e (e2e needs serve:playground); no coverage in CI
- CI: install→build:demo→typecheck→lint→test

## Framework
- bun:test; tests/ mirrors src/; helpers.ts + property-helpers.ts
- num() unwraps branded types; biome-ignore for branded casts

## Open PRs
- #312: multi-cursor undo/redo tests (clean)
- #335: ProjectTree get/has dir tests (clean)
- #357: cursor cross-line word movement tests (clean)

## Backlog
1-3: anchor bias/singleton/edit-proxy — BLOCKED (unimplemented APIs)

## Round-Robin
Last: 2026-03-24 run 23485057740; tasks 4,5,6,7. Next: 1,2,3,7.

## Notes
- Pre-existing failures: canvas/webgpu; src/react/ typecheck
- No test.todo items remain; maintainer added 215 tests in #348
