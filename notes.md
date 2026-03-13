# Notes

cmds: ~/.bun/bin/bun test / bun run benchmarks/index.ts / bun run lint
install: curl https://bun.sh/install | bash && bun install --frozen-lockfile
merged: #48 #51-55 #74 #79 #81-83 #85 #88 #91 #93-96 #125 #126 #130 #142
closed_not_merged: #107
open_prs: pending PR this run (perf/rope byteLength)
monthly: #49
backlog: 1)DiffController-reDiff-text-alloc 2)computeExcerptSummary-bytes-lazy
last_run: 2026-03-13 run 23034957613
bench: 821pass 62bench insertText-1K 0.063ms 10K 0.549ms isolated-1K 0.056ms isolated-10K 0.550ms
repo_notes: DiffController #143 live-rediff; cross-excerpt #144; Myers-trace-O(D2) #142
perf: rope.byteLength() avoids rope.text() alloc in computeTextSummary; 1.27-1.52x all edit ops
