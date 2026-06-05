# TI 2026-06-05
cmd:bun test/typecheck/lint/fuzz/test:e2e (bun NOT preinstalled)
fw:bun:test;fast-check(fuzz);playwright(e2e);helpers.ts
TIPRs:#312#335#357#368#538#541#543#548 open/draft/clean;#373(maintainer)open/unstable(CI,unchanged since 2026-04-09)
PRstatus:no commit-status checks on bot TI PRs;CI NOT auto-run on bot PRs(trigger manually)
verified-this-run:all 8 TI PRs via search=open/draft/comments:0(NO human feedback EVER);#586 issue comments=0,no checkboxes ticked;only open testing-label issue=#586 itself;main commit verified=ce545ec
blocked-backlog:1 anchor-bias(RepoAssist#400);2 singleton(unimpl);3 edit-proxy(BLOCKED);4 webgpu(low);5 getText follow-up(after#538);6 setup() dup(after#543);7 adapter real-fs(low);8 hunkToHeader(#373 covers);9 workers(low)
rr:last=4,2,5,7(monitoring);3,6 held(restraint)
state:main=ce545ec(unchanged since 2026-03-22);2274 tests(2278 on#548 branch)
queue:50+ open PRs across RepoAssist/PerfImprover/TI -> strong restraint, NO new PRs
restraint:9 pending(8 TI+#373)+huge cross-bot queue->hold new PRs(tasks 3,6);silence>spam
summary:June=#586;updated w/ 2026-06-05 run entry(prepended;condensed 06-01/06-02 into archive note,kept 06-03/06-04 full);0 human comments,0 checkboxes ticked
infra:#579 auto-issue=repo-memory push failure(harness,out-of-scope)
next:keep monitoring;watch for ANY human comment/merge=signal to resume PRs;close June#586->open July at 2026-07;keep run history reverse-chron
