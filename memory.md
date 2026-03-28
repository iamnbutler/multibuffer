# Test Improver Memory

## Commands
bun test/typecheck/lint/fuzz/test:e2e; CI: install→build:demo→typecheck→lint→test; no coverage

## Framework
bun:test; tests/ mirrors src/; helpers.ts+property-helpers.ts; num() unwraps brands; biome-ignore for casts

## Open PRs (all clean)
#312 multi-cursor undo/redo; #335 ProjectTree dir get/has; #357 cross-line word movement; #368 moveWordBoundary

## Backlog (all BLOCKED on unimplemented APIs)
anchor bias/singleton/edit-proxy; future: #375 editBatch, #374 FileNavigator, #376 multi-lang highlighting (after merge)

## Round-Robin
Last: 2026-03-28 run 23683287775; tasks 4,5,6,7. Next: 1,2,3,7.

## Notes
Pre-existing failures: canvas/webgpu; src/react/ typecheck. Main=ce545ec since 2026-03-23.
Maintainer created PR #373 (diff-styles+helpers tests) referencing issue #46 — confirming active engagement.
Maintainer's 2026-03-26 comment on #46 lists all 4 open Test Improver PRs as pending review.
Large batch of Repo Assist PRs open (#374-#387+) — main unchanged; test opportunities emerge when they merge.
