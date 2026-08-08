# TI 2026-08-08

push_repo_memory VALIDATOR IS BROKEN-IGNORE IT.Measured:2026-08-07 10KB diff->"37KB",630-BYTE diff->"39KB";2026-08-08 6327-byte file/8722-byte diff/.git=172K->"39KB" AGAIN.Reported number UNCORRELATED with file size AND diff size.NEW:630B and 8.7KB diffs BOTH->exactly 39KB=>it's measuring something ~constant,not my content.Don't waste a run appeasing it;write good content+proceed(auto-push happens anyway).Already reported via missing_tool 2026-08-07-DON'T re-report(spam)

cmd:bun test/typecheck/lint/fuzz/test:e2e(bun NOT preinstalled).CI=install>build>typecheck>lint>test.no coverage.CLAUDE.md stale(says 590 tests;actual 2274)
lint:biome+no-type-assertion.grit;use row()/mbRow()(tests/helpers.ts:38,43) not `n as BufferRow`
2026-08-08:typecheck+lint clean,bun test 2265pass/0fail(3rd consecutive run identical).main HEAD=ce545ec(138d idle).#667 STILL no checkboxes ticked,ZERO comments
TIPRs(9):#312#335#357#368#538#541#543#548(comments:0,NO human feedback since Mar)+#690(3 commits).#373=maintainer's,lint-blocked(12 `as`)
2026-08-03 deep merge test(redo only if main moves):all 8 merge clean into main,any order.Overlaps #357/#368 #335/#548 #312/#538
monthly:Aug=#667;July #624 closed;Sept rollover 2026-09-01

