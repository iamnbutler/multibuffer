# Perf Improver Notes

cmds: bun test / bun run benchmarks/index.ts / bun run lint / bun run typecheck
install: curl https://bun.sh/install | bash && export PATH="$HOME/.bun/bin:$PATH" && bun install --frozen-lockfile
note: demo typecheck pre-fails; direct path for bench

merged: #48 #51 #53 #54 #55; #52 closed(applied manually to main)
current_pr: perf-assist/wrapmap-wraplinecount (run 22830624588)
monthly: #49
backlog: 1)struct-sharing 2)_captureEntry-undo 3)linecol-cross-chunk-bug 4)countNewlines-indexOf
last_run: 2026-03-08 run 22830624588 Task3(wrapLineCount)+Task7
perf: wrapLineCount 1K-no-wrap 0.311->0.289ms 1K-wrap 0.762->0.633ms 10K 3.402->3.047ms
