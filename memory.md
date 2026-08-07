# TI 2026-08-07

push_repo_memory VALIDATOR IS BROKEN-IGNORE IT.Measured 2026-08-07:10KB diff->"37KB";630-BYTE diff->"39KB".Reported number is UNCORRELATED with file size AND diff size.Both prior theories(.git counting;patch size)DISPROVEN.Don't waste a run shrinking to appease it;write good content+proceed(auto-push happens anyway).Reported via missing_tool 2026-08-07

cmd:bun test/typecheck/lint/fuzz/test:e2e(bun NOT preinstalled).CI=install>build>typecheck>lint>test.no coverage.CLAUDE.md stale(says 590 tests;actual 2274)
lint:biome+no-type-assertion.grit;use row()/mbRow()(tests/helpers.ts:38,43) not `n as BufferRow`
2026-08-07:typecheck+lint clean,bun test 2265pass/0fail.main HEAD=ce545ec(137d idle).#667 no checkboxes ticked
TIPRs(9):#312#335#357#368#538#541#543#548(comments:0,NO human feedback since Mar)+#690(3 commits).#373=maintainer's,lint-blocked(12 `as`)
2026-08-03 deep merge test(redo only if main moves):all 8 merge clean into main,any order.Overlaps #357/#368 #335/#548 #312/#538
monthly:Aug=#667;July #624 closed;Sept rollover 2026-09-01

## GOTCHAS
safeoutput branches get RANDOM HEX SUFFIX(#690 head=test-assist/deflake-lines-viewport-timing-b6837a989c115eec).Find:`git ls-remote --heads origin|grep <prefix>`.push_to_pull_request_branch needs LOCAL branch named EXACTLY that(fetch->`git branch -m`)
`git fetch --unshallow origin` first;`git fetch origin refs/pull/N/head:prN`
scratch:tests/<dir>/_scratch_*.test.ts;COPY imports from real test file(helpers re-exports excerptRange/createBufferId,NOT src/);rm+`git status --porcelain` after
API:snap.excerpts=ARRAY PROPERTY not fn;ExcerptInfo{startRow,endRow}
search_pull_requests 'is:pr is:open in:title "[Test Improver]" repo:iamnbutler/multibuffer'(list_pull_requests caps p1);big json->parse w/ python
READ PR COMMENTS BEFORE commenting-I posted then found RepoAssist's reply,forcing 2 comments on #690 in one run

## TIMING-FLAKE KNOWLEDGE (repo's main test problem-ALL 3 CAUSES NOW SOLVED)
A ratio>own multiplier:line() ~6x vs *3(#611 widens=CORRECT here)
B cold unwarmed:time() has NO warmup,benchmark() does.lines() FIXED #690.Same shape slot_map:263/305,tile-map:511/519,wrap-map:435(only slot_map flaked 1/14,low pri)
C outlier capture in mean(SOLVED 2026-08-07,was THE open mystery):benchmark() times EACH of 1000 iters separately->ONE preemption(2.79ms) enters avg whole=+2.79us vs 1us tolerance vs 0.05us real work.Timer overhead ~70ns/call EXCEEDS work timed.FIX=minMs(benchmark already returns it).excerptAt :208+:1027 FIXED #690,isolated 5/12->0/12 under 4core load
KEY FRAMING(reuse):outlier-driven(ratio~1.00)->min/median RIGHT,widening WRONG.stable-gap(~6x)->widening RIGHT,min/median WRONG(makes failure deterministic,see #673).SAME SYMPTOM OPPOSITE FIX.Never blanket-policy either
MEASURED RepoAssist's proposed `avg*10+0.01` for excerptAt->lets simulated O(n) regression PASS 3/3.Current bound NOT too tight(it DOES catch reg);statistic is wrong,not threshold
SENSITIVITY METHOD(always,w/ idle control):simulate real regression(linearScan over same 1000 excerpts)->17.7-20.2x FAILS vs real 0.59-1.12x passes=fix keeps teeth
RepoAssist was RIGHT once:benchmark() warmup=min(100,iterations/10),so `benchmark(fn,100)` warms only 10x.Explicit small iter count SILENTLY cuts warmup.Fixed(spread 73/175/199%->5/63/30%)

## BACKLOG
blocked/low:1 anchor-bias(#400);2 singleton(unimpl);3 edit-proxy(BLOCKED);4 webgpu;5 getText(post#538);6 setup() dup(post#543);7 adapter real-fs;8 hunkToHeader(#373);9 workers;10 DONE(#668);12 see A above
11 OPEN multi-excerpt multi-line viewport gap:resolveAnchorsInViewport pre-filters on START ANCHOR'S EXCERPT.FIX VERIFIED:preFilterStart=Math.max(0,startRow-this._maxResultRowSpan).On #668,awaiting maintainer
13 react:blocker=ONE dep(react-dom).happy-dom ALREADY devDep+used(dom.test.ts:16).tests/react/react.test.ts:1-8 header STALE
14 useDiffView DATA half testable TODAY zero deps,5/5 asserts pass.stale-ref bug DISPROVEN(controller.ts:92 const+setExcerpts,identity stable).TOP new-test candidate if posture lifts
16 DUP:multibuffer.test.ts:208 vs :1027 byte-identical.#690 deflakes both;deletion=maintainer call

state:100+ open cross-bot PRs.POSTURE 2026-08-07:NO NEW PRs.Push to EXISTING PR when same-file/adjacent(would conflict anyway)+keeps queue flat.Asked maintainer in #667 to say if even that is too much churn
ALWAYS verify bot claims AND own hypotheses(2x payoff this run:their widening=wrong,their warmup=right&caught my bug)

next:ANY human comment/merge=resume normal cadence;check if RepoAssist replies re widening on #690;#611 still unmerged;item14 if posture lifts
