# Perf Improver Notes

cmds: bun test / bun run benchmarks/index.ts / bun run lint / bun run typecheck
install: curl -fsSL https://bun.sh/install | bash && export PATH=$HOME/.bun/bin:$PATH && bun install --frozen-lockfile
note: demo typecheck pre-fails; bun run bench fails, use direct path

open_prs: #51(Rope.lines 3.8-4.2x) #52(MB.lines 1.3x) #53(lineColToOffset 3.3x) #54(computeTextSummary 1.5x) #55(WrapMap bench) — all draft
merged: #48
backlog: 1)WrapMap wrapLineCount(0.636ms/1K-nowrap baseline@PR#55) 2)Rope structural sharing 3)_captureEntry O(n) undo 4)lineColToOffset cross-chunk bug 5)countNewlines indexOf
next: WrapMap wrapLineCount after PRs reviewed; monthly:#49
last_run: 2026-03-08 run 22830275609 — Task4(all CI pending ok) Task6(PR#55 WrapMap bench 30/30) Task7(monthly updated)
