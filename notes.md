# Perf Improver Notes

cmds: bun test / bun run benchmarks/index.ts / bun run lint / bun run typecheck
install: curl https://bun.sh/install | bash && export PATH="$HOME/.bun/bin:$PATH" && bun install --frozen-lockfile

merged: #48 #51 #52(manual) #53 #54 #55
open_prs: #56(wrapLineCount) + pending(excerptSummaryFastPath+editor-benchmarks, run 22866139507)
monthly: #49
backlog: 1)rope-struct-sharing 2)_captureEntry-undo 3)linecol-cross-chunk 4)countNewlines-indexOf
last_run: 2026-03-09 run 22866139507 Task4+Task6/3+Task7
perf: excerptSummary O(1) fastpath: 1K insert 0.258->0.130ms(2x) 10K 2.431->1.101ms(2.2x)
bench: 41 pass; tests: 614 pass 35 todo
