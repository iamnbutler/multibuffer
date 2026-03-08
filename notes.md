# Perf Improver

## Commands
`curl -fsSL https://bun.sh/install | bash && export PATH="$HOME/.bun/bin:$PATH" && bun install --frozen-lockfile`
bun test / bun run benchmarks/index.ts / bun run lint / bun run typecheck
typecheck fails in demo/demo.ts only (pre-existing)

## Done
- #48 merged: Rope.line() O(log n) + offsetToLineCol indexOf
- #51 open: Rope.lines() single-pass; 3.8-4.2x
- perf-assist/multibuffer-snapshot-lines-bulk open: MultiBufferSnapshot.lines() Map+bulk; 1.3x

## Backlog
1. lineColToOffset charCodeAt→indexOf
2. Rope insert/delete structural sharing
3. lineColToOffset cross-chunk bug (lines >1024 chars)

## State
- Round-robin next: 5,6
- Monthly issue: #49 March 2026
