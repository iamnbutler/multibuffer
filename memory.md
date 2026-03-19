cmds: bun test / bun run bench / bun run lint / bun run typecheck | bun NOT in runner
open_prs: #310 version-cache-reDiff (clean/open) branch:perf-assist/difflines-in-rediff-95f67cf6e28b534b
monthly: created 2026-03-19
last_run: 2026-03-19 run:23308172394
bench: cache-hit=0.30us 1K-edit=0.772ms 10K-edit=1.898ms
notes: diffLines slower than diff for single-chunk ropes; version-cache better; 10 pre-existing browser fails; PRs #238+#250 merged
backlog: 1)reDiff/diffLines-opt(multi-chunk) 2)Rope.text-join 3)WrapMap-segCharStart-prealloc 4)text()-bench-gap
tasks_2026-03-19: 1,2,4,7 done; 3=no-bun; 5,6=skipped
