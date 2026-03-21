# Test Improver Memory

## Commands
- bun test/typecheck/lint — CI only; bun run fuzz; bun run test:e2e (needs serve:playground)
- CI: install→build:demo→typecheck→lint→test; no coverage

## Framework
- bun:test; tests/ mirrors src/; helpers.ts + property-helpers.ts; fuzz/arbitraries.ts
- num() unwraps branded types; biome-ignore for branded casts

## Open PRs
- #312: 5 multi-cursor undo/redo tests (clean)
- branch test-assist/project-tree-directory-get: 5 ProjectTree get/has dir tests; 3 unique vs RA #326

## Backlog
1–3. anchor bias/singleton/edit-proxy — BLOCKED; 4–6. DONE

## Round-Robin
Last: 2026-03-21 run 23377655770; tasks 2,3,7. Next: 4,5,6,7.

## Notes
- CHECK open PRs before Task 3 (avoid Repo Assist overlap)
- Pre-existing failures: canvas/webgpu (browser); src/react/ typecheck
- RA #326: ProjectTree edge-cases (overlaps with my project-tree-directory-get)
- RA #330: fix shouldTraverseDirectory prefix-match false-positive
