# Perf Improver Memory

## Commands (2026-03-08)
- `bun install --frozen-lockfile` / `bun test` / `bun run bench` / `bun run lint` / `bun run typecheck` / `bun run build:demo`
- bun not pre-installed: `curl -fsSL https://bun.sh/install | bash`

## Completed
- 2026-03-08: Rope.line() O(n)→O(log n) binary search + offsetToLineCol indexOf loop
  - Benchmarks: 20/24→24/24 pass. Branch: perf-assist/rope-line-binary-search

## Backlog
1. Rope.lines() bulk fetch (calls line() per row)
2. Rope insert/delete structural sharing (O(n) string concat)
3. lineColToOffset cross-chunk bug (lines >1024 chars)

## Round-robin (last 2026-03-08): Tasks 1,3,7 done. Next: 2,4,5,6
