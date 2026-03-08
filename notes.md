# Perf Improver Notes

cmds: bun test / bun run benchmarks/index.ts / bun run lint / bun run typecheck
install: curl -fsSL https://bun.sh/install | bash && export PATH=$HOME/.bun/bin:$PATH && bun install --frozen-lockfile
note: demo typecheck pre-fails; 'bun run bench' fails, use direct path

open_prs: #51(Rope.lines single-pass 3.8-4.2x) #52(MB.lines bulk 1.3x) #53(lineColToOffset indexOf 3.3x) — all draft, awaiting review
merged: #48(Rope.line O(log n)+offsetToLineCol indexOf)
backlog: 1)computeTextSummary(rope.text()+split on every edit,HIGH) 2)Rope structural sharing 3)lineColToOffset cross-chunk bug 4)countNewlines charCodeAt->indexOf
next: computeTextSummary opt when existing PRs reviewed; monthly:#49 Mar2026
last_run: 2026-03-08 run 22829651928 — Task4(no CI failures) Task7(monthly updated) holding new PRs
bench: 23/24 pass; pointToOffset 1.11µs(fixed by#53); tests 565pass 35todo
