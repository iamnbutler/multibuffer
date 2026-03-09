# Test Improver Memory

## Commands
- `bun test` / `bun run typecheck` / `bun run lint` — valid via CI (ubuntu-latest + setup-bun)
- CI: install → build:demo → typecheck → lint → test. No coverage.
- ⚠️ CI does NOT auto-run on bot-created PRs (GITHUB_TOKEN restriction). PRs stay "pending" indefinitely.

## Framework
- bun:test; tests/ mirrors src/; helpers: tests/helpers.ts
- Biome no-type-assertion — biome-ignore for branded casts

## Open PRs (all targeting main, all CI pending — CI won't auto-trigger for bot PRs)
- #69: 4 cursor tests for indent/dedent/auto-indent
- #70: 15 anchor todos in multibuffer.test.ts
- #71: 5 excerpt todos (empty layout + ID monotonicity)
- #72: 8 movePage tests — DUPLICATE of #73, close this
- #73: 9 movePage tests — keep this one

## Backlog (prioritized)
1. excerpt.test.ts anchor stability (5 todos) — likely IMPLEMENTABLE via createAnchor/resolveAnchor
2. selection.test.ts — sparse (6 tests), extendSelection head-flip untested
3. excerpt.test.ts "position conversion accounts for trailing newline" — IMPLEMENTABLE
4. Infra: expectRange/expectSelection helpers missing from tests/helpers.ts
5. multibuffer.test.ts: 3 todos (snapshot versioning + benchmarks) — UNIMPLEMENTED feature
6. excerpt.test.ts: anchor bias-at-boundary (3) — BLOCKED (bias-aware excerptAt missing)
7. edit-proxy.test.ts: 2 cross-excerpt stubs — BLOCKED (cross-excerpt edit unimplemented)
8. input-handler.ts, dom.ts: DOM-dependent, skip

## Round-Robin
Last: 2026-03-09 (runs 22835047940 + 22835060326); done: 2,4,7
Next: tasks 1,3,6,7 — prioritize excerpt anchor stability and selection.test.ts
Note: hold off on new PRs until maintainer reviews open stack (#69-73)
