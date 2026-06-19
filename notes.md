m:#310#339#565#575 mo:June2026(#588) main:ce545ec
last:2026-06-19 r:27840681041 T4+T7
bun:works via curl install in runner
bl:GA/IH(#377)/undo(#435); rope.slice done#565; PT(#540) done#575
hold:reinstated(maint-only); lifted twice for #565,#575
0619:maint run. All4 perf-PRs mergeable_state:clean (API: #310 base51f94a3,#339 base7e50d57,#565/#575 ce545ec; all draft,no CI fail,no conflicts). Since 0618 only docs PRs: #610 new; #607 closed unmerged (both Doc Unbloat). Main unchanged ce545ec. No perf PRs merged/closed; no perf issues closed. SA-list unchanged. #588 had 0 comments=no maint instructions/checkbox changes. Updated #588:prepended 0619 entry,condensed 0614/0613 into Earlier-June block.
NOTE:many SA-list items are [Repo Assist] PRs accreted historically-still open, carried fwd.
NOTE:push_repo_memory reports phantom ~31KB regardless of content=likely counting .git/; ignore, auto-push handles actual files.
NOTE:single-PR state fastest via curl https://api.github.com/repos/.../pulls/N (unauth works for public read). Same for issues/N (comments count field).
NOTE:closed-since check: curl .../pulls?state=closed&sort=updated&direction=desc + filter updated_at>=lastrun; same for issues (skip pull_request key).
NOTE:perf-labeled issues are #588+#540+#496+#446+#417 only.
NOTE:main HEAD via curl branches/main (commits/main sometimes returns non-JSON).
