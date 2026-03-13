# Notes

cmds: bun test / bun run benchmarks/index.ts / bun run lint / bun run typecheck
install: curl https://bun.sh/install | bash && bun install --frozen-lockfile
merged: #48 #51-55 #74 #79 #81-85 #88 #91 #93-96 #107 #125 #126 #130-145 #151
open_prs: #147(fast-path) #148(byteLength) #149(dup) #150(diffLines+textSummary)
monthly: #49
backlog: 1)batch-reDiff-excerpts(~25%,wait-merge) 2)diff-worst-case-30ms 3)diffLines-callers
last_run: 2026-03-13 run 23035788409
bench: 65pass reDiff-1K-scattered=0.310ms reDiff-convergence=0.101ms reDiff-10K=1.184ms
notes: reDiff=50%diff+50%excerpt-mgmt; branch perf-assist/diff-controller-benchmarks ready
pr_limit: 4-open-at-limit; submit-bench-PR-once-one-merges
