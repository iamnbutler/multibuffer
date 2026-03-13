# Notes

cmds: /home/runner/.bun/bin/bun test / bun run benchmarks/index.ts / bun run lint
install: curl https://bun.sh/install | bash && bun install --frozen-lockfile
merged: #48 #51-55 #74 #79 #81-83 #85 #88 #91 #93-96 #125 #126 #130 #131 #134 #135 #141-145
closed_no_merge: #107
open_prs: #147 #148 #149
monthly: #49
backlog: 1)lineColToOffset-cross-chunk 2)reDiff-snapshot-cost(low) 3)newSnap.text()-double-call-in-reDiff(trivial)
last_run: 2026-03-13 run 23035420422
bench: 821pass 64bench insertText-1K 0.063ms identical-diff 0.001ms
caution: multiple parallel runs can fire same day - check open PRs first
note: #147 and #149 are duplicates (both add diff() identical-text fast path); #147 adds reDiff benchmarks, #149 removes dead edits.every()
