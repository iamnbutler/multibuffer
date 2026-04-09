# Test Improver Memory
cmds: bun test/typecheck/lint/fuzz/test:e2e; CI: install->build:demo->typecheck->lint->test; no coverage; bun not in runner
fw: bun:test; helpers.ts+property-helpers.ts; num() unwraps brands; biome-ignore for casts
PRs (2026-04-09 clean): #312 #335 #357 #368; #373 unstable (maintainer's, Repo Assist pinged 2026-04-09)
Backlog (blocked): #400 anchor bias; singleton opt unimplemented; edit-proxy cross-excerpt unimplemented
Future: #375 #374 #376 #408 #412
round-robin: last=2026-04-09/24185924743 tasks=3,4,5,7; next=1,2,6,7
state: main=ce545ec/2026-03-23; #409 updated 2026-04-09; no TI merges since 2026-03-26; suite mature
