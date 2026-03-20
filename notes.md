# Notes
cmds: bun test / bun run benchmarks/index.ts / bun run lint / bun run typecheck
open_prs: PR#310 (version-cache+diffLines-mismatch, open since 2026-03-18)
monthly: #325
backlog: 1)diffLines-mismatch-fast-path(HIGH,in#310scope) 2)reDiff-use-diffLines(HIGH) 3)rope-text-join(MEDIUM) 4)wrapmap-segCharStart-copy(MEDIUM,RepoAssist-owns) 5)add-rope-text-bench
last_run: 2026-03-20 run 23354574825
bench: cache-hit=0.30us after-edit-1K=0.772ms after-edit-10K=1.898ms
notes: Repo Assist PR#311 handles wrapLine string allocs (NOT O(n^2) copy); canvas/projecttree/e2e - no new perf opportunities; diffLines() lacks length-mismatch fast-path (still open)
checked_off: none-yet