## GOTCHAS
safeoutput branches get RANDOM HEX SUFFIX(#690 head=test-assist/deflake-lines-viewport-timing-b6837a989c115eec).Find:`git ls-remote --heads origin|grep <prefix>`.push_to_pull_request_branch needs LOCAL branch named EXACTLY that(fetch->`git branch -m`)
`git fetch --unshallow origin` first;`git fetch origin refs/pull/N/head:prN`
create_issue returns ONLY {"result":"success"}-NO issue number.Can't self-link;next run must search to find it
scratch:tests/<dir>/_scratch_*.test.ts;COPY imports from real test file(helpers re-exports excerptRange/createBufferId,NOT src/);rm+`git status --porcelain` after
mutation-testing recipe(worked well):python3 heredoc patches src w/ assert count==1,run arms,`git checkout <file>`.ALWAYS `git status --porcelain` at end
API:snap.excerpts=ARRAY PROPERTY not fn;ExcerptInfo{startRow,endRow}
search_pull_requests 'is:pr is:open in:title "[Test Improver]" repo:iamnbutler/multibuffer'(list_pull_requests caps p1);big json->parse w/ python
READ PR COMMENTS BEFORE commenting

## FUZZ CHARSET BLIND SPOT (2026-08-08,NEW,issue filed-find number next run)
fast-check v4 `fc.string()`=printable ASCII 0x20-0x7E ONLY(95 chars,measured 2000 samples).CANNOT emit \n/\r/\t
=>rope.fuzz+buffer.fuzz GENERATED props run on SINGLE-LINE text only.textSummary.lines test asserts 1===1 every run
MUTATION PROOF(rope lineCount `_newlineCount+1`->`_newlineCount===0?1:_newlineCount`=wrong ONLY multi-line):
 current gens detect 1/23(and that 1=HARDCODED example `multi-line rope has correct line count`);buffer.fuzz 0/10
 newline-bearing gens detect 11/23.rope.property caught 4/6.editor.fuzz+unicode.fuzz caught it broadly(they build multiline via insertNewline/crlfStringArb)=>gap is ONLY rope.fuzz+buffer.fuzz
FIX(verified 23pass/0fail clean,11fail mutated):`fc.string({unit:fc.constantFrom("a","b","c"," ","\t","\n","\n"),maxLength:50})`=66.5%>=1nl,28.8% density
NOT a blanket sed:`multi-line rope has correct line count` does lines.join("\n") itself+asserts lineCount===lines.length->NEEDS newline-FREE arb(my prototype broke it;caught+fixed)

## DISPROVEN 2026-08-08
"*.property.test.ts are redundant precursors,delete them"=WRONG.They self-say "dependency-free precursor to #80"+#80 CLOSED completed by maintainer 2026-03-19,so it LOOKS safe.But their CHARSET="abcde fg\n\n\n"(89% newline)makes them the ONLY generated multi-line rope coverage today.KEEP until fuzz charset fixed
minor:property-helpers.ts docstring names buffer.property.test.ts as consumer but that file NEVER imports it(redefines mulberry32/randomString/randomOp/applyOpToString inline :20-75).rope.property.test.ts=only real consumer

## TIMING-FLAKE KNOWLEDGE (repo's other main test problem-ALL 3 CAUSES SOLVED)
A ratio>own multiplier:line() ~6x vs *3(#611 widens=CORRECT here)
B cold unwarmed:time() has NO warmup,benchmark() does.lines() FIXED #690.Same shape slot_map:263/305,tile-map:511/519,wrap-map:435(only slot_map flaked 1/14,low pri)
C outlier capture in mean(SOLVED 2026-08-07):benchmark() times EACH of 1000 iters separately->ONE preemption(2.79ms) enters avg whole=+2.79us vs 1us tolerance vs 0.05us real work.Timer overhead ~70ns/call EXCEEDS work timed.FIX=minMs.excerptAt :208+:1027 FIXED #690,5/12->0/12 under 4core load
KEY FRAMING(reuse):outlier-driven(ratio~1.00)->min/median RIGHT,widening WRONG.stable-gap(~6x)->widening RIGHT,min/median WRONG(see #673).SAME SYMPTOM OPPOSITE FIX.Never blanket-policy either
MEASURED RepoAssist's `avg*10+0.01` for excerptAt->lets simulated O(n) regression PASS 3/3.Bound NOT too tight;statistic is wrong
SENSITIVITY METHOD(always,w/ idle control):simulate real regression->17.7-20.2x FAILS vs real 0.59-1.12x passes=fix keeps teeth
RepoAssist RIGHT once:benchmark() warmup=min(100,iterations/10),so `benchmark(fn,100)` warms only 10x.Explicit small iter count SILENTLY cuts warmup

## BACKLOG
blocked/low:1 anchor-bias(#400);2 singleton(unimpl);3 edit-proxy(BLOCKED);4 webgpu;5 getText(post#538);6 setup() dup(post#543);7 adapter real-fs;8 hunkToHeader(#373);9 workers;10 DONE(#668);12 see A above
11 OPEN multi-excerpt multi-line viewport gap:resolveAnchorsInViewport pre-filters on START ANCHOR'S EXCERPT.FIX VERIFIED:preFilterStart=Math.max(0,startRow-this._maxResultRowSpan).On #668,awaiting maintainer
13 react:blocker=ONE dep(react-dom).happy-dom ALREADY devDep+used(dom.test.ts:16).tests/react/react.test.ts:1-8 header STALE
14 useDiffView DATA half testable TODAY zero deps,5/5 asserts pass.stale-ref bug DISPROVEN(controller.ts:92 const+setExcerpts,identity stable).TOP new-test candidate if posture lifts
16 DUP:multibuffer.test.ts:208 vs :1027 byte-identical.#690 deflakes both;deletion=maintainer call
17 NEW fuzz charset blind spot(see section above)=TOP infra candidate if posture lifts

state:100+ open cross-bot PRs.POSTURE 2026-08-07/08:NO NEW PRs.Findings->issue or existing-PR comment instead.Asked maintainer in #667 to say if even that is too much churn
ALWAYS verify bot claims AND own hypotheses(3rd run running:my "delete property tests" hypothesis was WRONG and measuring saved a bad recommendation)

next:ANY human comment/merge=resume normal cadence;find the fuzz-charset issue number+add to #667 suggested actions;#611 still unmerged;item14/17 if posture lifts
