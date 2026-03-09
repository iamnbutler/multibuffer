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
1. WrapMap class — branch test-assist/wrapmap-class-coverage cleaned up (no PR)
2. Editor indent/dedent cursor positions — ✅ done 2026-03-09 (branch test-assist/indentation-cursor-gaps)
3. movePage cursor — untested, low priority
4. input-handler.ts, dom.ts — DOM-dependent, needs browser env

## Round-Robin
Last: 2026-03-09; done: 3,4,5,7
Next: tasks 1,2,6
