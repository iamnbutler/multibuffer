# TI memory (compact — full detail in #667)

## CRITICAL: memory push size
(1) push_repo_memory validator counts .git (~34KB) so it ALWAYS fails. IGNORE. (2) push job measures the GIT PATCH vs MAX_PATCH_SIZE=10240. REAL — silently ate the 2026-08-09 memory (#698).
RULE: keep this file <3.5KB. A full rewrite costs old+new bytes, so 6.5KB file = ~13KB patch = LOST RUN.
Maintainer fix: raise max-patch-size in daily-test-improver.md:61 (ceiling 100KB).

## Commands (revalidated 2026-08-11)
bun test 2265p/3skip/6todo/0fail (2274 in 76 files, ~3s); typecheck clean; lint clean (1 pre-existing info); fuzz 74p. bun NOT preinstalled: curl -fsSL https://bun.sh/install|bash. CI=install>build>typecheck>lint>test. No coverage. CLAUDE.md stale (says 590 tests).
lint: biome + no-type-assertion.grit -> use row()/mbRow() from tests/helpers.ts, never `n as BufferRow`.
FLAKE still on main: "Buffer Performance > line access is O(1)" hit 1/3 runs 08-11. ALWAYS repeat runs before blaming a mutation. #611 fixes.

## State 2026-08-11
main ce545ec (unmoved since 03-22 = 142d) => nothing merged, no PR can have conflicted. 9 TI PRs open (#312 #335 #357 #368 #538 #541 #543 #548 #690), ZERO human comments ever; no #667 checkbox ticked. #611 open/clean. #373=maintainer's, lint-blocked.
POSTURE: NO NEW PRs; findings -> #667. Did NOT comment on #690 (all comments bot-to-bot, mine newest).
Aug=#667 (Sept rollover 09-01). charset=#696. memory-fail=#698.

## Gotchas
safeoutput branches get a RANDOM HEX SUFFIX; find via git ls-remote --heads origin|grep <prefix>; push_to_pull_request_branch needs a LOCAL branch named exactly that.
git fetch --unshallow origin first; git fetch origin refs/pull/N/head:prN
create_issue returns only {"result":"success"} — NO number; next run must search.
list_issues/search_pull_requests blow the token cap -> pipe saved .json through python3, print number/title/state only.
MUTATION RECIPE: cp src file to /tmp, python3 heredoc patches it, run arms, restore, ALWAYS git status --porcelain at end. fc.assert unseeded (numRuns:100 CI) -> counts wobble.
API: snap.excerpts = ARRAY PROPERTY not fn; ExcerptInfo{startRow,endRow}.

## Findings (detail in #667)
08-11 REACT: 5 severe mutations to src/react/use-diff-view.ts survive ALL 2274 tests + typecheck (incl. swapping old/newText => diffs render BACKWARDS green). tests/react/react.test.ts=16 tests: 4 export checks, 12 tautologies (read back a literal assigned 1 line above). 845 LOC undefended.
RETRACTED my own backlog item 14 ("data half testable zero-dep"): DiffController.reDiff already covered by tests/diff/controller.test.ts (18 tests, describe("reDiff")), and the uncovered wiring is INSIDE useEffect so such a test bypasses it. NO zero-dep path; react-dom is the sole blocker (happy-dom+react already devDeps; react is an OPTIONAL peer so devDep cost ~0).
DISPROVEN 08-11: (a) UTF-16 truncation in buffer.replace(0,textSummary.chars,..) — chars IS utf16 units (types.ts:70-73), code correct. (b) onDiffChange stale closure — real but use-editor-view.ts does the same at :75 => house convention, NOT a bug; only a doc asymmetry.
#696 charset: fc.string()=printable ASCII, no \n -> rope/buffer fuzz line properties run single-line. Fix verified.
multibuffer.fuzz Prop1 oracle self-referential; 1-line fix verified. Prop4 vacuous: 0/6 mutants, proposed oracle 6/6; M5 (`>=`->`>` at multibuffer.ts:545) SURVIVES ALL TESTS = real uncovered off-by-one; test query (5,15)->(5,20) closes it. Risk LOW (examples catch the other 5).
Timing flakes: 3 causes solved (#667 items 12/15). KEY: outlier-driven (ratio~1.0) -> min/median right; stable-gap (~6x) -> widening right. Never blanket-policy.
DISPROVEN: "delete the *.property.test.ts files" — WRONG; rope.property is the only generated multi-line rope coverage.

next: #696 impl, or excerptBoundaries (5,15)->(5,20), if posture lifts. Do NOT re-raise item 14.
