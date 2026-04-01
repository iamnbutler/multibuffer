# Test Improver Memory

## Commands
bun test/typecheck/lint/fuzz/test:e2e; CI: install→build:demo→typecheck→lint→test; no coverage

## Framework
bun:test; tests/ mirrors src/; helpers.ts+property-helpers.ts; num() unwraps brands; biome-ignore for casts

## Open PRs (clean, 2026-04-01)
#312 multi-cursor undo/redo; #335 ProjectTree dir get/has; #357 cross-line word movement; #368 moveWordBoundary; #373 diff-styles (maintainer PR, unstable CI)

## Backlog
1. anchor bias todos — addressed by Repo Assist #400 (awaiting merge)
2. singleton optimization — unimplemented
3. edit-proxy cross-excerpt — BLOCKED
Future: #375 editBatch, #374 FileNavigator, #376 multi-lang, #383/#385 _edit guard, #387/#388/#391/#392 version bump edge cases, #364 replaceAll undo

## Round-Robin
Last: 2026-04-01 run 23844504446; tasks 4,5,6,7 (main unchanged). Next: 1,2,3,7.

## Notes
Main=ce545ec since 2026-03-23. Pre-existing failures: canvas/webgpu; src/react/ typecheck.
No coverage pipeline; bot PRs need manual CI trigger.
March issue #46 closed 2026-04-01; April issue created (monthly summary for April 2026).
Maintainer last commented 2026-03-26 on #46: 5 PRs pending review; no merges since then.
