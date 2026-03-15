# Notes
cmds: bun test / bun run benchmarks/index.ts / bun run lint / bun run typecheck
open_prs: #150(diffLines+fix-isEqual) #220(injection-highlighter-remove-sort)
monthly: #49
backlog: 1)diffLines-callers-in-controller(wait-#150) 2)injectionRanges-find-linear-scan 3)diff-worst-case 4)batch-excerpt-PR#202
last_run: 2026-03-15 run 23115343694
bench: 65pass reDiff-1K=0.310ms reDiff-conv=0.101ms reDiff-10K=1.184ms
notes: #218(incremental-tree-sitter)merged #219(WrapMap-cache)merged both clean with existing PRs; #220 still valid(tokens.sort still on main); injection sub-parse full-parse-intentional per parseBuffer comment
checked_off: none-yet
