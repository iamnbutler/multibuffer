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

## Recent PR Outcomes (2026-03-12)
- #95 MERGED (anchor stability), #88 MERGED (editor coverage gaps)
- #104: major module split — paths changed (src/multibuffer_renderer → src/renderer)
- #105: diff module (Myers algorithm, 20 tests) — fully tested
- #113/#120: non-editable excerpts (22 tests) — fully tested
- #114/#121: line decoration rendering (9 tests) — fully tested
- Current: branch test-assist/trailing-newline-selection-head-flip (PR TBD)

## Backlog
1. excerpt trailing newline anchor — ✅ PR submitted (pending #)
2. selection head-flip — ✅ PR submitted (pending #)
3. anchor.test.ts bias-at-boundary (3) + expand (1) — BLOCKED
4. multibuffer.test.ts 3 todos (snapshot versioning + benchmarks) — feature unimplemented
5. edit-proxy.test.ts 2 cross-excerpt — BLOCKED
6. excerpt.test.ts trailing newline (off-by-one) — ✅ done in same PR

## Round-Robin
Last: 2026-03-12 (run 22997567773); done: 2,3,7
Next: 4,5,6,7 — anchor infra, comment on issues
