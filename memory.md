# Test Improver Memory

## Commands
- `bun test`/`bun run typecheck`/`bun run lint` — CI only (bun not in runner)
- CI: install→build:demo→typecheck→lint→test. No coverage. Bot PRs need manual CI trigger.

## Framework
- bun:test; tests/ mirrors src/; helpers: tests/helpers.ts, tests/property-helpers.ts
- `num()` unwraps branded types; biome-ignore for branded casts

## Open Test Improver PRs
- #214 OPEN: buffer property tests (2026-03-14)
- #226 OPEN: snapshot version invariant tests (2026-03-15)
- test-assist/property-helpers-shared-prng SUBMITTED (2026-03-16)

## Backlog
1. anchor bias-at-boundary — BLOCKED (excerptAt not bias-aware)
2. singleton optimization test — feature unimplemented
3. edit-proxy cross-excerpt — BLOCKED
4. e2e Playwright (#119)
5. fast-check fuzz tests (#80, approved) — property-helpers.ts now in place

## Round-Robin
Last run: 2026-03-16 run 23139515464; tasks done: 4,5,6,7. Next: 1,2,3,7.

## Notes
- Merged PRs: #95,#88,#127,#191,#193,#203 (all merged promptly)
- snapshot.version: global counter, increments in _rebuildCache()
- bun.lock frozen prevents dep install in runner
