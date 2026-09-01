# TI memory (compact; detail in #667)

## CRITICAL: memory push size
3 gates. (1) per-FILE 10240 REAL (hit 08-20, 08-26). (2) TOTAL-dir counts .git so always says 45KB>12KB — advisory, ignore. (3) GIT PATCH 10240 REAL, ate the 08-09 memory (#698). File is AT the cap: every add needs an equal delete.
RULE: NEVER full-rewrite — surgical Edit only. 🚨TRAP: a delete far from your edits opens a NEW HUNK (~1200B ctx each); only reshape INSIDE a hunk you already touched, and ADD LESS (detail -> #667). 🔑08-27: SQUEEZE costs old+new patch bytes, DELETE inside a hunk is patch-FREE — prefer DELETE. Verify BOTH `wc -c` and `git diff|wc -c` <10240.
Maintainer fix: raise max-patch-size in daily-test-improver.md:61 (ceiling 100KB).

## Commands (test/typecheck/lint revalidated 2026-08-27, fuzz 08-10)
bun test 2265p/3skip/6todo/0fail (2274 in 76 files, ~2.6s); typecheck clean; lint clean (1 pre-existing info); fuzz 74p. THE 3 SKIP = all of tests/renderer/glyph-atlas.test.ts (skipIf, no 2d ctx). bun NOT preinstalled: curl -fsSL https://bun.sh/install|bash. CI=install>build>typecheck>lint>test. COVERAGE WORKS: bun test --coverage. CLAUDE.md stale (says 590 tests).
lint: biome + no-type-assertion.grit -> use row()/mbRow() from tests/helpers.ts, never `n as BufferRow`.
FLAKE still on main: "Buffer Performance > line access is O(1)". ALWAYS repeat runs before blaming a mutation. #611 fixes.

## State 09-01 (cmds revalidated: 2265/3/6/0, tc+lint clean)
main ce545ec (unmoved 163d). Same 9 TI PRs open (#312 #335 #357 #368 #538 #541 #543 #548 #690), 0 human comments (#690's 5=bot). #611+#745 open. #373=maintainer's, lint-blocked.
POSTURE: NO NEW PRs; findings -> monthly-issue COMMENTS, or the PR itself when ABOUT that PR (09-01 #357). NEVER a body.
🚨 RULE (item 33): before ANY write-up, search open PRs for file+symptom (narrow query, jq the saved file) — 08-18 3 of my 4 "SRC BUGs" were ALREADY PRs (#687 #546 #720). ✅PAID OFF 08-19(#717) 08-24(#735) 08-27(#752) 08-29(#664, an ISSUE not a PR — SEARCH ISSUES TOO) 08-31(#745): report the RESIDUE.
🚨 #667 BODY: 08-25 update EXCEEDED 65536 -> GH NUKED whole body. Keep ~10KB, detail in COMMENTS.
Aug=#667 CLOSED. Sept issue CREATED 09-01, no number returned -> SEARCH it (Oct rollover 10-01). charset=#696. memory-fail=#698.

## Gotchas
safeoutput branches get a RANDOM HEX SUFFIX; find via git ls-remote --heads origin|grep <prefix>; push_to_pull_request_branch needs a LOCAL branch named exactly that.
git fetch --unshallow origin first; git fetch origin refs/pull/N/head:prN
create_issue returns only {"result":"success"} — NO number; next run must search.
list_issues/search_pull_requests blow the token cap -> use search_issues w/ narrow query.
MUTATION RECIPE: cp src to /tmp, python3 script patches it, run arms, restore, ALWAYS git status --porcelain at end. ONE `bun test` per arm (3x in a loop = 60s timeout). fc.assert unseeded -> counts wobble.
API: snap.excerpts=ARRAY PROP not fn; ExcerptInfo{startRow,endRow}; BufferSnapshot has NO .length (use .text().length); insert(offset(NaN)) silently corrupts.

## Findings (detail in #667)
09-01 SRC BUG #12 moveWord RIGHT (cursor.ts:296-303), unclaimed, ->#357. scanWordForward(next,0) skips 2 classes but cursor sat on \n => SKIPS 1st WORD of every line entered (5/7 shapes; left 0; indented lines escape); moveWordBoundary:344 crosses to col0 instead. WILD mutant 2265/0 = UNVERIFIED; fix 2265/0. 🚨MY PR #357 PINS IT: all fixtures 1-word next line so "end of 1st"=="start of 2nd"; t1 red under fix. movePage CLEAN+COVERED (30->7=6 red).
08-31 diff-client CLEAN; its 1 bug = PR #745, VERIFIED+urged merge. hl-client 4.63%, 0 worker cov, #743+#745 both decline = OPEN GAP, best next PR (onerror byte-identical but NOT same bug). 🔑 BUN HAS Worker; a REAL one runs the REAL *-worker.ts e2e via `new URL(...,import.meta.url)` from a REPO-ROOT probe. LESSON: when a test file states WHY it isn't testing something, CHECK it — 4/4 false.
08-30 excerpt.ts LOGIC CLEAN (632/632 oracle) but summary SLOW PATH UNTESTED: 5 mutants survive (incl ALL ZEROS); only named test takes FAST PATH (excerpt.ts:51) so asserts BUFFER summary. #684/#510/#766 rewrite it. mergeExcerptRanges CLEAN, 0 src call sites.
08-29 SRC BUG #11 VIEWPORT-ANCHORS, unclaimed. resolveAnchorsInViewport (multibuffer.ts:374-384) filters by anchor's OLD excerpt, returns the RESOLVED one => ON-SCREEN anchor DROPPED (142; 0 after FIX=early-return on editsSince(anchor.ver)>0). 🚨#664=SAME filter OPPOSITE dir, CANNOT fix mine.
08-28 SRC BUG #10 ANCHORS, unclaimed. setExcerpts (multibuffer.ts:798) writes NO _replacedExcerpts (setExcerptsForBuffer:900 DOES) => reDiff orphans EVERY anchor: 6/6 lost on NO-OP rediff, getSelectedText->"". 150ms debounce WHILE TYPING (diff-editor-view.ts:243). FIX=region map => 0/6.
08-26 SRC BUG #8 PATCH PATHS (patch.ts:30-32), unclaimed, #667. git C-quotes non-ASCII => DIFF_GIT_HEADER needs BARE a/; parsePatch:69-87 starts a file ONLY on `diff --git`/`--- `, BINARY+RENAME have NO --- => FILE DROPPED (4->2). SPACE => trailing TAB eaten.
🔑 08-26 CLEAN: patch.ts hunk batching + row/deco math (oracle, 162 gen + 21 real-git shapes, 0 fail). 🔑 METHOD: BUILD FIXTURES WITH THE REAL git BINARY, oracle vs `git show HEAD:path` — hand-written fixtures never show what the real producer emits.
08-24/25 SRC BUG #7 EXCERPT-HEADER (#667 bug7), unclaimed: boundaries queried by excerpt START, drawn at row-1 => excerpt starting AT endRow loses an ONSCREEN header. SAME EXPR IN 5 FILES (dom:767 editor-view:243 webgpu:1087 diff/diff-editor-view:316 react/use-diff-view:149) — GREP THE WHOLE EXPR; #735 fixes 3, NOT the 2 diff ones (they pass their OWN header array INTO render()). RECIPE: remeasure() THEN setDecorations; rAF shim = setTimeout.
08-23 SRC BUG #6 INTRALINE-DIFF (#667 bug6), unclaimed (#546=rope chunks). computeIntralineDiff compares CODE UNITS -> 2 emoji sharing a high surrogate get a 1-unit prefix -> range starts MID-PAIR -> highlighter.ts:246-265 slices => 2 lone surrogates/U+FFFD. NAIVE SNAP-OUTWARD WRONG (over-highlights). RIGHT=Array.from() prefix/suffix + char Myers.
🔑 08-23 KILLER DETAIL (generalise): rejoined spans == original so textContent assertions PASS w/ bug present => assert isWellFormed() PER NODE. tests/diff/ = ZERO non-ascii. diff.ts REST CLEAN don't re-audit (hunk contract + minimality vs INDEP LCS DP, 0 viol). Surrogate-safety IS house convention (buffer.ts:96/114, cursor.ts:193, editor.ts:284) -> GREP A CONVENTION 4 MODULES KEEP AND 1 IGNORES.
08-22 SRC BUG #4+#5 INJECTION-HL (bugs4/5), unclaimed. Detail in #667. 16 tests all toBeGreaterThan(0)/toBeDefined = BLIND TO POSITION. 🔑 TREE-SITTER RUNS UNDER bun test (playground/wasm/).
08-20 SRC BUG #2 GLYPH-ATLAS, unclaimed; #689=SEPARATE atlas NOT dup. BOTH obvious fixes WRONG. ZERO executed asserts.
08-19 GLOB: get()/has() leak literal excludes below root; SURVIVES #717+#336. 2 fixes differ on exclude:["index.ts"] = MAINTAINER call. Also `*.{ts}` -> literal; nested braces wrong subset.
CANDIDATE-GEN METHOD THAT WORKED: rank src modules by test-line/src-line ratio (loop over src, grep tests for importers), audit lowest-ratio one with REAL logic. glob.ts was 0.71.
08-17 3 CLEAN don't re-audit: rope insert/delete/replace chunk rebuild; WrapMap lazy+_segCharStart; tile-map (ZERO src call sites, don't invest). Item-27 marker in WrapMap yet no bug => marker predicts a GAP, not always a BUG.
08-13 SRC BUG #1 (unclaimed): search.ts:423 sorts w/ compareAnchors = orders by excerptId.index (SLOT idx) under "Sort by position"; SlotMap recycles idx, doc order = _order[]. 3 paths -> rows [1,0]. FIX (a) drop sort or (b) sort by resolved pos like :301. Both verified.
08-12 SLOTMAP set(): 0 test call sites, gen guard (slot_map.ts:100) deletable w/ 2274 green. Prod: multibuffer.ts:697/733/829/891. FIX=4-line twin of :131; VERIFIED.
#696 charset: fc.string()=printable ASCII, no \n -> rope/buffer fuzz line props run single-line. Fix verified.
multibuffer.fuzz Prop1 oracle self-referential (1-line fix verified). Prop4 vacuous: 0/6 mutants, proposed oracle 6/6; M5 (`>=`->`>` at multibuffer.ts:545) SURVIVES ALL TESTS = real off-by-one; test query (5,15)->(5,20) closes it.
Timing flakes: 3 causes solved (#667 items 12/15). outlier-driven -> min/median right; stable-gap (~6x) -> widening right. Never blanket-policy.

next (if posture lifts): READY = moveWord fix + #357 t1 rewrite (09-01), hl-client worker tests, excerpt textSummary partial-range, slot_map set(), #696 impl (TOP infra), excerptBoundaries (5,15)->(5,20), fuzz Prop1/Prop4 oracles. #2/#3/#4 ARE PRs #720/#546/#687+#745 — push MERGE.
AUDIT LESSONS: (1) comparators over IDENTITY fields where POSITION meant. (2) TWO FEATURES w/ solid describe blocks that NEVER INTERSECT — grep both markers co-occurring in one test body. (3) mirror-image branches (up/down) textually IDENTICAL = suspect. (4) SIZE THRESHOLDS (chunk/page/tier): does any test cross it with INTERESTING content? also CHECK GENERATOR MAX SIZE vs threshold (repo generators cap at 100 vs 1024 chunk = class unreachable). (5) docstring "equivalent to X but faster" => diff vs X on adversarial input. (6) ONE PRIVATE HELPER, SEVERAL CALLERS: check each caller's question vs its postcondition — right for its documented query, silently wrong for a neighbour. (7) 08-30: a test NAMED for behaviour it NEVER REACHES (a fast path shadows it) — prove with a mutant, not with coverage.
METHOD (4 src bugs in 4 runs): take an UNAUDITED item, write a from-scratch ABSOLUTE oracle over adversarial shapes, sweep EVERY offset/row; THEN MUTATE to prove tests catch a regression (08-30: oracle said clean, mutants said untested — do both).
UNAUDITED: DONE = glob, hl-client, injection-hl, diff/diff, editor-view, diff-editor-view, diff/patch, multi-file, diff/controller, anchor+viewport, excerpt, diff-client, selection, cursor. NEXT = editor.ts _mergeSelections; hl-client WORKER; input-handler.
08-31 CLEAN: selection.ts extendSelection & Editor._extendSelection (editor.ts:1043-59) = VERBATIM FORK, BOTH mutated & CAUGHT. A fork isn't auto-untested.
NOTE: probes must live in REPO ROOT (bun can't resolve ./src from /tmp); rm + git checkout after.
