# TI memory (compact; detail in #667)

## CRITICAL: memory push size
3 gates: (1) per-FILE 10240 REAL. (2) TOTAL-dir counts .git, always says 45KB>12KB — advisory, IGNORE. (3) GIT PATCH 10240 REAL (ate 08-09 memory, #698). File is AT the cap: every add needs an equal DELETE.
RULE: NEVER full-rewrite, surgical Edit only. 🔑09-02: FILE gate binds LONG before patch gate — but "trims" that add new lessons NET ZERO. Budget first: write the new finding at ~400B, then DELETE 400B. Verify BOTH `wc -c` and `git diff|wc -c` <10240.
Maintainer fix: raise max-patch-size in daily-test-improver.md:61 (ceiling 100KB).

## Commands (test/typecheck/lint revalidated 2026-08-27, fuzz 08-10)
bun test 2265p/3skip/6todo/0fail (2274 in 76 files, ~2.6s); typecheck clean; lint clean (1 pre-existing info); fuzz 74p. THE 3 SKIP = all of tests/renderer/glyph-atlas.test.ts (skipIf, no 2d ctx). bun NOT preinstalled: curl -fsSL https://bun.sh/install|bash. CI=install>build>typecheck>lint>test. COVERAGE WORKS: bun test --coverage. CLAUDE.md stale (says 590 tests).
lint: biome + no-type-assertion.grit -> use row()/mbRow() from tests/helpers.ts, never `n as BufferRow`.
FLAKE still on main: "Buffer Performance > line access is O(1)". ALWAYS repeat runs before blaming a mutation. #611 fixes.

## State 09-06 (cmds revalidated: 2265/3/6/0, tc+lint clean)
main ce545ec (unmoved 168d). Same 9 TI PRs open (#312 #335 #357 #368 #538 #541 #543 #548 #690), 0 human comments. VERIFIED+urged: #745 #741 #748 #728(+#711) #743. #611 open.
POSTURE: NO NEW PRs; findings -> monthly-issue COMMENTS, or the PR itself when ABOUT that PR (09-01 #357). NEVER a body.
🚨 RULE (item 33): before ANY write-up, search open PRs AND ISSUES for file+symptom (narrow query, jq the saved file) — 08-18 3 of my 4 "SRC BUGs" were ALREADY PRs. PAID OFF 7x (latest 09-02: #467/#472 were NEAR-MISSES, same file+feature, different defect) — report the RESIDUE.
🚨 #667 BODY: 08-25 update EXCEEDED 65536 -> GH NUKED whole body. Keep ~10KB, detail in COMMENTS.
Aug=#667 CLOSED. Sept=#789 (Oct rollover 10-01). charset=#696. memory-fail=#698.

## Gotchas
safeoutput branches get a RANDOM HEX SUFFIX; find via git ls-remote --heads origin|grep <prefix>; push_to_pull_request_branch needs a LOCAL branch named exactly that.
git fetch --unshallow origin first; git fetch origin refs/pull/N/head:prN
create_issue returns only {"result":"success"} — NO number; next run must search.
list_issues/search_pull_requests blow the token cap -> use search_issues w/ narrow query.
MUTATION RECIPE: cp src to /tmp, python3 script patches it, run arms, restore, ALWAYS git status --porcelain at end. ONE `bun test` per arm (3x in a loop = 60s timeout). fc.assert unseeded -> counts wobble.
API: snap.excerpts=ARRAY PROP not fn; ExcerptInfo{startRow,endRow}; BufferSnapshot has NO .length (use .text().length); insert(offset(NaN)) silently corrupts.

## Findings (detail in #667)
🔑09-03 REAL-BROWSER ORACLE: `bunx playwright install chromium` WORKS in CI (~111MB/60s) -> page.keyboard.press, capture e.key, feed the REAL src fn. Extends 08-26 "real producer" to ANY DOM/event contract.
09-06 undo/redo AUDITED. SRC BUG #16 unclaimed: HistoryEntry.editStart = MB POINT but same-buf CROSS-EXCERPT edit COLLAPSES excerpt rows => _applyInverse hits WRONG space. Repro controller.test.ts:331+undo; w/ reDiff = SILENT NO-OP. removedText mutants: same-exc(:1525)=37, cross-BUF(:1570)=4, same-buf-cross-exc(:1548)=0 (1 test enters it). undo-redo.test.ts ALL 1-exc; setupTwoExcerpts(editor.test.ts:1472)=2 DIFF bufs. SPLIT-PATH FIX FALSIFIED (fwd edit VANISHES, boundary NL). REST CLEAN.
09-04 multi-sel EDIT AUDITED; editability bug = PR #728 VERIFIED (2272/0, revert-src 5/7, 13/13 probes, +#711=2278/0). ENDPOINT-ONLY FIX INSUFFICIENT (locked MIDDLE exc) => need spanned LOOP. non-editable.test.ts = 20 tests ALL setCursor. 🚨 PROBE NEEDS 1 SHARED BUFFER.
09-03 input-handler AUDITED, both bugs = PRs #741 (Mod+Shift+K/Z dead, 2277/0) + #748 (2284/0); CapsLock half UNPROVEN.
09-02 SRC BUG #13 PRIMARY-SEL (editor.ts:1821), unclaimed. _mergeSelections SORTS => breaks "primary=last=NEWEST" (:169/:176-8/:1819); caret IS primary (editor-view:263). ORDER-ONLY mutant `merged.reverse()` = 2263/2. PARTIAL: _insertText:642 discards `index` at :649. #467/#472 DIFFERENT.
09-01 SRC BUG #12 moveWord RIGHT (cursor.ts:296-303), unclaimed, ->#357. Skips 1st WORD of every line entered (5/7 shapes; left 0). WILD mutant 2265/0 = UNVERIFIED. 🚨MY PR #357 PINS IT: all fixtures 1-word next line. movePage CLEAN+COVERED, don't re-audit.
08-31 diff-client CLEAN; its 1 bug = PR #745, VERIFIED+urged merge. hl-client 4.63%, 0 worker cov, #743+#745 both decline = OPEN GAP, best next PR. 🔑 BUN HAS Worker; run REAL *-worker.ts via `new URL(...,import.meta.url)` from REPO-ROOT probe. LESSON: a test file stating WHY it skips something — CHECK it, 4/4 false.
08-30 excerpt.ts LOGIC CLEAN (632/632 oracle) but summary SLOW PATH UNTESTED: 5 mutants survive (incl ALL ZEROS); only named test takes FAST PATH (excerpt.ts:51) so asserts BUFFER summary. #684/#510/#766 rewrite it. mergeExcerptRanges CLEAN, 0 src call sites.
08-29 SRC BUG #11 VIEWPORT-ANCHORS, unclaimed. resolveAnchorsInViewport (multibuffer.ts:374-384) filters by anchor's OLD excerpt, returns the RESOLVED one => ON-SCREEN anchor DROPPED (142; 0 after FIX=early-return on editsSince(anchor.ver)>0). 🚨#664=SAME filter OPPOSITE dir, CANNOT fix mine.
08-28 SRC BUG #10 ANCHORS, unclaimed. setExcerpts (multibuffer.ts:798) writes NO _replacedExcerpts (setExcerptsForBuffer:900 DOES) => reDiff orphans EVERY anchor: 6/6 lost on NO-OP rediff, getSelectedText->"". 150ms debounce WHILE TYPING (diff-editor-view.ts:243). FIX=region map => 0/6.
08-26 SRC BUG #8 PATCH PATHS (patch.ts:30-32), unclaimed, #667. git C-quotes non-ASCII; BINARY+RENAME have NO `--- ` => FILE DROPPED (4->2). SPACE => trailing TAB eaten.
🔑 08-26 CLEAN: patch.ts hunk batching + row/deco math (oracle, 162 gen + 21 real-git shapes, 0 fail). 🔑 METHOD: BUILD FIXTURES WITH THE REAL git BINARY, oracle vs `git show HEAD:path` — hand-written fixtures never show what the real producer emits.
09-05 hl-client+WORKER AUDITED. Cache bug = PR #743 VERIFIED w/ REAL worker (2271/0, revert-src 3/6). RESIDUE = SRC BUG #15: _latestTokenRequests keyed by bufferId ONLY -> 5 concurrent DISJOINT getTokensAsync = 200/250 rows LOST; deleting guard = 2265/0 IDENTICAL; NOT post-parse (msgs IN ORDER). 🔑 REAL-WORKER ORACLE: REAL *-worker.ts via `new URL(...,import.meta.url)` REPO-ROOT probe + playground/wasm/*.wasm; SUBCLASS global Worker to COUNT msgs.
09-05 SRC BUG #14 HIGHLIGHTER (highlighter.ts:95), unclaimed, ->#789. parse(text,oldTree) passes oldTree EVEN W/O edit => reuses OLD node positions => MISALIGNED tokens ("funct"/"on zz"), not just stale; deleteBuffer-first = correct. FIX `oldTree && edit ? oldTree : undefined` = 2264/1; the 1 = highlighter.test.ts:74 NAMED "correct tokens" but asserts STALE width (LESSON-8 2nd HIT). src/worker/index.ts:26 docstring DEMOS the broken path. UNMEASURED: _trees overwrite w/o .delete().
🔑 08-23 KILLER DETAIL: rejoined spans == original so textContent asserts PASS w/ bug => assert isWellFormed() PER NODE. tests/diff/ ZERO non-ascii. diff.ts REST CLEAN don't re-audit. Surrogate-safety IS house convention (buffer.ts:96/114, cursor.ts:193, editor.ts:284) -> GREP A CONVENTION 4 MODULES KEEP AND 1 IGNORES.
DROPPED 09-05 -> #667 + #789 items11/12/13: bug7 HEADER, bug6 INTRALINE, bugs4/5 INJECTION-HL, bug2 GLYPH-ATLAS. Lesson: asserts of ONLY >0/toBeDefined = BLIND TO POSITION.
08-19 GLOB: get()/has() leak literal excludes below root; SURVIVES #717+#336. 2 fixes differ on exclude:["index.ts"] = MAINTAINER call. Also `*.{ts}` -> literal; nested braces wrong subset.
CANDIDATE-GEN: rank src by test-line/src-line ratio (grep tests for importers); audit lowest w/ REAL logic (glob.ts 0.71).
08-17 3 CLEAN don't re-audit: rope insert/delete/replace chunk rebuild; WrapMap lazy+_segCharStart; tile-map (ZERO src call sites, don't invest). Item-27 marker in WrapMap yet no bug => marker predicts a GAP, not always a BUG.
08-13 SRC BUG #1 (unclaimed): search.ts:423 sorts w/ compareAnchors = orders by excerptId.index (SLOT idx) under "Sort by position"; SlotMap recycles idx, doc order = _order[]. 3 paths -> rows [1,0]. FIX (a) drop sort or (b) sort by resolved pos like :301. Both verified.
multibuffer.fuzz Prop1 oracle self-referential (1-line fix verified). Prop4 vacuous: 0/6 mutants, proposed oracle 6/6; M5 (`>=`->`>` at multibuffer.ts:545) SURVIVES ALL TESTS = real off-by-one; test query (5,15)->(5,20) closes it.

next (if posture lifts): FULL ranked backlog now lives in #789 BODY — read it, don't duplicate here. #2/#3/#4 ARE PRs #720/#546/#687+#745 — push MERGE.
AUDIT LESSONS: (1) comparator on IDENTITY field where POSITION meant. (2) two features w/ solid describes that NEVER INTERSECT — grep both markers in one test body. (3) mirror branches (up/down) IDENTICAL = suspect [09-02 HIT]. (4) SIZE THRESHOLD: any test cross it w/ interesting content? check GENERATOR MAX vs threshold (100 vs 1024 = unreachable). (5) "same as X but faster" => diff vs X adversarially. (6) ONE HELPER MANY CALLERS: each caller's question vs postcondition [09-02 HIT, 8 callers]. (7) test NAMED for behaviour it never reaches — prove w/ mutant, not coverage. (8) 🔑09-02 a test COMMENT explaining why a surprise is "expected" = it describes the IMPL; go read the CONTRACT (docstring/getter) — they contradicted.
METHOD (4 src bugs in 4 runs): take an UNAUDITED item, write a from-scratch ABSOLUTE oracle over adversarial shapes, sweep EVERY offset/row; THEN MUTATE to prove tests catch a regression (08-30: oracle said clean, mutants said untested — do both).
UNAUDITED: DONE = glob, hl-client(+WORKER), injection-hl, diff/diff, editor-view, diff-editor-view, diff/patch, multi-file, diff/controller, anchor+viewport, excerpt, diff-client, selection, cursor, input-handler, editor._mergeSelections + multi-sel edit, undo/redo. NEXT = slot_map.set; highlighter REST (:95 done); bracket-match; editor/search.
NOTE: probes must live in REPO ROOT (bun can't resolve ./src from /tmp); rm + git checkout after.
