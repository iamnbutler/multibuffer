m:#310#339#565#575 mo:June2026(#588) main:ce545ec
last:2026-06-16 r:27639817082 T4+T7
bun:works via curl install in runner
bl:GA/IH(#377)/undo(#435); rope.slice done#565; PT(#540) done#575
hold:reinstated(maint-only); lifted twice for #565,#575
0616:maint run. All4 perf-PRs mergeable_state:clean (API: #310 base51f94a3,#339 base7e50d57,#565/#575 ce545ec; all draft,no CI fail,no conflicts). Since 0615 only docs PRs: #606 new,#603 closed (both Doc Unbloat). Main unchanged ce545ec. No perf PRs merged/closed;SA-list unchanged. Perf issues #417/#446/#496/#540 each still 1 bot comment only,untouched since Apr/May. #588 had 0 comments=no maint instructions/checkbox changes. Updated #588:prepended 0616 entry,folded 0611 into Earlier-June block(now 0601-0611).
NOTE:many SA-list items are [Repo Assist] PRs accreted historically-still open, carried fwd.
NOTE:push_repo_memory reports phantom ~31KB regardless of content=likely counting .git/; ignore, auto-push handles actual files.
NOTE:single-PR state fastest via curl https://api.github.com/repos/.../pulls/N (unauth works for public read). Same for issues/N (comments count field).
NOTE:list_issues/list_pull_requests MCP results overflow token limit; prefer curl+python3 parse.
NOTE:perf-labeled issues are #588+#540+#496+#446+#417 only.
