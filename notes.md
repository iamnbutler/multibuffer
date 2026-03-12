# Notes

cmds: /home/runner/.bun/bin/bun test / /home/runner/.bun/bin/bun run benchmarks/index.ts / /home/runner/.bun/bin/bun run lint
install: curl https://bun.sh/install | bash && /home/runner/.bun/bin/bun install --frozen-lockfile
merged: #48 #51-55 #74 #79 #81 #82 #83 #85 #88 #91 #93 #94 #95 #96
open_prs: #107 #126 #125 (plus new #130 submitted this run)
monthly: #49
backlog: 1)_lineColToOffset-cross-chunk 2)diff-worst-case-30ms-myers
last_run: 2026-03-12 run 23015155184
bench: 773pass 60-benchmarks insertText-1K 0.089ms insert10K 0.713ms indentLines 0.164ms dedentLines 0.293ms moveLine 0.111ms
repo_notes: major refactor #104 split src into buffer/multibuffer/editor/renderer; diff module added #105; non-editable excerpts #113; line decorations #114
