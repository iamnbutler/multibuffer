m:#310#339#565#575 mo:June2026(#588) main:ce545ec
last:2026-06-18 r:27779784388 T4+T7
bun:works via curl install in runner
bl:GA/IH(#377)/undo(#435); rope.slice done#565; PT(#540) done#575
hold:reinstated(maint-only); lifted twice for #565,#575
0618:maint run. All4 perf-PRs mergeable_state:clean (API: #310 base51f94a3,#339 base7e50d57,#565/#575 ce545ec; all draft,no CI fail,no conflicts). Since 0617 only docs PRs: #609 new; #606,#604 closed (Doc Unbloat). Main unchanged ce545ec. No perf PRs merged/closed. Closed-PR/issue API check since 0617 confirmed only docs #606/#604 closed=no SA-list item closed. SA-list unchanged. #588 had 0 comments=no maint instructions/checkbox changes. Updated #588:prepended 0618 entry,stripped dup footers.
NOTE:many SA-list items are [Repo Assist] PRs accreted historically-still open, carried fwd.
NOTE:push_repo_memory reports phantom ~31KB regardless of content=likely counting .git/; ignore, auto-push handles actual files.
NOTE:single-PR state fastest via curl https://api.github.com/repos/.../pulls/N (unauth works for public read). Same for issues/N (comments count field).
NOTE:closed-since check: curl .../pulls?state=closed&sort=updated&direction=desc + filter updated_at>=lastrun; same for issues (skip pull_request key).
NOTE:perf-labeled issues are #588+#540+#496+#446+#417 only.
