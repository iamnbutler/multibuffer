m:#310#339#565#575 mo:June2026(#588) main:ce545ec
last:2026-06-21 r:27912459445 T4+T5+T7
bun:works via curl install in runner
bl:GA/IH(#377)/undo(#435); rope.slice done#565; PT(#540) done#575
hold:reinstated(maint-only); lifted twice for #565,#575
0621:maint run. All4 perf-PRs mergeable_state:clean (API: #310 base51f94a3,#339 base7e50d57 older-but-mergeable; #565/#575 ce545ec; all draft,no CI fail,no conflicts). Since 0620 only docs: #613 new; #610/#609 closed unmerged; #612/#611 still open. Main unchanged ce545ec. No perf PRs merged/closed; no perf issues closed. SA-list unchanged. #588 0 comments=no maint instructions/checkbox changes. Perf issues #417/#446/#496/#540 all 1 comment(own),untouched Apr/May - no Task5 comment(anti-spam). Updated #588:prepended 0621 entry,folded 0616 into Earlier-June(now 06-01..06-16).
WATCH:when bumping run-id in #588 footer, do targeted replace - a global s/oldrun/newrun/ corrupts prior run-history entry links (hit 0620 once,fixed).
NOTE:many SA-list items are [Repo Assist] PRs accreted historically-still open, carried fwd.
NOTE:push_repo_memory reports phantom ~31KB regardless of content=likely counting .git/; ignore, auto-push handles actual files.
NOTE:single-PR state fastest via curl https://api.github.com/repos/.../pulls/N (unauth works for public read). issues/N has comments count field.
NOTE:closed-since check: curl .../pulls?state=all&sort=updated&direction=desc&per_page=15 + filter updated_at>=lastrun.
NOTE:perf-labeled issues are #588+#540+#496+#446+#417 only.
NOTE:main HEAD via curl commits/main (returns JSON sha) or branches/main.
NOTE:>100 open PRs so pulls?state=open page1 doesn't show #310/#339; query them directly.
