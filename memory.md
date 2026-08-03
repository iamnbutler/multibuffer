# TI 2026-08-03

cmd:bun test/typecheck/lint/fuzz/test:e2e(bun NOT preinstalled);CI=install>build>typecheck>lint>test;no coverage;build=build:playground;CLAUDE.md stale(says demo/+590 tests;actual playground/+2274)
lint:biome+rules/no-type-assertion.grit+no-unknown-type.grit;use row()/mbRow() helpers(tests/helpers.ts:38,43) to fix `n as BufferRow`
TIPRs(8):#312#335#357#368#538#541#543#548 open/draft/comments:0(NO human feedback since Mar)
#373(maintainer)open/unstable/comments:2/lint-blocked(12 `as`);unchanged since 2026-07-28
verified-2026-08-03:main HEAD=ce545ec(133d no commits);monthly #667 body unedited(no maintainer checkbox changes);8 TI PRs unchanged
2026-08-03 Task4 DEEP(redo only if main moves):fetched all 8 PR heads,merged EACH into main separately->ALL clean,typecheck+lint OK,2265-2276 pass/0 fail.Overlap pairs #357/#368(cursor.test.ts) #335/#548(project/tree.test.ts) #312/#538(multi-cursor.test.ts)->NO conflicts,any merge order OK
git tip:`git fetch --unshallow origin` first;`git fetch origin refs/pull/N/head:prN`;merge on temp branch in main checkout(node_modules is gitignored so survives checkouts)-simpler than worktrees
scratch tip:tests/<dir>/_scratch_*.test.ts inside repo(imports resolve);rm before finishing;ALWAYS `git status --porcelain` after
list_pull_requests caps ~page1;use search_pull_requests 'is:pr is:open in:title "[Test Improver]" repo:iamnbutler/multibuffer';list_issues output too big
monthly:Aug=#667(updated 2026-08-03);July #624 CLOSED;only 1 issue has `testing` label(=#667 itself),so Task5 has no targets
backlog(blocked/low):1 anchor-bias(RepoAssist#400);2 singleton(unimpl);3 edit-proxy(BLOCKED);4 webgpu(low);5 getText follow-up(post#538);6 setup() dup(post#543);7 adapter real-fs(low);8 hunkToHeader(#373);9 workers(low);10 DONE(#668)
11 OPEN:multi-excerpt multi-line viewport gap;resolveAnchorsInViewport pre-filters on START ANCHOR'S EXCERPT->match starting in excerpt above viewport dropped.FIX VERIFIED:preFilterStart=Math.max(0,startRow-this._maxResultRowSpan).Commented #668 2026-08-02;awaiting maintainer choice(fix vs narrow docstring)before writing test
12 NEW-BIG:`line access is O(1)` buffer.test.ts:444 flake FULLY DIAGNOSED 2026-08-03.NOT jitter:middle/early=STABLE ~6x(A/B order swap 6.81 vs 6.74;same-row control=1.00).So `*3` multiplier ALWAYS violated;passes only via additive 1us term;fails iff early>~0.333us=machine loaded.REPRO ON DEMAND:pin 4 cores w/ busy loops->4/6 fail;idle back-to-back->0/15.RepoAssist's own 4 quoted failures imply ratios 5.53-6.75(confirms stability).line access IS genuinely O(1) in n:line(10)=0.180/0.183/0.189/0.188/0.192us at n=1k/5k/10k/40k/80k(80x data,7% cost)->impl fine,PROBE wrong(compares 2 rows in 1 buffer=tree position,not size).Proposed size-scaling test(1k vs 20k,bound x8):0/25 idle,0/8 under load,O(n) control=17.7x.Commented #611.NO competing PR
13 NEW:React hooks untested-react.test.ts=16 tests but ONLY exports/type shapes;use-diff-view.ts(406L)+use-editor-view.ts(148L) real logic untested.BLOCKED:needs happy-dom/@testing-library/react=new dep(barred by CLAUDE.md)
state:100+ open cross-bot PRs->strong restraint,NO new PRs(skip task3,6);comments ONLY on active PRs w/ verified novel finding;ALWAYS verify bot claims independently(paid off on #668 AND #611-both bots called it "jitter",it's a stable 6x)
2026-08-03 run(30809591176):Task2 diagnosed #611 flake+found React gap;Task4 deep merge-verify all 8;Task7 updated #667.1 comment(#611)
BUG:push_repo_memory reports size err though dir ~5KB->validator likely counts .git;proceed anyway
next:ANY HUMAN comment/merge=resume PRs;if #611 merges->flake gone,recheck;if #668 merges w/ pre-filter fix->write multi-excerpt test(item 11);Sept rollover 2026-09-01
