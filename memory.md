# TI 2026-08-06

cmd:bun test/typecheck/lint/fuzz/test:e2e(bun NOT preinstalled);CI=install>build>typecheck>lint>test;no coverage;build=build:playground;CLAUDE.md stale(says demo/+590 tests;actual playground/+2274)
lint:biome+rules/no-type-assertion.grit+no-unknown-type.grit;use row()/mbRow() helpers(tests/helpers.ts:38,43) to fix `n as BufferRow`
TIPRs(9):#312#335#357#368#538#541#543#548 open/draft/comments:0(NO human feedback since Mar)+NEW 2026-08-06 lines() deflake PR(branch test-assist/deflake-lines-viewport-timing;number unknown-safeoutput doesn't return it;LOOK IT UP next run)
#373(maintainer)open/unstable/comments:2/lint-blocked(12 `as`);unchanged since 2026-07-28
verified-2026-08-06:main HEAD=ce545ec(136d no commits);#667 body unedited(no checkbox changes);8 old TI PRs unchanged;#611+#668 unchanged/comments:2(=mine)
2026-08-06 Task1 REVALIDATED:typecheck clean,lint clean(1 pre-existing info),bun test 2265pass/3skip/6todo/0fail(2274,76 files,3.1s)
2026-08-03 Task4 DEEP(redo only if main moves):all 8 PR heads merged into main separately->ALL clean,no conflicts,any merge order OK.Overlap pairs #357/#368 #335/#548 #312/#538
git tip:`git fetch --unshallow origin` first;`git fetch origin refs/pull/N/head:prN`;merge on temp branch in main checkout
scratch tip:tests/<dir>/_scratch_*.test.ts in repo(imports resolve;COPY imports from the real test file-helpers re-exports excerptRange/createBufferId,NOT src/);rm before finishing;ALWAYS `git status --porcelain` after
list_pull_requests caps ~page1;use search_pull_requests 'is:pr is:open in:title "[Test Improver]" repo:iamnbutler/multibuffer';search_issues output too big->parse saved file w/ python json
monthly:Aug=#667(updated 2026-08-06);July #624 CLOSED

TASK5 TARGETS EXIST NOW(prev note "none" was stale-only checked label:testing):#673 Perf Improver flaky-timing issue(commented 2026-08-06).Search `is:issue is:open flaky OR test OR coverage in:title`->6 issues(#673#496#446#667#540#356)

## 2026-08-06 WORK
PR OPENED(broke 2-run hold):lines() deflake.multibuffer.test.ts:1041 time()->benchmark(,100),bound 1ms UNCHANGED,comment copied from adjacent anchor-resolution test.MEASURED:cold 0.23-0.42ms vs warm 0.007-0.014(18-51x);flake 3/10 under 4core load->0/12 after.suite/typecheck/lint clean.`time` still used :988,:1019,:1233 so import stays
CORRECTION MADE(my own prior claim was WRONG):"200x slower still trips 1ms bound"=FALSE.idle 200x work=0.799ms=PASSES.prev figure measured UNDER LOAD w/o idle control.Real:warm bound=23-140x headroom=BUDGET GUARD not regression detector.Said so in PR trade-offs+#667.LESSON:always take idle control before generalizing a sensitivity check
NOVEL FINDING(comment on #673):median/best-of-N-the fix BOTH #673 and RepoAssist endorse as "more durable"-WOULD MAKE IT WORSE.warm ratios mean 5.76/median 6.03/bestof 6.06 vs bound 3=ALL exceed.gap is stable(rope traversal depth)not noise,so removing variance makes failure DETERMINISTIC.#611's raise-tolerance is the approach that works
reverified line() O(1) in SIZE:n=5k->80k(16x data)=0.286->0.319us(+12%).n=1000 reading(0.981us)=cold artifact,ignore
NEW FLAKE DATA:excerptAt :1027 = 3/8 under load(was recorded 1/14)=WORSE than thought.ratio 1.00+multiplier sound=>NEITHER known cause fits.needs own diagnosis.Logged as open question in #667 item15
after my fix,multibuffer.test.ts under load: lines()=0/12,but file still 6/12 any-fail=all excerptAt:1027

backlog(blocked/low):1 anchor-bias(RepoAssist#400);2 singleton(unimpl);3 edit-proxy(BLOCKED);4 webgpu(low);5 getText follow-up(post#538);6 setup() dup(post#543);7 adapter real-fs(low);8 hunkToHeader(#373);9 workers(low);10 DONE(#668)
11 OPEN:multi-excerpt multi-line viewport gap;resolveAnchorsInViewport pre-filters on START ANCHOR'S EXCERPT.FIX VERIFIED:preFilterStart=Math.max(0,startRow-this._maxResultRowSpan).Commented #668 2026-08-02;awaiting maintainer choice
12 line access O(1) probe wrong dimension->see 2026-08-06 work above.#611 correct fix
13 react:blocker=ONE dep(react-dom).happy-dom ALREADY devDep(^20.8.4)+used(dom.test.ts:16,highlighter.test.ts:350).tests/react/react.test.ts:1-8 header is STALE(caused prior mis-scoping)
14 useDiffView DATA half testable TODAY zero deps.5/5 asserts pass(replaceAll via textSummary.chars then ctrl.reDiff()).stale-ref bug DISPROVEN(controller.ts:92 const+setExcerpts mutates,identity stable).=>STRONGEST remaining new-test PR candidate
15 five load-sensitive timing tests,2 causes(A ratio>multiplier=#611;B cold unwarmed=lines(),FIXED by my PR).cold shape also in slot_map:263/305,tile-map:511/519,wrap-map:435(only slot_map flaked 1/14=low pri).+excerptAt:1027 unexplained(see above)
16 DUP TEST multibuffer.test.ts:208 vs :1027 byte-identical bodies(diff=name+1 comment).safe to delete either

state:100+ open cross-bot PRs.RESTRAINT POLICY REVISED 2026-08-06:held lines() fix 2 runs->judged that stalling not restraint once analysis was DONE+VALIDATED+cheap-to-review(1 test,test-only,no conflict).Bigger/riskier work still held.Comments still only on active threads w/ VERIFIED NOVEL finding(#673 qualified:corrected a wrong recommendation)
ALWAYS verify bot claims AND own hypotheses independently(paid off on #668,#611,item14 disproof,AND my own 200x claim which was wrong)
BUG:push_repo_memory reports size err though dir ~7KB->validator likely counts .git;proceed anyway

next:LOOK UP the new PR number(search TI PRs)+add to #667 Suggested Actions properly;ANY HUMAN comment/merge=resume;item14 useDiffView=next PR candidate if hold stays lifted;item16 dup deletion=cheap follow-up;diagnose excerptAt:1027 3/8 flake(unexplained);if maintainer OKs react-dom->item13;Sept rollover 2026-09-01
