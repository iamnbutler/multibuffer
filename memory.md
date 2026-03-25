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
- TBD: moveWordBoundary unit tests (branch: test-assist/cursor-word-boundary, PR# pending)

## Backlog
1-3: anchor bias/singleton/edit-proxy — BLOCKED (unimplemented APIs)

## Round-Robin
Last: 2026-03-25 run 23536619797; tasks 1,2,3,7. Next: 4,5,6,7.

## Notes
- Pre-existing failures: canvas/webgpu; src/react/ typecheck
- No test.todo items remain; maintainer added 215 tests in #348
- moveWordBoundary (added in #351) now has 11 direct unit tests
