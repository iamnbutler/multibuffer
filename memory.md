# Test Improver Memory

## Commands
- bun test/typecheck/lint — CI only (bun not in runner); no coverage configured
- CI: install→build:demo→typecheck→lint→test

## Framework
- bun:test; tests/ mirrors src/; tests/helpers.ts, tests/property-helpers.ts
- `num()` unwraps branded types; biome-ignore for branded casts

## Open Test Improver PRs
- #234 OPEN: property-helpers shared PRNG extraction (2026-03-16)
- branch test-assist/setexcerpts-invariant-tests-1773744165 SUBMITTED (2026-03-17)

## Backlog
1. anchor bias-at-boundary — BLOCKED (excerptAt not bias-aware)
2. singleton optimization test — feature unimplemented
3. edit-proxy cross-excerpt — BLOCKED
4. e2e Playwright (#119)
5. fast-check fuzz tests (#80, approved) — property-helpers.ts in place

## Round-Robin
Last run: 2026-03-17 run 23189994499; tasks: 2,3,4,7. Next: 1,5,6,7.

## Notes
- Recent merges: #214 (buffer property tests), #226 (snapshot version invariants) — 2026-03-16
- snapshot.version: increments in _markDirty()
- bun.lock frozen prevents dep install
- setExcerpts() bug: doesn't update _bufferToExcerpts → edit() won't refresh snapshots
  Fixed by Repo Assist PR #239; Test Improver filed duplicate bug issue
- Repo Assist active in repo — check for overlap before PRs/issues
- PR #243 (Implementor): MultiBuffer observer events on/off
