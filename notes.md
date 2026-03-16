# Notes
cmds: bun test / bun run benchmarks/index.ts / bun run lint / bun run typecheck
open_prs: #150(diffLines+fix-isEqual dirty->rebased-PR-submitted-2026-03-16)
monthly: #49
backlog: 1)diffLines-callers-in-controller(wait-#150) 2)diff-worst-case 3)injection-find-deprioritized
last_run: 2026-03-16 run 23157337253
bench: 65pass reDiff-1K=0.310ms reDiff-conv=0.101ms reDiff-10K=1.184ms
notes: #220(injection-sort)merged-2026-03-16; #185(reDiff-benchmarks)merged; #202(setExcerpts)merged; PR-150 still dirty, created clean fix-pr-150-rebase branch+PR this run; injection find() O(k) deprioritized; injectionRanges param in _collectTokensWithInjectionSkip appears unused
checked_off: none-yet
