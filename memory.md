# TI 2026-08-02

cmd:bun test/typecheck/lint/fuzz/test:e2e(bun NOT preinstalled);CI=install>build>typecheck>lint>test;no coverage;build=build:playground;CLAUDE.md stale(says demo/+590 tests;actual playground/+2274)
lint:biome+rules/no-type-assertion.grit+no-unknown-type.grit;use row()/mbRow() helpers(tests/helpers.ts:38,43) to fix `n as BufferRow`
TIPRs(8):#312#335#357#368#538#541#543#548 open/draft/comments:0(NO human feedback since Mar);bases:#312=51f94a3 #335=7e50d57 rest=ce545ec
#373(maintainer)open/unstable/comments:2/lint-blocked(12 `as` casts);unchanged since 2026-07-28
verified-2026-08-02:8 TI PRs unchanged(updated==created);main HEAD=ce545ec(2026-03-22,132d no commits);monthly #667 body unedited(no maintainer checkbox changes)
2026-08-01 Task1 full revalidation:2265pass/3skip/6todo/0fail(2274,76 files,2.72s);typecheck+lint clean(168 files,1 info=biome schema 2.4.4vs2.4.6)
2026-07-31 Task4 deep-verify:locally merged #312+#335(stale Mar bases)into main->clean merge,bun test 2270pass/0fail,typecheck+lint clean BOTH.Redo only if main moves.
git tip:`git fetch --unshallow origin`(shallow ckout);BEST=git worktree add /tmp/gh-aw/agent/wtX pr<N> + symlink node_modules->run bun test there;`git worktree remove` from OUTSIDE the wt(cwd dies)
scratch tip:write throwaway tests as tests/editor/_scratch_*.test.ts INSIDE worktree(imports resolve);delete before cleanup
list_pull_requests caps ~page1;use search_pull_requests 'is:pr is:open in:title "[Test Improver]" repo:iamnbutler/multibuffer';list_issues output too big->save+parse json
monthly:Aug=#667(updated 2026-08-02);July #624 CLOSED;other bots #666(RepoAssist Aug) #626(PerfImprover Jul)
backlog(all blocked/low):1 anchor-bias(RepoAssist#400);2 singleton(unimpl);3 edit-proxy(BLOCKED);4 webgpu(low);5 getText follow-up(post#538);6 setup() dup(post#543);7 adapter real-fs(low);8 hunkToHeader(#373);9 workers(low)
10 DONE:resolveResultsInViewport row-granularity->RepoAssist PR #668 fixes+adds 5 tests.VERIFIED 2026-08-02:revert src only->4 red/1 green exactly as claimed;naive startPoint.row-only filter(#664 proposal)->multi-line guard RED,so _maxResultRowSpan justified;_performSearch recomputes span all exit paths,no staleness.NO TI PR needed
11 NEW OPEN:multi-excerpt multi-line viewport gap.#668 docstring promises row-INTERSECTION visibility but resolveAnchorsInViewport pre-filters on START ANCHOR'S EXCERPT->match starting in excerpt entirely above viewport dropped before row logic.repro=2x1-row excerpts(createBuffer "start"/"end",addExcerpt each),find("start[\\s\\S]*end",{regex:true}),resolveResultsInViewport(1,2)->0 but contract says 1.PRE-EXISTING on main NOT a regression.#668's guard passes only because its 1 excerpt spans doc(granularities coincide).FIX VERIFIED:preFilterStart=Math.max(0,startRow-this._maxResultRowSpan) passed to resolveAnchorsInViewport->repro=1,search.test.ts 55/0,full suite 2270/0.Commented on #668 2026-08-02 offering test once maintainer picks fix-vs-narrow-docstring
state:100+ open cross-bot PRs->strong restraint,NO new PRs(skip task3,6);comments ONLY on active PRs w/ verified novel finding;bot-to-bot comments != engagement;ALWAYS verify bot claims independently(paid off on #668)
2026-08-02 run(30744511252):Task2 verified #668 tests+found gap 11+Task4 verify 8 PRs+Task7 updated #667.1 comment posted(#668)
BUG:push_repo_memory reports "33 KB exceeds 12 KB" though dir has 1 file/~4KB->validator likely counts .git(172K).Shrinking does NOT help;proceed anyway
next:ANY HUMAN comment/merge=resume PRs;if #668 merges w/ pre-filter fix->write multi-excerpt test(item 11);if merged w/o->propose docstring narrowing;Sept rollover 2026-09-01
