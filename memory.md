# Test Improver Memory

## Commands
`bun test` / `bun run typecheck` / `bun run lint` / `bun run fuzz` / `bun run test:e2e`
CI: install→build:demo→typecheck→lint→test. No coverage pipeline.

## Framework
bun:test; helpers.ts+property-helpers.ts; num() unwraps brands; biome-ignore for casts

## Open Test Improver PRs (2026-04-02, all clean)
#312 multi-cursor undo/redo; #335 ProjectTree dir get/has; #357 cross-line word movement; #368 moveWordBoundary; #373 diff-styles (maintainer PR, unstable)

## Backlog (all blocked)
1. anchor bias — Repo Assist #400 pending
2. singleton optimization — unimplemented
3. edit-proxy cross-excerpt — unimplemented
Future (post-merge): #375 editBatch, #374 FileNavigator, #376 multi-lang, #387/#388/#391/#392 no-op version bumps, #408 moveExcerpt, #412 findNearest

## Round-Robin
Last: 2026-04-02 run 23896313848; tasks 1,2,7. Next: 3,4,5,7.

## State
Main=ce545ec since 2026-03-23. April issue #409 open.
No merges of Test Improver PRs since 2026-03-26.
2026-04-02: Full search found no new high-value test opportunities. Suite is mature.
