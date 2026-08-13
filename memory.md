# TI memory (compact — full detail in #667)

## CRITICAL: memory push size
(1) push_repo_memory validator counts .git (~34KB) so it ALWAYS fails. IGNORE. (2) push job measures the GIT PATCH vs MAX_PATCH_SIZE=10240. REAL — silently ate the 2026-08-09 memory (#698).
RULE: NEVER full-rewrite this file — use surgical Edit calls; git patches only changed lines (08-13: 5.2KB file, 5.9KB patch, fine). A full rewrite costs old+new bytes, so >5KB file = >10KB patch = LOST RUN.
Maintainer fix: raise max-patch-size in daily-test-improver.md:61 (ceiling 100KB).

## Commands (revalidated 2026-08-12)
bun test 2265p/3skip/6todo/0fail (2274 in 76 files, ~3.1s); typecheck clean; lint clean (1 pre-existing info); fuzz 74p. bun NOT preinstalled: curl -fsSL https://bun.sh/install|bash. CI=install>build>typecheck>lint>test. No coverage. CLAUDE.md stale (says 590 tests).
lint: biome + no-type-assertion.grit -> use row()/mbRow() from tests/helpers.ts, never `n as BufferRow`.
FLAKE still on main: "Buffer Performance > line access is O(1)". ALWAYS repeat runs before blaming a mutation. #611 fixes.

## State 2026-08-13
main ce545ec (unmoved since 03-22 = 144d); ZERO PRs merged repo-wide since 08-01. 9 TI PRs open (#312 #335 #357 #368 #538 #541 #543 #548 #690), ZERO human comments ever; no #667 checkbox ticked. #611 open/clean. #373=maintainer's, lint-blocked. Closed 08-xx: #677 #660 #657 #654 (all bot workflow-failure tickets, not mine).
POSTURE: NO NEW PRs; findings -> #667 BODY (I did not comment this run — mine already newest on #667/#696/#690).
Aug=#667 (Sept rollover 09-01). charset=#696. memory-fail=#698.

## Gotchas
safeoutput branches get a RANDOM HEX SUFFIX; find via git ls-remote --heads origin|grep <prefix>; push_to_pull_request_branch needs a LOCAL branch named exactly that.
git fetch --unshallow origin first; git fetch origin refs/pull/N/head:prN
create_issue returns only {"result":"success"} — NO number; next run must search.
list_issues/search_pull_requests blow the token cap -> use search_issues w/ narrow query.
MUTATION RECIPE: cp src to /tmp, python3 script patches it, run arms, restore, ALWAYS git status --porcelain at end. ONE `bun test` per arm (3x in a loop = 60s timeout). fc.assert unseeded -> counts wobble.
API: snap.excerpts = ARRAY PROPERTY not fn; ExcerptInfo{startRow,endRow}.

## Findings (detail in #667)
08-13 REAL SRC BUG (1st non-test-gap find): search.ts:423 sorts results w/ compareAnchors = orders by excerptId.index (SLOT idx, anchor.ts:28) under comment "Sort by position". SlotMap recycles idx via LIFO freeList; doc order is separate _order[] (multibuffer.ts:563) -> diverge. Repro'd 3 public paths (removeExcerpt+addExcerpt / setExcerpts / moveExcerpt) all -> rows [1,0]. USER-VISIBLE: find() lands on LAST match, next() walks UP. FIX (both verified green, suite 2265p + typecheck): (a) DELETE sort — matches already doc-ordered from L-to-R fullText scan; then lint flags unused compareAnchors import :9 => 2-line change; (b) sort by resolved pos, mirroring replaceAll search.ts:301 (which is CORRECT — same file, 120 lines up). Regression test verified BOTH directions. Why missed: 50 search tests, only 2 multi-excerpt (:382,:511), both append sequentially (idx==row); nav test asserts getSelectedText()=="foo" for BOTH matches = order-blind. No 2nd instance: keysCompare has NO prod call site.
08-13 mergeExcerptRanges (excerpt.ts:144, ~44 LOC public API) = ZERO prod call sites, tests-only. Not a bug; don't invest. excerptLineCount tests:0 but covered via toExcerptInfo.
08-12 SLOTMAP: set() has ZERO test call sites (set0 vs insert36/remove17/get15). Deleting gen guard (slot_map.ts:100) survives all 2274. Repro: insert A, remove, insert B, set(staleA) -> clean false/"B", mutant true/"CLOBBERED". Prod: multibuffer.ts:697/733/829/891. FIX=4-line twin of :131; VERIFIED. Other guards: remove-gen-bump 10, no-recycle 3, keysCompare 2, get/has/clear 1 each (get+has = SAME test :77).
08-12 DISPROVEN: offset.ts SOLID 6/6 caught. DO NOT RE-AUDIT.
08-11 REACT: 5 severe mutations to use-diff-view.ts survive all tests+typecheck (incl. old/newText swap => diffs BACKWARDS). react.test.ts=16 tests: 4 export checks, 12 tautologies, 845 LOC undefended. react-dom sole blocker. RETRACTED item 14 (no zero-dep path).
#696 charset: fc.string()=printable ASCII, no \n -> rope/buffer fuzz line props run single-line. Fix verified.
multibuffer.fuzz Prop1 oracle self-referential (1-line fix verified). Prop4 vacuous: 0/6 mutants, proposed oracle 6/6; M5 (`>=`->`>` at multibuffer.ts:545) SURVIVES ALL TESTS = real off-by-one; test query (5,15)->(5,20) closes it.
Timing flakes: 3 causes solved (#667 items 12/15). outlier-driven -> min/median right; stable-gap (~6x) -> widening right. Never blanket-policy.
DISPROVEN: "delete the *.property.test.ts files" — rope.property is the only generated multi-line rope coverage.

next: search-order fix+test (SRC bug, highest value, needs maintainer OK since it touches src), or slot_map set() test (4 lines, ready), or #696 impl, or excerptBoundaries (5,15)->(5,20), if posture lifts.
AUDIT LESSON: look for comparators over IDENTITY fields used where POSITION is meant. Audited+clean: offset.ts(6/6), keysCompare, replaceAll:301.
UNAUDITED next targets: rope.ts(693 LOC), cursor.ts, wrap-map.ts, excerpt.ts computeExcerptSummary/utf8ByteLength(surrogates).
