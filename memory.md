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
1. WrapMap class — ✅ PR test-assist/wrapmap-class-coverage (2026-03-08)
2. movePage cursor — untested, low priority
3. input-handler.ts, dom.ts — DOM-dependent, needs browser env

## Round-Robin
Last: 2026-03-08; done: 1,2,3,7
Next: tasks 4,5,6
