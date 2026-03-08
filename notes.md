# Perf Improver

## Commands
`curl -fsSL https://bun.sh/install | bash && export PATH="$HOME/.bun/bin:$PATH" && bun install --frozen-lockfile`
bun test / bun run benchmarks/index.ts / bun run lint / bun run typecheck
typecheck fails in demo/demo.ts only (pre-existing)

## Done
- #48 merged: Rope.line() O(log n) + offsetToLineCol indexOf
- #51 open: Rope.lines() single-pass; 3.8-4.2x
- #52 open: MultiBufferSnapshot.lines() Map+bulk; 1.3x
- perf-assist/rope-linecol-indexof open: lineColToOffset indexOf; 3.3x (pointToOffset mid: 1.12µs→0.34µs)

## Backlog
1. Rope insert/delete structural sharing
2. lineColToOffset cross-chunk bug (lines >1024 chars)

## State
- Round-robin next: 1,2 (or 3 if more backlog items identified)
- Monthly issue: #49 March 2026
