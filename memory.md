# Test Improver Memory

cmds: `bun test` `bun run typecheck` `bun run lint` `bun run fuzz` `bun run test:e2e`; CI: install→build:demo→typecheck→lint→test; no coverage; bun not in runner
fw: bun:test; helpers.ts+property-helpers.ts; num() unwraps brands; biome-ignore for casts

PRs (2026-04-03 all clean): #312 undo/redo; #335 ProjectTree; #357 cross-line word; #368 moveWordBoundary; #373 diff-styles (maintainer, unstable)

Backlog (all blocked): anchor bias (#400 pending); singleton opt (unimplemented); edit-proxy cross-excerpt (unimplemented)
Future: #375 #374 #376 #387-392 #408 #412

round-robin: last=2026-04-03/23943223916 tasks=4,5,3,7; next=1,2,6,7
state: main=ce545ec/2026-03-23; #409 updated 2026-04-03; no TI PR merges since 2026-03-26; suite mature
