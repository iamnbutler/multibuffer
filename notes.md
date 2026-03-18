# Notes
cmds: bun test / bun run benchmarks/index.ts / bun run lint / bun run typecheck
open_prs: perf-assist/diffLines-in-reDiff (version-cache+diffLines, PR#pending)
monthly: #49
backlog: 1)diff-worst-case 2)injection-find(low) 3)canvas-webgpu-bench(browser-needed)
last_run: 2026-03-18 run 23258382691
bench: cache-hit=0.30us after-edit-1K=0.772ms after-edit-10K=1.898ms
notes: diffLines slower than diff for unchanged buffers (rope.text single-chunk=same-ref+string-interning); version-cache is better; PRs #238+#250 merged; 10 pre-existing test fails (browser); src/react typecheck errors pre-existing
checked_off: none-yet
