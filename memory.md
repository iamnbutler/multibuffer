# TI memory (compact; detail in #667)

## CRITICAL: memory push size
3 gates. (1) per-FILE 10240 REAL (hit 08-20, 08-26). (2) TOTAL-dir counts .git so always says 45KB>12KB — advisory, ignore. (3) GIT PATCH 10240 REAL, ate the 08-09 memory (#698). File is AT the cap: every add needs an equal delete.
RULE: NEVER full-rewrite — surgical Edit only. 🚨TRAP: a delete far from your edits opens a NEW HUNK (~1200B ctx each); only reshape INSIDE a hunk you already touched, and ADD LESS (detail -> #667). 🔑08-27: SQUEEZE costs old+new patch bytes, DELETE inside a hunk is patch-FREE — prefer DELETE. Verify BOTH `wc -c` and `git diff|wc -c` <10240.
Maintainer fix: raise max-patch-size in daily-test-improver.md:61 (ceiling 100KB).

## Commands (test/typecheck/lint revalidated 2026-08-27, fuzz 08-10)
bun test 2265p/3skip/6todo/0fail (2274 in 76 files, ~2.6s); typecheck clean; lint clean (1 pre-existing info); fuzz 74p. THE 3 SKIP = all of tests/renderer/glyph-atlas.test.ts (skipIf, no 2d ctx). bun NOT preinstalled: curl -fsSL https://bun.sh/install|bash. CI=install>build>typecheck>lint>test. COVERAGE WORKS: bun test --coverage. CLAUDE.md stale (says 590 tests).
lint: biome + no-type-assertion.grit -> use row()/mbRow() from tests/helpers.ts, never `n as BufferRow`.
FLAKE still on main: "Buffer Performance > line access is O(1)". ALWAYS repeat runs before blaming a mutation. #611 fixes.

## State 08-27
main ce545ec (unmoved 158d). Same 9 TI PRs open (#312 #335 #357 #368 #538 #541 #543 #548 #690), ZERO human comments (#690's 5 = bot). #611 open (fixes the flake). #373=maintainer's, lint-blocked.
POSTURE: NO NEW PRs; findings -> #667 COMMENTS (NEVER the body).
🚨 RULE (item 33): before ANY write-up, search open PRs for file+symptom (narrow query, jq the saved file) — 08-18 3 of my 4 "SRC BUGs" were ALREADY PRs (#687 #546 #720). ✅ PAID OFF 08-19(#717) 08-24(#735) 08-27(#752): report only the RESIDUE.
🚨 #667 BODY: 08-25 update EXCEEDED 65536 -> GH NUKED the whole body (0 ticked, unrecoverable). Keep body ~10KB, detail in COMMENTS. 08-27 body OK (8.5KB).
Aug=#667 (Sept rollover 09-01). charset=#696. memory-fail=#698.

## Gotchas
safeoutput branches get a RANDOM HEX SUFFIX; find via git ls-remote --heads origin|grep <prefix>; push_to_pull_request_branch needs a LOCAL branch named exactly that.
git fetch --unshallow origin first; git fetch origin refs/pull/N/head:prN
create_issue returns only {"result":"success"} — NO number; next run must search.
list_issues/search_pull_requests blow the token cap -> use search_issues w/ narrow query.
MUTATION RECIPE: cp src to /tmp, python3 script patches it, run arms, restore, ALWAYS git status --porcelain at end. ONE `bun test` per arm (3x in a loop = 60s timeout). fc.assert unseeded -> counts wobble.
API: snap.excerpts = ARRAY PROPERTY not fn; ExcerptInfo{startRow,endRow}.

## Findings (detail in #667)
08-27 SRC BUG #9 MULTI-FILE LAZY, unclaimed, #667 COMMENT. lazyRender DFLT inits ONLY file[0]; rest EXPANDED BUT BLANK — expandFile/expandAll/scrollToFile all gate init on .collapsed (already FALSE) => unreachable. FIX=gate on !initialized (verified, suite green EITHER WAY). 🔑 3rd FALSE-PREMISE header; DOM half 100% dead, 50.4%; happy-dom setup=dom.test.ts:82. collapseAll over-notify=PR#752 ALREADY.
08-26 SRC BUG #8 PATCH PATHS (patch.ts:30-32), unclaimed, #667 COMMENT. git C-quotes non-ASCII (quotePath dflt TRUE) => DIFF_GIT_HEADER needs BARE a/ => no match; parsePatch:69-87 starts a file ONLY on `diff --git`/`--- `, BINARY+PURE RENAME have NO --- => FILE DROPPED (4->2). SPACE => trailing TAB eaten. FIX: cut at TAB -> C-unquote -> strip a/ -> relax regex.
🔑 08-26 CLEAN don't re-audit: patch.ts hunk batching + row/deco math (oracle, 162 gen + 21 real-git shapes, 0 fail). 🔑 METHOD: BUILD FIXTURES WITH THE REAL git BINARY, oracle vs `git show HEAD:path`. = hand-written fixtures never show what the real producer emits.
08-25 HEADER EXPR IN 5 FILES (dom:767 editor-view:243 webgpu:1087 diff/diff-editor-view:316 react/use-diff-view:149) — GREP THE WHOLE EXPR. #735 fixes 3, NOT the 2 diff ones (they pass their OWN header array INTO render()). RECIPE: remeasure() THEN setDecorations; rAF shim = setTimeout.
08-24 SRC BUG #7 EXCERPT-HEADER (#667 bug7/item40), unclaimed. 5 SITES (see 08-25). Boundaries queried by excerpt START, drawn at row-1 => excerpt starting AT endRow loses an ONSCREEN header.
08-23 SRC BUG #6 INTRALINE-DIFF (#667 bug6/item39), unclaimed (#546=rope chunks, diff loc). computeIntralineDiff compares CODE UNITS -> 2 emoji sharing a high surrogate share a 1-unit prefix -> range starts MID-PAIR -> renderer slices there into separate DOM nodes (highlighter.ts:246-265) = 2 lone surrogates, both U+FFFD. NAIVE SNAP-OUTWARD IS WRONG: 71030 splits->0 but over-highlights 0->7074/67081. RIGHT=Array.from() code points for prefix/suffix AND char Myers (0/0, green).
🔑 08-23 KILLER DETAIL (generalise): rejoined spans == original (halves recombine) so textContent assertions PASS w/ bug present => assert isWellFormed() PER NODE. tests/diff/ = ZERO non-ascii. diff.ts REST CLEAN, don't re-audit (hunk contract 58564x4ctx + minimality vs INDEP LCS DP 14641, 0 violations). Surrogate-safety IS house convention (buffer.ts:96/114, cursor.ts:193, editor.ts:284, PR#546) -> GREP A CONVENTION 4 MODULES KEEP AND 1 IGNORES.
08-22 SRC BUG #4+#5 INJECTION-HL (bugs4/5), unclaimed. Detail in #667. 16 tests all toBeGreaterThan(0)/toBeDefined = BLIND TO POSITION. 🔑 TREE-SITTER RUNS UNDER bun test (playground/wasm/).
08-21 SRC BUG #3 HIGHLIGHT-CLIENT (item37), unclaimed. Detail in #667. FIX=negative cache entries client-side.
🔑 08-21 INFRA: BUN HAS Worker; BOTH tests/worker/*.test.ts headers claim NOT => 559 LOC untested on a FALSE PREMISE. ~40-line fake on globalThis.Worker (set BEFORE dynamic import) drives the real client. LESSON: when a test file says WHY something isn't tested, CHECK it. MEM PATCH: hunk COUNT dominates - context lines here are 400B each.
08-20 SRC BUG #2 GLYPH-ATLAS (item36), unclaimed; #689=SEPARATE atlas NOT dup. Detail in #667. BOTH obvious fixes WRONG. ZERO executed asserts.
08-19 GLOB (#667 items 34/35): get()/has() leak literal excludes below root; SURVIVES #717 AND #336. 2 fixes differ on exclude:["index.ts"] = MAINTAINER call. TEST GAP: no test applies a literal exclude below root. Also `*.{ts}` -> literal; nested braces wrong subset.
CANDIDATE-GEN METHOD THAT WORKED: rank src modules by test-line/src-line ratio (loop over src, grep tests for importers), audit lowest-ratio module with REAL logic. glob.ts was 0.71.
08-17 3 CLEAN audits, do NOT re-audit: rope insert/delete/replace chunk rebuild; WrapMap lazy+_segCharStart; tile-map (ZERO src call sites, don't invest). Item-27 marker present in WrapMap yet no bug => marker predicts a GAP, not always a BUG.
08-13 SRC BUG #1 (unclaimed): search.ts:423 sorts w/ compareAnchors = orders by excerptId.index (SLOT idx) under "Sort by position"; SlotMap recycles idx, doc order = _order[]. 3 public paths -> rows [1,0]; find() lands on LAST match. FIX (a) drop sort or (b) sort by resolved pos like :301. Both verified.
08-12 SLOTMAP set(): 0 test call sites, gen guard (slot_map.ts:100) deletable w/ 2274 green. Prod: multibuffer.ts:697/733/829/891. FIX=4-line twin of :131; VERIFIED.
08-11 REACT: 5 severe mutations to use-diff-view.ts survive (incl old/newText swap). 845 LOC, react-dom sole blocker.
#696 charset: fc.string()=printable ASCII, no \n -> rope/buffer fuzz line props run single-line. Fix verified.
multibuffer.fuzz Prop1 oracle self-referential (1-line fix verified). Prop4 vacuous: 0/6 mutants, proposed oracle 6/6; M5 (`>=`->`>` at multibuffer.ts:545) SURVIVES ALL TESTS = real off-by-one; test query (5,15)->(5,20) closes it.
Timing flakes: 3 causes solved (#667 items 12/15). outlier-driven -> min/median right; stable-gap (~6x) -> widening right. Never blanket-policy.
DISPROVEN: "delete the *.property.test.ts files" — rope.property is the only generated multi-line rope coverage.

next (if posture lifts): bug#1 (search order) + 08-20 glyph-atlas are the 2 unclaimed src bugs — #2/#3/#4 are PRs #720/#546/#687, DON'T re-propose them, push for MERGE instead. Ready: slot_map set() test, #696 impl (charset + SIZE dim >=1024 — this is now the TOP infra item, it closes the whole multi-chunk class that hid #687+#546), excerptBoundaries (5,15)->(5,20), fuzz Prop1/Prop4 oracles.
AUDIT LESSONS: (1) comparators over IDENTITY fields where POSITION meant. (2) TWO FEATURES w/ solid describe blocks that NEVER INTERSECT — grep both markers co-occurring in one test body. Found 08-14 + 08-15 bugs. (3) mirror-image branches (up/down) textually IDENTICAL = suspect. (4) SIZE THRESHOLDS (chunk/page/tier): does any test cross it with INTERESTING content? "x".repeat(2048) hits multi-chunk but nothing a boundary can cut; also CHECK GENERATOR MAX SIZE vs the threshold (all repo generators cap at 100 vs 1024 chunk = whole class unreachable). (5) docstring "equivalent to X but faster" => diff vs X on adversarial input. (6) ONE PRIVATE HELPER, SEVERAL CALLERS: read its postcondition once, check each caller's question against it — correct for its documented query, silently wrong for a neighbouring one. Found 08-16.
METHOD (4 src bugs in 4 runs): take an UNAUDITED item, write a from-scratch ABSOLUTE oracle over adversarial shapes, sweep EVERY offset/row. A/B perf in ONE process (import baseline copy as 2nd module from repo root), swap arm order to rule out JIT artifacts.
Audited+clean: offset.ts(6/6), keysCompare, replaceAll:301, wrap-map pure fns, rope byteLength, rope line/lines/slice/text multi-chunk (08-16), rope insert/delete/replace + WrapMap lazy/_segCharStart (08-17).
UNAUDITED (by ratio, lowest first): DONE = injection-hl 08-22(2 bugs), diff/diff 08-23(#6), editor-view 08-24(#7), diff-editor-view 08-25(wiring), diff/patch 08-26(#8), diff/multi-file 08-27(#9), hl-client 08-21, glob 08-19. NEXT = diff/controller or diff/multibuffer. Also: diff-client worker path (fake-Worker harness); cursor moveWord/movePage (movePage ignores wrapping - may be intended).
NOTE: probes must live in REPO ROOT (bun can't resolve ./src from /tmp); rm + git checkout after.
