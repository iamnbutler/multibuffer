# Test Improver Memory

## Commands
- `bun test` / `bun run typecheck` / `bun run lint` (CI only, bun not in runner)
- CI: install → build:demo → typecheck → lint → test. No coverage.
- ⚠️ CI does NOT auto-run on bot-created PRs. Trigger manually.

## Framework
- bun:test; tests/ mirrors src/; helpers: tests/helpers.ts
- `offset()` in helpers.ts creates BufferOffset branded type; `num()` unwraps branded types
- Biome no-type-assertion — biome-ignore for branded casts
- Module split in #104: src/{buffer,multibuffer,editor,renderer,diff}/
  Tests: tests/{multibuffer,editor,renderer,diff}/*.test.ts

## Recent PR Outcomes
- #95 MERGED (anchor stability), #88 MERGED (editor coverage gaps)
- #127 MERGED 2026-03-12 (trailing-newline anchor + selection head-flip)
- #191 MERGED 2026-03-13 (anchor survives excerpt expansion — my PR)
- #193 MERGED 2026-03-13 (adjustOffset 27 tests — others)
- #203 MERGED 2026-03-13 (multibuffer anchor todos: "anchors work with old snapshots" + anchor resolution benchmark)
- #104: major module split — paths changed

## Backlog
1. anchor.test.ts "anchor survives excerpt expansion" — ✅ MERGED #191
2. anchor.test.ts bias-at-excerpt-boundary (3) — BLOCKED (need bias-aware excerptAt)
3. multibuffer.test.ts "singleton optimization speedup" — still todo (others merged in #203)
4. edit-proxy.test.ts 2 cross-excerpt — BLOCKED (document unimplemented clipping)
5. tests/e2e/ Playwright — tracked in #119
6. Buffer property tests (version monotonicity, snapshot immutability, editsSince) — ✅ PR submitted 2026-03-14 (branch test-assist/buffer-property-tests-1773484261)

## Round-Robin
Last: 2026-03-14 (run 23086139614); done: 4,6,7
Next: 2,3,5,7

## Notes
- rope.property.test.ts exists (dependency-free property tests, no fast-check)
- buffer.property.test.ts NEWLY ADDED this run (same pattern, 4 property suites)
- expandExcerpt IS implemented (unblocked anchor expansion test)
- excerptAt is NOT bias-aware (still blocks bias-at-boundary todos)
- Cross-excerpt same-buffer edits handled in editor._edit() not mb.edit()
- fast-check approved by maintainer in #80; bun.lock frozen prevents adding dep via runner
- Many merges 2026-03-13 by other agents: #189 clipPoint bias, #192 bench-history refactor, #148 rope.byteLength
