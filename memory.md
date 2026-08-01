# TI 2026-08-01

cmd:bun test/typecheck/lint/fuzz/test:e2e(bun NOT preinstalled);CI=install>build>typecheck>lint>test;no coverage;build=build:playground;CLAUDE.md stale(says demo/+590 tests;actual playground/+2274)
lint:biome+rules/no-type-assertion.grit+no-unknown-type.grit;use row()/mbRow() helpers(tests/helpers.ts:38,43) to fix `n as BufferRow`
TIPRs(8):#312#335#357#368#538#541#543#548 open/draft/comments:0(NO human feedback since Mar);all mergeable_state=clean;bases:#312=51f94a3 #335=7e50d57 rest=ce545ec
#373(maintainer)open/unstable/comments:2/lint-blocked(12 `as` casts);unchanged since 2026-07-28
verified-2026-08-01:8 TI PRs unchanged(updated==created);main HEAD=ce545ec(2026-03-23,131d no commits)
2026-08-01 Task1 full revalidation:2265pass/3skip/6todo/0fail(2274,76 files,2.72s);typecheck+lint clean(168 files,1 info=biome schema 2.4.4vs2.4.6)
2026-07-31 Task4 deep-verify:locally merged #312+#335(stale Mar bases)into main->clean merge,bun test 2270pass/0fail(2279),typecheck+lint clean BOTH.No semantic drift.Redo only if main moves.
git tip:runner checkout SHALLOW->`git fetch --unshallow origin` before merging fetched PR heads
script tip:standalone verify scripts need ABS paths + excerptRange/createBufferId from tests/helpers.ts(NOT src/multibuffer)
list_pull_requests caps ~page1;use search_pull_requests 'is:pr is:open in:title "[Test Improver]" repo:iamnbutler/multibuffer';list_issues output too big->save+parse json
monthly:July #624 CLOSED 2026-08-01;Aug summary created 2026-08-01(number unknown->search next run);other bots #666(RepoAssist Aug) #626(PerfImprover Jul)
backlog(all blocked/low):1 anchor-bias(RepoAssist#400);2 singleton(unimpl);3 edit-proxy(BLOCKED);4 webgpu(low);5 getText follow-up(post#538);6 setup() dup(post#543);7 adapter real-fs(low);8 hunkToHeader(#373);9 workers(low)
10 NEW resolveResultsInViewport row-granularity:VERIFIED LOCALLY 2026-08-01(1x500row excerpt,viewport 0-50->returns ALL 500,maxRow499;25x20row->60 vs 50).cause search.ts:339+multibuffer.ts:346 filter at EXCERPT granularity only.blind test=tests/editor/search.test.ts:375(1-row excerpts,bounds coincide).PerfImprover issue #664.DO NOT write test until fix lands(correct assert fails on main).No comment posted(dup of #664)
state:100+ open cross-bot PRs->strong restraint,NO new PRs/comments(skip tasks3,5,6);bot-to-bot comments != engagement;verify bot claims independently before repeating
2026-08-01 run(30696447655):Task1 revalidate+Task2 verified #664 gap+Task4 verify 8 PRs+Task7 closed #624/opened Aug
BUG:push_repo_memory reports "33 KB exceeds 12 KB" though dir has 1 file/~3KB->validator likely counts .git(172K).Shrinking does NOT help;proceed anyway
next:ANY HUMAN comment/merge=resume PRs;if #664 fixed->write row-granularity regression test(backlog 10);Sept rollover 2026-09-01
