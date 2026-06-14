m:#310#339#565#575 mo:June2026(#588) main:ce545ec
last:2026-06-14 r:27506915028 T2+T4+T5+T7
bun:works via curl install in runner
bl:GA/IH(#377)/undo(#435); rope.slice done#565; PT(#540) done#575
hold:reinstated(maint-only); lifted twice for #565,#575
0614:maint run. All4 perf-PRs mergeable_state:clean (API verified: #310 base51f94a3,#339 base7e50d57,#565/#575 ce545ec; all draft,no CI fail,no conflicts). Since 0613 only new PR is docs #603(unbloat implementor-agent-design,Doc Unbloat). Main unchanged ce545ec. No perf PRs merged/closed; SA-list unchanged(59). #588 had 0 comments=no maint instructions/checkbox changes. Perf issues #417/#446/#496/#540 each have exactly 1 bot comment(verified get_comments),no human comments,untouched since May. Prepended 0614 run entry to #588; condensed 0604-0609 into Earlier-June summary block(was 0601-0603) to bound issue growth.
NOTE:many SA-list items(#331/#360/#366 etc) are [Repo Assist] PRs accreted historically-still open, carried fwd.
NOTE:push_repo_memory reports phantom 31KB regardless of content=likely counting .git/(172K); ignore, auto-push handles actual files.
NOTE:search_issues/list_pull_requests results overflow token limit; use python/jq on saved tool-result file to extract number/title/state/updated_at.
NOTE:list_issues labels=performance returns full bodies(big) but jq-able; #588+#540+#496+#446+#417 are the only perf-labeled issues.
