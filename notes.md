m:#310#339#565#575 mo:June2026(#588) main:ce545ec
last:2026-06-17 r:27709394534 T4+T7
bun:works via curl install in runner
bl:GA/IH(#377)/undo(#435); rope.slice done#565; PT(#540) done#575
hold:reinstated(maint-only); lifted twice for #565,#575
0617:maint run. All4 perf-PRs mergeable_state:clean (API: #310 base51f94a3,#339 base7e50d57,#565/#575 ce545ec; all draft,no CI fail,no conflicts). Since 0616 only docs/repo-assist PRs: #607 new,#604+#603 closed. Main unchanged ce545ec. No perf PRs merged/closed. Audited full SA-list: every referenced PR confirmed open (open-PR API snapshot 376-607 + spot-checked sub-376: #310#339#345#363#331#337 all open). SA-list unchanged. #588 had 0 comments=no maint instructions/checkbox changes. Updated #588:prepended 0617 entry,folded 0612 into Earlier-June block(now 0601-0612).
NOTE:many SA-list items are [Repo Assist] PRs accreted historically-still open, carried fwd.
NOTE:push_repo_memory reports phantom ~31KB regardless of content=likely counting .git/; ignore, auto-push handles actual files.
NOTE:single-PR state fastest via curl https://api.github.com/repos/.../pulls/N (unauth works for public read). Same for issues/N (comments count field).
NOTE:list_issues/list_pull_requests MCP results overflow token limit; prefer curl+python3 parse. open-PR list: curl .../pulls?state=open&per_page=100 caps at 100 (recent-first); sub-376 PRs need individual checks.
NOTE:perf-labeled issues are #588+#540+#496+#446+#417 only.
