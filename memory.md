# Test Improver Memory

## Commands
- `bun test`/`bun run typecheck`/`bun run lint` — CI only (bun not in runner)
- CI: install→build:demo→typecheck→lint→test. No coverage. Bot PRs need manual CI trigger.

## Framework
- bun:test; tests/ mirrors src/; helpers: tests/helpers.ts
- `num()` unwraps branded types; biome-ignore for branded casts

## Open Test Improver PRs
- #214 OPEN: buffer property tests (2026-03-14)
- Branch test-assist/snapshot-version-invariants-1773570737 SUBMITTED (2026-03-15)

## Backlog
1. anchor bias-at-boundary — BLOCKED (excerptAt not bias-aware)
2. singleton optimization test — feature unimplemented
3. edit-proxy cross-excerpt — BLOCKED
4. e2e Playwright (#119)

## Round-Robin
Last run: 2026-03-15 run 23108536068; tasks done: 2,3,7. Next: 4,5,6,7.

## Notes
- snapshot.version: global counter, increments in _rebuildCache(). Same state=same version; different instances=different versions. (tested in snapshot-version PR)
- fast-check approved #80; bun.lock frozen prevents dep install in runner
- Merged PRs: #95,#88,#127,#191,#193,#203 (all merged promptly)
