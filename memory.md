# Test Improver Memory

## Commands
- `bun test` / `bun run typecheck` / `bun run lint` — valid via CI
- CI: install → build:demo → typecheck → lint → test. No coverage.
- ⚠️ CI does NOT auto-run on bot-created PRs (GITHUB_TOKEN). PRs stay "pending".

## Framework
- bun:test; tests/ mirrors src/; helpers: tests/helpers.ts
- Biome no-type-assertion — biome-ignore for branded casts

## Open PRs (CI pending — CI won't auto-trigger)
- #69: 4 cursor tests indent/dedent/auto-indent
- #70: 15 anchor todos in multibuffer.test.ts
- #71: 5 excerpt todos (empty layout + ID monotonicity)
- #72: 8 movePage tests — DUPLICATE of #73, close this
- #73: 9 movePage tests — keep

## Backlog (prioritized)
1. excerpt.test.ts anchor stability (5 todos) — IMPLEMENTABLE
2. selection.test.ts — sparse (6 tests), extendSelection head-flip untested
3. excerpt.test.ts trailing newline position — IMPLEMENTABLE
4. Infra: expectRange/expectSelection helpers missing from tests/helpers.ts
5. multibuffer.test.ts: 3 todos (snapshot versioning + benchmarks) — UNIMPLEMENTED feature
6. excerpt.test.ts anchor bias-at-boundary (3) — BLOCKED
7. edit-proxy.test.ts 2 cross-excerpt stubs — BLOCKED
8. input-handler.ts, dom.ts: DOM-dependent, skip

## Round-Robin
Last: 2026-03-09 (run 22849273153); done: 4,7
Next: 1,3,6,7 — excerpt anchor stability + selection.test.ts
Note: hold off new PRs until maintainer reviews #69-73
