# Test Improver Memory

## Commands
bun test/typecheck/lint/fuzz/test:e2e; CI: install→build:demo→typecheck→lint→test; no coverage

## Framework
bun:test; tests/ mirrors src/; helpers.ts+property-helpers.ts; num() unwraps brands; biome-ignore for casts

## Open PRs (all clean)
#312 multi-cursor undo/redo; #335 ProjectTree dir get/has; #357 cross-line word movement; #368 moveWordBoundary

## Backlog (all BLOCKED on unimplemented APIs)
anchor bias/singleton/edit-proxy; future: #360 editBatch, #364 replaceAll undo (after merge)

## Round-Robin
Last: 2026-03-26 run 23589826965; tasks 4,5,6,7. Next: 1,2,3,7.

## Notes
Pre-existing failures: canvas/webgpu; src/react/ typecheck. Main=ce545ec since 2026-03-23.
