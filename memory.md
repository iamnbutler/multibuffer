# Test Improver Memory

## Commands
- `bun test` / `bun run typecheck` / `bun run lint` (CI only, bun not in runner)
- CI: install → build:demo → typecheck → lint → test. No coverage.
- ⚠️ CI does NOT auto-run on bot-created PRs. Trigger manually.

## Framework
- bun:test; tests/ mirrors src/; helpers: tests/helpers.ts
- `offset()` in helpers.ts creates BufferOffset branded type
- Biome no-type-assertion — biome-ignore for branded casts

## Recent PR Outcomes (2026-03-10)
- #70 MERGED (anchor todos), #71 MERGED (excerpt todos), #73 MERGED (movePage)
- #69 cherry-picked, #72 closed (duplicate)
- New: branch test-assist/excerpt-anchor-stability-1773225728 (5 anchor stability tests, PR# TBD)

## Backlog
1. excerpt anchor stability — ✅ PR submitted (pending #)
2. excerpt.test.ts trailing newline (off-by-one in toBufferPoint)
3. selection.test.ts head-flip when extending past anchor (7 tests exist, head-flip missing)
4. anchor.test.ts bias-at-boundary (3) + expand (1) — BLOCKED
5. multibuffer.test.ts 3 todos (snapshot versioning + benchmarks) — feature unimplemented
6. edit-proxy.test.ts 2 cross-excerpt — BLOCKED
7. Repo Assist PRs #90,#91,#93: new features, may need tests when merged

## Round-Robin
Last: 2026-03-11 (run 22948165097); done: 3,7
Next: 2,5,6,7 — trailing newline + selection head-flip
