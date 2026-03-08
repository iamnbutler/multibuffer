# Perf Improver Memory

## Commands
- bun pre-installed at `~/.bun/bin/bun`
- `~/.bun/bin/bun test` / `~/.bun/bin/bun run benchmarks/index.ts` / `~/.bun/bin/bun run lint` / `~/.bun/bin/bun run typecheck`
- `bun run bench` fails (bun not in PATH); call benchmarks/index.ts directly
- pre-existing typecheck failures in demo/demo.ts — not caused by perf changes

## Completed
- 2026-03-08: #48 merged — Rope.line() O(n)→O(log n) + offsetToLineCol indexOf
- 2026-03-08: PR submitted — Rope.lines() O(k·log n)→O(n) single-pass scan (perf-assist/rope-lines-single-pass)
  - 50-line viewport: 0.015ms→0.0039ms (3.8×); 10K WrapMap: 2.881ms→0.684ms (4.2×)

## Backlog
1. lineColToOffset charCodeAt→indexOf (small, same pattern as #48)
2. Rope insert/delete structural sharing (no O(n) string concat on edit)
3. MultiBufferSnapshotImpl.lines() — build excerptData Map, not per-row find()
4. lineColToOffset cross-chunk bug (lines >1024 chars)

## Round-robin
- Run 1 (2026-03-08): Tasks 1,3,7
- Run 2 (2026-03-08): Tasks 3,7; next: 2,4,5,6

## Monthly Activity Issue: #49 (March 2026, open)
