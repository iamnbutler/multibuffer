m:#310#339#565#575 mo:June2026(#588) main:ce545ec
last:2026-06-20 r:27878925391 T4+T5+T7
bun:works via curl install in runner
bl:GA/IH(#377)/undo(#435); rope.slice done#565; PT(#540) done#575
hold:reinstated(maint-only); lifted twice for #565,#575
0620:maint run. All4 perf-PRs mergeable_state:clean (API: #310 base51f94a3,#339 base7e50d57,#565/#575 ce545ec; all draft,no CI fail,no conflicts). Since 0619 only docs PRs: #610/#611/#612 open; #609 closed unmerged. Main unchanged ce545ec. No perf PRs merged/closed; no perf issues closed. SA-list unchanged (spot-checked #345/#363/#331/#337 all open). #588 had 0 comments=no maint instructions/checkbox changes. Perf issues #417/#446/#496/#540 all 1 comment (own), untouched since Apr/May - no Task5 comment (anti-spam). Updated #588:prepended 0620 entry,folded 0615 into Earlier-June block(now 06-01..06-15).
NOTE:many SA-list items are [Repo Assist] PRs accreted historically-still open, carried fwd.
NOTE:push_repo_memory reports phantom ~31KB regardless of content=likely counting .git/; ignore, auto-push handles actual files.
NOTE:single-PR state fastest via curl https://api.github.com/repos/.../pulls/N (unauth works for public read). Same for issues/N (comments count field).
NOTE:closed-since check: curl .../pulls?state=closed&sort=updated&direction=desc + filter updated_at>=lastrun; same for issues (skip pull_request key).
NOTE:perf-labeled issues are #588+#540+#496+#446+#417 only.
NOTE:main HEAD via curl branches/main (commits/main sometimes returns non-JSON).
NOTE:>100 open PRs so pulls?state=open page1 doesn't show #310/#339; query them directly.
