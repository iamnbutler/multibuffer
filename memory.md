# Test Improver Memory

## Commands
- `bun test` — valid (bun not in runner; CI uses ubuntu-latest + setup-bun)
- CI: install→build:demo→typecheck→lint→test. No coverage.
- Helpers: tests/helpers.ts (mbPoint, resetCounters, excerptRange, etc.)
- Biome: biome-ignore for branded casts; bun:test framework

## PRs Open
- #69: indent/dedent cursor tests (base: main)
- #70: 15 anchor todos (base: main)
- movepage-cursor-coverage: 8 movePage tests (queued 2026-03-09)

## Backlog
1. WrapMap — wrap-map.test.ts already has 43 tests
2. Input-handler/dom.ts — DOM-dependent, skip
3. excerpt.test.ts: 3 bias-at-excerpt-boundary todos (unimplemented feature)
4. multibuffer.test.ts: 3 todos (snapshot versioning + benchmarks)

## Round-Robin
Last: 2026-03-09; done: 3,4,5,7
Next: tasks 1,2,6,7
