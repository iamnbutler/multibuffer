# Test Improver Memory

## Commands
- bun test/typecheck/lint — CI only; bun run fuzz; bun run test:e2e (needs serve:playground)
- CI: install→build:demo→typecheck→lint→test; no coverage

## Framework
- bun:test; tests/ mirrors src/; helpers.ts + property-helpers.ts; fuzz/arbitraries.ts
- num() unwraps branded types; biome-ignore for branded casts

## Open PRs
- #312: 5 multi-cursor undo/redo tests (clean)
- #335: 5 ProjectTree get/has dir tests; 2 overlap with RA #326 (different file locations)

## Backlog
1–3. anchor bias/singleton/edit-proxy — BLOCKED; 4–6. DONE

## Round-Robin
Last: 2026-03-22 run 23401104682; tasks 4,5,6,7. Next: 2,3,7.

## Notes
- CHECK open PRs before Task 3 (avoid Repo Assist overlap)
- Pre-existing failures: canvas/webgpu (browser); src/react/ typecheck
- RA #326: ProjectTree edge-cases (overlaps with #335); RA #330: fix shouldTraverseDirectory
- No test.todo items remain in any test file
- Maintainer engaged: commented on issue #46 (2026-03-19) — actively reading updates
- TDD pre-written tests exist: metadata.test.ts, buffer-index.test.ts (for upcoming features)
