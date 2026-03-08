# Perf Improver Notes

cmds: bun test / bun run benchmarks/index.ts / bun run lint / bun run typecheck (demo fails pre-existing)
install: curl -fsSL https://bun.sh/install | bash && export PATH=$HOME/.bun/bin:$PATH && bun install --frozen-lockfile

done: #48 merged(Rope.line O(log n)+offsetToLineCol indexOf), #51(Rope.lines single-pass 3.8-4.2x), #52(MB.lines Map+bulk 1.3x), #53(lineColToOffset indexOf 3.3x) all open
backlog: 1)computeTextSummary hot(every edit,rope.text()+split alloc,HIGH) 2)Rope insert/delete structural sharing 3)lineColToOffset cross-chunk bug 4)countNewlines charCodeAt->indexOf(minor)
next: Task3 computeTextSummary when #51/#52/#53 reviewed; monthly:#49 Mar2026
last_run: 2026-03-08 run 22829533570 — Task4(no CI failures on #51/#52/#53), Task7(monthly updated); holding new PRs until 3 open ones reviewed
