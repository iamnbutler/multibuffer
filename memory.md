# Test Improver Memory

## Commands
- `bun test` — valid; bun not in runner, use locally or CI (ubuntu-latest + setup-bun)
- CI: install → build:demo → typecheck → lint (biome) → test. No coverage.

## Framework
- bun:test; tests/ mirrors src/
- Helpers: tests/helpers.ts (num, mbPoint, resetCounters, excerptRange, etc.)
- Biome no-type-assertion — biome-ignore for branded casts
- Snapshot: createBuffer+createMultiBuffer+addExcerpt(buf,excerptRange(0,n))+snapshot()

## Backlog
1. WrapMap class — addressed first run (no PR); wrap-map.test.ts already has 43 tests
2. Editor indent/dedent cursor positions — PR #69 open (branch test-assist/indentation-cursor-gaps-95278efc6ceb4fe0, base: main)
3. multibuffer anchor todos — PR #70 open (branch test-assist/multibuffer-anchor-todos-3aea22272986180a); 15 of 18 todos implemented; 3 remaining: snapshot versioning + 2 benchmark stubs
4. excerpt.test.ts empty excerpts + ID monotonicity — PR queued 2026-03-09 (branch test-assist/excerpt-empty-and-id-monotonicity); 5 todos implemented
5. excerpt.test.ts Anchor Stability todos (5 stubs) — risky: edits outside excerpt window may reveal anchor resolution bug; skip until human reviews
6. multibuffer.test.ts 3 remaining todos (snapshot versioning + benchmarks)
7. movePage cursor — untested, low priority
8. input-handler.ts, dom.ts — DOM-dependent, needs browser env

## Round-Robin
Last: 2026-03-09; done: 3,4,5,7
Next: tasks 1,2,6,7
