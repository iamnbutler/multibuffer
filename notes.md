# Notes

cmds: bun test / bun run benchmarks/index.ts / bun run lint / bun run typecheck
install: curl https://bun.sh/install | bash && bun install --frozen-lockfile
merged: #48 #51-55 #74 #79 #81-85 #88 #91 #93-96 #107 #125 #126 #130-145
open_prs: #147 (fast path) #148 (byteLength) #149 (dup) #150 (diffLines+textSummary)
monthly: #49
backlog: 1)diff-worst-case-30ms 2)diffLines-callers(in #150)
last_run: 2026-03-13 run 23035589152
bench: 821pass 64-benchmarks insertText-1K 0.102ms insert10K 0.791ms
repo_notes: lineColToOffset-cross-chunk=not-a-bug DiffController #143 Myers-memory #142
