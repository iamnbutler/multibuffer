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
1. Editor indent/dedent cursor positions — PR #69 open (branch test-assist/indentation-cursor-gaps-95278efc6ceb4fe0, base: feat/indentation)
2. multibuffer anchor todos — PR #70 open (branch test-assist/multibuffer-anchor-todos); 15 of 18 todos; 3 remaining: snapshot versioning + 2 benchmark stubs
3. movePage cursor — PR queued 2026-03-09 (branch test-assist/movepage-cursor-tests, 9 tests)
4. input-handler.ts, dom.ts — DOM-dependent, needs browser env
5. excerpt.test.ts todos: bias-at-excerpt-boundary (3 tests — depend on unimplemented feature)
6. multibuffer.test.ts: 3 remaining todos (snapshot versioning + benchmarks)

## Round-Robin
Last: 2026-03-09; done: 3,4,5,7
Next: tasks 1,2,6,7
