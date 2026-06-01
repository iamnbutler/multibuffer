# TI 2026-06-01
cmd:bun test/typecheck/lint/fuzz/test:e2e (bun NOT preinstalled this run)
fw:bun:test;fast-check(fuzz);playwright(e2e);helpers.ts
TIPRs:#312#335#357#368#538#541#543#548 open/draft/clean;#373(maintainer) open
PRstatus:no commit-status checks on TI PRs(total_count=0); CI NOT auto-run on bot PRs(trigger manually)
verified:#312+#548 mergeable_state=clean this run; all TI PRs comments=0(no human feedback ever)
blocked-backlog:1 anchor-bias(RepoAssist#400);2 singleton(unimpl);3 edit-proxy(BLOCKED);4 webgpu(low);5 getText follow-up(after#538);6 setup() dup(after#543);7 adapter real-fs(low);8 hunkToHeader(#373 covers);9 workers(low)
rr:last=t4,2,5,7(this run);3,6 held(restraint)
state:main=ce545ec(unchanged since 2026-03-22);2274 tests(2278 on #548 branch)
queue:50+ open PRs across RepoAssist/PerfImprover/TI -> strong restraint, NO new PRs
restraint:9 pending(8 TI+#373)+huge cross-bot queue; hold new PRs(tasks 3,6)
summary:#528 May CLOSED this run(0 human comments,0 checkboxes ticked)->new June summary created via safeoutput(number TBD,temporary_id aw_jun26)
infra:#579 auto-issue=repo-memory push failure(harness,out-of-scope)
next:verify June summary issue number next run; keep run history reverse-chron; close June->open July at 2026-07
