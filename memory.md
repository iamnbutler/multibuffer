# TI memory (compact — full detail in #667)

## CRITICAL: memory push size
(1) push_repo_memory validator counts .git (~34KB) so it ALWAYS fails. IGNORE. (2) push job measures the GIT PATCH vs MAX_PATCH_SIZE=10240. REAL — silently ate the 2026-08-09 memory (#698).
RULE: NEVER full-rewrite this file — use surgical Edit calls; git patches only changed lines (08-13: 5.2KB file, 5.9KB patch. 08-14: 7.4KB file, 6.5KB patch = 63% of cap). A full rewrite costs old+new bytes, so >5KB file = >10KB patch = LOST RUN.
✅ 08-15/16: compacted old findings as planned. Keep doing this: squeeze the oldest finding to 1 line whenever adding a new one, and CHECK `git diff|wc -c` <10240 BEFORE finishing.
Maintainer fix: raise max-patch-size in daily-test-improver.md:61 (ceiling 100KB).

## Commands (bun test revalidated 2026-08-19, rest 08-12)
bun test 2265p/3skip/6todo/0fail (2274 in 76 files, ~3.1s); typecheck clean; lint clean (1 pre-existing info); fuzz 74p. bun NOT preinstalled: curl -fsSL https://bun.sh/install|bash. CI=install>build>typecheck>lint>test. No coverage. CLAUDE.md stale (says 590 tests).
lint: biome + no-type-assertion.grit -> use row()/mbRow() from tests/helpers.ts, never `n as BufferRow`.
FLAKE still on main: "Buffer Performance > line access is O(1)". ALWAYS repeat runs before blaming a mutation. #611 fixes.

## State 08-19
main ce545ec (unmoved 150d); 0 PRs merged repo-wide since 08-01. Same 9 TI PRs open (#312 #335 #357 #368 #538 #541 #543 #548 #690), ZERO human comments ever; 0 #667 checkboxes ticked. #611 open. #373=maintainer's, lint-blocked.
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
08-19 GLOB (item 34/35). ProjectTree self-contradiction: exclude ["node_modules"] + NESTED packages/a/node_modules -> entries() omits dep file but get() RETURNS it, has()=true. PR #717 fixes only children(); get()/has() leak SURVIVES #717 AND #336 (verified 3 arms) because shouldInclude anchors literal excludes at ROOT (glob.ts:228) and get() NEVER calls shouldTraverseDirectory (tree.ts:106). #717's "files are accidentally safe" claim is WRONG. 2 fixes verified 0 viol/2265p: conservative=split.slice(0,-1).includes(pat); fullmirror=split.includes(pat); differ on exclude:["index.ts"] vs src/index.ts = MAINTAINER call. TEST GAP: NO test applies a literal exclude below root -> main AND both fixes all green. Also: compileGlob single-alt brace `*.{ts}` -> literal `\{ts\}` (glob.ts:34-40 recompiles ORIGINAL pattern when expansion yields 1); nested `{a,{b,c}}.ts` matches b.ts NOT a.ts.
CANDIDATE-GEN METHOD THAT WORKED: rank src modules by test-line/src-line ratio (loop over src, grep tests for importers), audit lowest-ratio module with REAL logic. glob.ts was 0.71.
08-17 NO src bug — 3 CLEAN audits, do NOT re-audit: (a) rope insert/delete/replace chunk rebuild 395299 asserts 0 fail (all ops at offs 0/1/1023/1024/1025/2047/8/9/ends/mids x12 adversarial docs + 60-op seqs; text/length/lineCount/line/lines/textChunks/slice). (b) WrapMap lazy+_segCharStart 172253 asserts 0 fail (7 corpora x7 widths, asc/desc/scattered, segmentCharStart as FIRST call, interleaved visualRowToBufferRow). Item-27 marker present (NO lazy test calls segmentCharStart) yet no bug => marker predicts a GAP, not always a BUG. (c) tile-map ZERO src/ call sites (barrel+tests+bench only) => don't invest; edges: endRow=min(tileStart+lpt,totalLines) no lower bound -> {startRow:20,endRow:5} neg height; totalLines=0 default -> markDocumentDirty silent no-op; empty viewport reports tile 0 visible.
08-16 bug#4 = DUPLICATE of PR #687 (detail there). rope lineColToOffset/_findLineStartOffset/offsetToLineCol wrong on lines >=1024 units. MY UNIQUE ADD (now in my #687 comment): E2E corruption via public API - mb.edit(mbPoint(1,0),..,"INSERTED") on `before\n`+x*2048+`\nafter` lands at col 1024 not 0. Re-verified on ce545ec 08-18. WHY MISSED: rope.test.ts:74 builds the EXACT trigger doc but asserts only lineCount+line(0/1/2) = the SAFE family (_findChunkByLine correct for "chunk holding n-th newline", wrong for "chunk where line L starts").
08-15 bug#3 = DUPLICATE of PR #546 (open since 05-06, identical 4-line fix in textToChunks). byteLength +3 when surrogate pair splits at chunk boundary.
08-14 bug#2 = DUPLICATE of PR #720 (identical fix). cursor.ts:136 up-branch must use LAST visual row not first.
08-13 REAL SRC BUG #1: search.ts:423 sorts w/ compareAnchors = orders by excerptId.index (SLOT idx) under "Sort by position"; SlotMap recycles idx, doc order = separate _order[]. 3 public paths -> rows [1,0]. find() lands on LAST match. FIX (a) delete sort (already doc-ordered) or (b) sort by resolved pos like replaceAll :301. Both verified. Detail #667.
08-12 SLOTMAP: set() has ZERO test call sites (set0 vs insert36/remove17/get15). Deleting gen guard (slot_map.ts:100) survives all 2274. Repro: insert A, remove, insert B, set(staleA) -> clean false/"B", mutant true/"CLOBBERED". Prod: multibuffer.ts:697/733/829/891. FIX=4-line twin of :131; VERIFIED. Other guards: remove-gen-bump 10, no-recycle 3, keysCompare 2, get/has/clear 1 each (get+has = SAME test :77).
08-11 REACT: 5 severe mutations to use-diff-view.ts survive all tests+tc (incl old/newText swap=>diffs BACKWARDS). 16 tests defend 0 of 845 LOC. react-dom sole blocker; item 14 RETRACTED (no zero-dep path).
#696 charset: fc.string()=printable ASCII, no \n -> rope/buffer fuzz line props run single-line. Fix verified.
multibuffer.fuzz Prop1 oracle self-referential (1-line fix verified). Prop4 vacuous: 0/6 mutants, proposed oracle 6/6; M5 (`>=`->`>` at multibuffer.ts:545) SURVIVES ALL TESTS = real off-by-one; test query (5,15)->(5,20) closes it.
Timing flakes: 3 causes solved (#667 items 12/15). outlier-driven -> min/median right; stable-gap (~6x) -> widening right. Never blanket-policy.
DISPROVEN: "delete the *.property.test.ts files" — rope.property is the only generated multi-line rope coverage.

next (if posture lifts): ONLY bug#1 (search order) is still mine to fix — #2/#3/#4 are PRs #720/#546/#687, DON'T re-propose them, push for MERGE instead. Ready: slot_map set() test, #696 impl (charset + SIZE dim >=1024 — this is now the TOP infra item, it closes the whole multi-chunk class that hid #687+#546), excerptBoundaries (5,15)->(5,20), fuzz Prop1/Prop4 oracles.
AUDIT LESSONS: (1) comparators over IDENTITY fields where POSITION meant. (2) TWO FEATURES w/ solid describe blocks that NEVER INTERSECT — grep both markers co-occurring in one test body. Found 08-14 + 08-15 bugs. (3) mirror-image branches (up/down) textually IDENTICAL = suspect. (4) SIZE THRESHOLDS (chunk/page/tier): does any test cross it with INTERESTING content? "x".repeat(2048) hits multi-chunk but nothing a boundary can cut; also CHECK GENERATOR MAX SIZE vs the threshold (all repo generators cap at 100 vs 1024 chunk = whole class unreachable). (5) docstring "equivalent to X but faster" => diff vs X on adversarial input. (6) ONE PRIVATE HELPER, SEVERAL CALLERS: read its postcondition once, check each caller's question against it — correct for its documented query, silently wrong for a neighbouring one. Found 08-16.
METHOD (4 src bugs in 4 runs): take an UNAUDITED item, write a from-scratch ABSOLUTE oracle over adversarial shapes, sweep EVERY offset/row. A/B perf in ONE process (import baseline copy as 2nd module from repo root), swap arm order to rule out JIT artifacts.
Audited+clean: offset.ts(6/6), keysCompare, replaceAll:301, wrap-map pure fns, rope byteLength, rope line/lines/slice/text multi-chunk (08-16), rope insert/delete/replace + WrapMap lazy/_segCharStart (08-17).
UNAUDITED (by ratio, lowest first — use the 08-19 ratio method): worker/highlight-client.ts .17, renderer/glyph-atlas.ts .26, injection-highlighter.ts .37, diff/diff.ts .65, editor-view.ts .66, diff-editor-view.ts .75, diff/patch.ts .92, diff/multi-file.ts .95. Also still: cursor moveWord/movePage (movePage ignores wrapping - may be intended). project/glob.ts DONE 08-19.
NOTE: probes must live in REPO ROOT (bun can't resolve ./src from /tmp); rm + git checkout after.
