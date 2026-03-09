# Test Improver Memory

## Commands
- `bun test` / `bun run typecheck` / `bun run lint` — valid via CI (ubuntu-latest + setup-bun)
- CI: install → build:demo → typecheck → lint → test. No coverage.

## Framework
- bun:test; tests/ mirrors src/; helpers: tests/helpers.ts
- Biome no-type-assertion — biome-ignore for branded casts

## Open PRs (all targeting main, all CI pending)
- #69: cursor tests, base feat/indentation
- #70: 15 anchor todos in multibuffer.test.ts
- #71: 5 excerpt todos (empty layout + ID monotonicity)
- #72: 8 movePage tests (DUPLICATE of #73)
- #73: 9 movePage tests (DUPLICATE of #72) — keep #73, close #72

## Backlog
1. multibuffer.test.ts: 3 todos (snapshot versioning + benchmarks, unimplemented)
2. excerpt.test.ts: 8 anchor-in-excerpt todos (unimplemented feature)
3. edit-proxy.test.ts: 2 cross-excerpt delete stubs (unimplemented)
4. selection.test.ts: sparse (6 tests), extendSelection head-flip untested
5. Infra: expectRange/expectSelection helpers gap in tests/helpers.ts
6. input-handler.ts, dom.ts: DOM-dependent, skip

## Round-Robin
Last: 2026-03-09; done: 2,4,7
Next: tasks 1,3,6,7
