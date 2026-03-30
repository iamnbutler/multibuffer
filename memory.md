# Test Improver Memory

## Commands
bun test/typecheck/lint/fuzz/test:e2e; CI: install→build:demo→typecheck→lint→test; no coverage

## Framework
bun:test; tests/ mirrors src/; helpers.ts+property-helpers.ts; num() unwraps brands; biome-ignore for casts

## Open PRs (all clean, as of 2026-03-30)
#312 multi-cursor undo/redo; #335 ProjectTree dir get/has; #357 cross-line word movement; #368 moveWordBoundary; #373 diff-styles+hunkToHeader (maintainer's PR, unstable CI)

## Backlog
All blocked: anchor bias/singleton/edit-proxy (unimplemented APIs); singleton optimization (unimplemented).
Future (when Repo Assist PRs merge): #375 editBatch, #374 FileNavigator, #376 multi-lang highlighting; #383/#385 _edit guard regressions; #387/#388/#391 no-op version bump edge cases; #364 replaceAll undo.

## Round-Robin
Last: 2026-03-30 run 23740743546; tasks 4,5,6,7. Next: 1,2,3,7.

## Notes
Pre-existing failures: canvas/webgpu; src/react/ typecheck. Main=ce545ec since 2026-03-23.
Maintainer's 2026-03-26 comment on #46 lists 5 open PRs (#312,#335,#357,#368,#373) as pending review.
20+ Repo Assist PRs open (#364-#397) — main unchanged; coverage comprehensive across all source areas.
No coverage pipeline configured; CI limitation: bot PRs won't auto-run CI.
