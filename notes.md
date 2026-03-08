# Perf Improver Notes

cmds: bun test / bun run benchmarks/index.ts / bun run lint / bun run typecheck
install: curl -fsSL https://bun.sh/install | bash && export PATH=$HOME/.bun/bin:$PATH && bun install --frozen-lockfile
note: demo typecheck pre-fails; 'bun run bench' fails, use direct path

open_prs: #51(Rope.lines single-pass 3.8-4.2x) #52(MB.lines bulk 1.3x) #53(lineColToOffset indexOf 3.3x) #54(computeTextSummary split+loop 1.5x) — all draft, awaiting review
merged: #48(Rope.line O(log n)+offsetToLineCol indexOf)
backlog: 1)WrapMap per-line array alloc(wrapLine→wrapLineCount, avoid O(lineCount) allocs on every edit) 2)Rope structural sharing 3)_captureEntry full-text O(n) undo capture(architectural) 4)lineColToOffset cross-chunk bug 5)countNewlines charCodeAt->indexOf
next: WrapMap wrapLineCount when existing PRs reviewed; monthly:#49 Mar2026
last_run: 2026-03-08 run 22830145861 — Task4(all 4 PRs CI pending, no failures) Task2(WrapMap+HistoryEntry backlog) Task7(monthly updated, PR#54 link fixed)
bench: 26/26 pass; isolated insert 1K: 119µs; isolated insert 10K: 973µs; tests 565pass 35todo
