# TI memory (compact — full detail in #667)

## CRITICAL: memory push size
Two checks. (1) push_repo_memory MCP validator counts .git (~34KB) so it ALWAYS fails: 37KB for a 3.4KB file. IGNORE. (2) push job measures the GIT PATCH vs MAX_PATCH_SIZE=10240. THIS ONE IS REAL and silently ate the 2026-08-09 memory (branch last commit was the 08-08 run). Diagnosed by Repo Assist on #698.
RULE: keep this file <3.4KB. A full rewrite costs old+new bytes, so 6.5KB file = ~13KB patch = LOST RUN. My old note "validator broken, ignore and proceed" was HALF WRONG and cost a run.
Maintainer fix: raise max-patch-size in daily-test-improver.md:61 (ceiling 100KB).

## Commands (revalidated 2026-08-10)
bun test 2265p/3skip/6todo/0fail (2274 in 76 files); typecheck clean; lint clean (1 pre-existing info); bun run fuzz 74p/0f. bun NOT preinstalled: curl -fsSL https://bun.sh/install|bash. CI=install>build>typecheck>lint>test. No coverage. CLAUDE.md stale (says 590 tests).
lint: biome + no-type-assertion.grit -> use row()/mbRow() from tests/helpers.ts, never `n as BufferRow`.

## State 2026-08-10
main ce545ec, 140d idle. 9 TI PRs open (#312 #335 #357 #368 #538 #541 #543 #548 #690), ZERO human comments ever; no #667 checkbox ticked. #373=maintainer's, lint-blocked.
POSTURE: NO NEW PRs; findings -> #667. Did NOT comment on #696 this run — my own comment was already latest there 2 runs running, so a 3rd self-follow-up = spam.
Aug=#667 (Sept rollover 09-01). charset=#696. memory-fail=#698.

## Gotchas
safeoutput branches get a RANDOM HEX SUFFIX; find via git ls-remote --heads origin|grep <prefix>; push_to_pull_request_branch needs a LOCAL branch named exactly that.
git fetch --unshallow origin first; git fetch origin refs/pull/N/head:prN
create_issue returns only {"result":"success"} — NO number; next run must search.
scratch: tests/<dir>/_scratch_*.test.ts; COPY imports from a real test file (helpers.ts re-exports excerptRange/createBufferId/mbRow, NOT src/); rm after.
MUTATION RECIPE: python3 heredoc patches src, run arms, restore, ALWAYS git status --porcelain at end. fc.assert unseeded at numRuns:100 in CI -> counts wobble; structural misses stable.
API: snap.excerpts = ARRAY PROPERTY not fn; ExcerptInfo{startRow,endRow}.
search_pull_requests 'is:pr is:open in:title "[Test Improver]"'. READ COMMENTS BEFORE COMMENTING.

## Findings (detail in #667)
#696 charset: fc.string()=printable ASCII, no \n -> rope/buffer fuzz line properties run single-line. Fix verified.
multibuffer.fuzz Prop1 oracle self-referential; 1-line fix verified.
NEW 08-10 Prop4 "excerptBoundaries returns correct row positions": oracle checks only in-bounds+ascending, never positions -> blind 0/6 mutants; proposed oracle 6/6, green clean. M5 (`>=endRow`->`>endRow`) SURVIVES ALL 2274 TESTS = real uncovered off-by-one at the exclusive range end (existing test uses (5,15) with excerpts 0/10/20, never hits end-exact). BUT example tests catch the other 5 mutants (3-13 fails each) => property vacuous, risk LOW. Do not oversell.
Timing flakes: 3 causes solved (#667 items 12/15). KEY: outlier-driven (ratio~1.0) -> min/median right, widening wrong; stable-gap (~6x) -> widening right. Never blanket-policy.
DISPROVEN: "delete the *.property.test.ts files" — WRONG; rope.property is the only generated multi-line rope coverage.

next: backlog item 14 (useDiffView, zero deps) and #696 impl, if posture lifts.
