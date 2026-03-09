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
3. multibuffer anchor todos — PR created 2026-03-09 (test-assist/multibuffer-anchor-todos); 15 of 18 todos implemented; 3 remaining: snapshot versioning + 2 benchmark stubs
4. movePage cursor — untested, low priority
5. input-handler.ts, dom.ts — DOM-dependent, needs browser env
6. excerpt.test.ts todos: "position conversion accounts for trailing newline", bias-at-excerpt-boundary (3 tests — depend on unimplemented feature)
7. multibuffer.test.ts: 3 remaining todos (snapshot versioning + benchmarks)

## Round-Robin
Last: 2026-03-09; done: 1,2,6,7
Next: tasks 3,4,5,7
