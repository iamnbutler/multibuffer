# Test Improver Memory

## Commands
- `bun test` / `bun run typecheck` / `bun run lint` (CI only, bun not in runner)
- CI: install → build:demo → typecheck → lint → test. No coverage.
- ⚠️ CI does NOT auto-run on bot-created PRs. Trigger manually.

## Framework
- bun:test; tests/ mirrors src/; helpers: tests/helpers.ts
- `offset()` in helpers.ts creates BufferOffset branded type
- Biome no-type-assertion — biome-ignore for branded casts
- Module split in #104: src/{buffer,multibuffer,editor,renderer,diff}/
  Tests: tests/{multibuffer,editor,renderer,diff}/*.test.ts

## Recent PR Outcomes
- #95 MERGED (anchor stability), #88 MERGED (editor coverage gaps)
- #127 MERGED 2026-03-12 (trailing-newline anchor + selection head-flip)
- #104: major module split — paths changed
- #105: diff module (Myers algorithm, 20 tests) — fully tested
- #113/#120: non-editable excerpts (22 tests) — fully tested
- #114/#121: line decoration rendering (9 tests) — fully tested
- #143: DiffController — controller.test.ts (23 tests) fully tested
- #144: cross-excerpt same-buffer editor fix — already tested in controller.test.ts
- #151: implementor agent added

## Backlog
1. anchor.test.ts "anchor survives excerpt expansion" — ✅ PR submitted (2026-03-13, branch test-assist/anchor-expansion-1773398270)
2. anchor.test.ts bias-at-excerpt-boundary (3) — BLOCKED (need bias-aware excerptAt)
3. multibuffer.test.ts 3 todos (snapshot versioning + benchmarks) — feature unimplemented
4. edit-proxy.test.ts 2 cross-excerpt — BLOCKED (document unimplemented clipping)
5. tests/e2e/ Playwright — tracked in #119

## Round-Robin
Last: 2026-03-13 (run 23046761156); done: 3,5,7
Next: 4,6,7 — PR maintenance, infra, comment on #80

## Notes
- rope.property.test.ts exists (dependency-free property tests, no fast-check)
- expandExcerpt IS implemented (unblocked anchor expansion test)
- excerptAt is NOT bias-aware (still blocks bias-at-boundary todos)
- Cross-excerpt same-buffer edits handled in editor._edit() not mb.edit()
