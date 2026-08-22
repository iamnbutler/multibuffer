# TI memory (compact — full detail in #667)

## CRITICAL: memory push size
3 gates. (1) per-FILE 10240: REAL, hit 08-20 (11.3KB memory.md rejected) — my old "validator always false-fails" note was wrong about THIS one. (2) TOTAL-dir: counts .git (~34KB) so it always reports 45KB>12KB — advisory, ignore, pushes still land. (3) GIT PATCH 10240: REAL, ate the 08-09 memory (#698). File is AT the cap: every add needs an equal delete.
RULE: NEVER full-rewrite this file — use surgical Edit calls; git patches only changed lines (08-13: 5.2KB file, 5.9KB patch. 08-14: 7.4KB file, 6.5KB patch = 63% of cap). A full rewrite costs old+new bytes, so >5KB file = >10KB patch = LOST RUN.
✅ 08-15/16: compacted old findings as planned. Keep doing this: squeeze the oldest finding to 1 line whenever adding a new one, and CHECK `git diff|wc -c` <10240 BEFORE finishing.
Maintainer fix: raise max-patch-size in daily-test-improver.md:61 (ceiling 100KB).

## Commands (test/typecheck/lint revalidated 2026-08-21, fuzz 08-10)
bun test 2265p/3skip/6todo/0fail (2274 in 76 files, ~2.6s); typecheck clean; lint clean (1 pre-existing info); fuzz 74p. THE 3 SKIP = all of tests/renderer/glyph-atlas.test.ts (skipIf, no 2d ctx). bun NOT preinstalled: curl -fsSL https://bun.sh/install|bash. CI=install>build>typecheck>lint>test. No coverage. CLAUDE.md stale (says 590 tests).
lint: biome + no-type-assertion.grit -> use row()/mbRow() from tests/helpers.ts, never `n as BufferRow`.
FLAKE still on main: "Buffer Performance > line access is O(1)". ALWAYS repeat runs before blaming a mutation. #611 fixes.

## State 08-22
main ce545ec (unmoved 153d). Same 9 TI PRs open (#312 #335 #357 #368 #538 #541 #543 #548 #690), ZERO human comments ever (#690's 5 are bot); #667 0 of 40 boxes ticked. #611 open. #373=maintainer's, lint-blocked.
POSTURE: NO NEW PRs; findings -> #667 BODY. 08-19 commented on #717.
✅ 08-19 the item-33 PRE-CHECK RULE PAID OFF 1st time: found glob.ts inconsistency, searched open PRs, it WAS PR #717 — caught before writing up as new. Reported only the RESIDUE #717 misses. KEEP DOING THIS.
🚨🚨 08-18 DISCOVERY: 3 of my 4 "REAL SRC BUGs" WERE ALREADY OPEN PRs. #4=PR #687 (open 08-05, 11d before I "found" it); #3=PR #546 (open 05-06!); #2=PR #720 (08-16). ONLY #1 (search order) unclaimed. I never checked the PR queue. NEW RULE: before writing up ANY finding as new, search open PRs for the file+symptom (search_pull_requests w/ narrow query, then jq the saved file). Recorded as #667 backlog item 33.
✅ #667 body 55->38.6KB on 08-18: REWROTE Suggested Actions to spec one-liners (was 31KB of inlined write-ups; detail now lives in the PRs). LIMIT 65536, lots of headroom now. Read+rewrite of #667 costs ~35K tokens/run.
Aug=#667 (Sept rollover 09-01). charset=#696. memory-fail=#698.

## Gotchas
safeoutput branches get a RANDOM HEX SUFFIX; find via git ls-remote --heads origin|grep <prefix>; push_to_pull_request_branch needs a LOCAL branch named exactly that.
git fetch --unshallow origin first; git fetch origin refs/pull/N/head:prN
create_issue returns only {"result":"success"} — NO number; next run must search.
list_issues/search_pull_requests blow the token cap -> use search_issues w/ narrow query.
MUTATION RECIPE: cp src to /tmp, python3 script patches it, run arms, restore, ALWAYS git status --porcelain at end. ONE `bun test` per arm (3x in a loop = 60s timeout). fc.assert unseeded -> counts wobble.
API: snap.excerpts = ARRAY PROPERTY not fn; ExcerptInfo{startRow,endRow}.

## Findings (detail in #667)
08-22 SRC BUG #4+#5 INJECTION-HL (#667 bugs 4/5), unclaimed (#680=skip path only, #685 byte-identical). getLineTokens uses injected-tree cols AS buffer cols; TS strips node.startPosition.column from the FIRST line of node.text ONLY => row0 of every INDENTED fence (list/quote) shifts LEFT by startColumn, row1+ OK. Range HAS it, unused (:205). FIX verified: shift toks when relativeRow===0. #5: endRow swallows the CLOSING fence row (renders unstyled); col0 guard fixes flat not indented = maintainer call. SUITE GREEN BOTH WAYS: all 16 tests toBeGreaterThan(0)/toBeDefined, NONE checks WHICH CHARS a token covers.
🔑 08-22 INFRA: TREE-SITTER RUNS UNDER bun test (wasm in playground/wasm/) => injection-hl FULLY testable w/ real oracle; probe via _bufferParses.
08-21 SRC BUG #3 HIGHLIGHT-CLIENT (#667 item 37), unclaimed, NO open PR in src/worker. Worker omits 0-token rows (highlight-worker.ts:112); client treats absent=uncached (:246-255) => BLANK LINE NEVER CACHES => 3 round-trips vs 1 control for 3 identical getTokensAsync(0,50). Holes collapse to ONE [minMissing,maxMissing+1) req so blanks at BOTH edges re-fetch the WHOLE viewport every call. Knock-on: always-in-flight => stale branch (:287-290) DROPS worker tokens (frame1 got 0 rows, worker returned 48). FIX=negative cache entries client-side.
🔑 08-21 INFRA: BUN HAS Worker (`typeof Worker`=="function"). BOTH tests/worker/*.test.ts headers claim it does NOT => 559 LOC untested on a FALSE PREMISE. ~40-line fake on globalThis.Worker (set BEFORE dynamic import) drives the real client. LESSON: when a test file explains WHY something isn't tested, CHECK the explanation. MEM PATCH: hunk COUNT dominates — a delete OUTSIDE an existing hunk ADDS ~600B; edit only inside hunks you already touch.
08-20 SRC BUG #2 GLYPH-ATLAS (item 36), unclaimed; #689=SEPARATE atlas, NOT dup. _expand grows WIDTH on VERTICAL overflow -> true w/o fixing -> glyph off-canvas, cached valid:true (glyph #2049+/any CJK; ctor prepop lineHeight>=74). BOTH obvious fixes WRONG (height-first 9x worse when charWidth>width); CORRECT = loop till BOTH axes fit, expand DEFICIENT axis. ZERO executed assertions; unskip via #689's 2d-ctx stand-in. AUDITED.
08-19 GLOB (#667 items 34/35): get()/has() leak literal excludes below root; SURVIVES PR #717 AND #336 (shouldInclude anchors at ROOT glob.ts:228; get() never calls shouldTraverseDirectory tree.ts:106). 2 fixes verified, differ on exclude:["index.ts"] = MAINTAINER call. TEST GAP: no test applies a literal exclude below root. Also `*.{ts}` -> literal; nested braces match wrong subset.
CANDIDATE-GEN METHOD THAT WORKED: rank src modules by test-line/src-line ratio (loop over src, grep tests for importers), audit lowest-ratio module with REAL logic. glob.ts was 0.71.
08-17 3 CLEAN audits, do NOT re-audit: rope insert/delete/replace chunk rebuild; WrapMap lazy+_segCharStart; tile-map (ZERO src call sites, don't invest). Item-27 marker present in WrapMap yet no bug => marker predicts a GAP, not always a BUG.
08-13 SRC BUG #1 (unclaimed): search.ts:423 sorts w/ compareAnchors = orders by excerptId.index (SLOT idx) under "Sort by position"; SlotMap recycles idx, doc order = _order[]. 3 public paths -> rows [1,0]; find() lands on LAST match. FIX (a) drop sort or (b) sort by resolved pos like :301. Both verified.
08-12 SLOTMAP: set() has ZERO test call sites. Deleting gen guard (slot_map.ts:100) survives all 2274. Repro: insert A, remove, insert B, set(staleA) -> mutant CLOBBERS. Prod: multibuffer.ts:697/733/829/891. FIX=4-line twin of :131; VERIFIED.
08-11 REACT: 5 severe mutations to use-diff-view.ts survive all tests+tc (incl old/newText swap=>diffs BACKWARDS). 16 tests defend 0 of 845 LOC. react-dom sole blocker.
#696 charset: fc.string()=printable ASCII, no \n -> rope/buffer fuzz line props run single-line. Fix verified.
multibuffer.fuzz Prop1 oracle self-referential (1-line fix verified). Prop4 vacuous: 0/6 mutants, proposed oracle 6/6; M5 (`>=`->`>` at multibuffer.ts:545) SURVIVES ALL TESTS = real off-by-one; test query (5,15)->(5,20) closes it.
Timing flakes: 3 causes solved (#667 items 12/15). outlier-driven -> min/median right; stable-gap (~6x) -> widening right. Never blanket-policy.
DISPROVEN: "delete the *.property.test.ts files" — rope.property is the only generated multi-line rope coverage.

next (if posture lifts): bug#1 (search order) + 08-20 glyph-atlas are the 2 unclaimed src bugs — #2/#3/#4 are PRs #720/#546/#687, DON'T re-propose them, push for MERGE instead. Ready: slot_map set() test, #696 impl (charset + SIZE dim >=1024 — this is now the TOP infra item, it closes the whole multi-chunk class that hid #687+#546), excerptBoundaries (5,15)->(5,20), fuzz Prop1/Prop4 oracles.
AUDIT LESSONS: (1) comparators over IDENTITY fields where POSITION meant. (2) TWO FEATURES w/ solid describe blocks that NEVER INTERSECT — grep both markers co-occurring in one test body. Found 08-14 + 08-15 bugs. (3) mirror-image branches (up/down) textually IDENTICAL = suspect. (4) SIZE THRESHOLDS (chunk/page/tier): does any test cross it with INTERESTING content? "x".repeat(2048) hits multi-chunk but nothing a boundary can cut; also CHECK GENERATOR MAX SIZE vs the threshold (all repo generators cap at 100 vs 1024 chunk = whole class unreachable). (5) docstring "equivalent to X but faster" => diff vs X on adversarial input. (6) ONE PRIVATE HELPER, SEVERAL CALLERS: read its postcondition once, check each caller's question against it — correct for its documented query, silently wrong for a neighbouring one. Found 08-16.
METHOD (4 src bugs in 4 runs): take an UNAUDITED item, write a from-scratch ABSOLUTE oracle over adversarial shapes, sweep EVERY offset/row. A/B perf in ONE process (import baseline copy as 2nd module from repo root), swap arm order to rule out JIT artifacts.
Audited+clean: offset.ts(6/6), keysCompare, replaceAll:301, wrap-map pure fns, rope byteLength, rope line/lines/slice/text multi-chunk (08-16), rope insert/delete/replace + WrapMap lazy/_segCharStart (08-17).
UNAUDITED (by ratio, lowest first): injection-hl DONE 08-22 (2 bugs), diff/diff .65 (NEXT), editor-view .66, diff-editor-view .75, diff/patch .92, diff/multi-file .95. hl-client DONE 08-21 (diff-client worker path still untested, same fake-Worker harness). Also still: cursor moveWord/movePage (movePage ignores wrapping - may be intended). project/glob.ts DONE 08-19.
NOTE: probes must live in REPO ROOT (bun can't resolve ./src from /tmp); rm + git checkout after.
