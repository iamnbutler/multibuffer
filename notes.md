m:#310#339#565#575 mo:June2026(#588) main:ce545ec
last:2026-06-15 r:27568441271 T4+T7
bun:works via curl install in runner
bl:GA/IH(#377)/undo(#435); rope.slice done#565; PT(#540) done#575
hold:reinstated(maint-only); lifted twice for #565,#575
0615:maint run. All4 perf-PRs mergeable_state:clean (API verified via curl api.github.com: #310 base51f94a3,#339 base7e50d57,#565/#575 ce545ec; all draft,no CI fail,no conflicts). Since 0614 only new PR=docs#604(condense diff-editor spec,Doc Unbloat);#602 closed. Main unchanged ce545ec. No perf PRs merged/closed;SA-list unchanged(59). Re-verified older SA PRs #310/#314/#331/#337/#345/#363 all still open. #588 had 0 comments=no maint instructions/checkbox changes. Updated #588: prepended 0615 entry,condensed 0610 into Earlier-June block(now 0601-0610),removed duplicate footer line that had accreted in body.
NOTE:many SA-list items(#331/#360/#366 etc) are [Repo Assist] PRs accreted historically-still open, carried fwd.
NOTE:push_repo_memory reports phantom 31KB regardless of content=likely counting .git/(172K); ignore, auto-push handles actual files.
NOTE:list_pull_requests/search_issues results overflow token limit; payload saved to file-use python/jq to extract number/title/state/draft/base. Single-PR state fastest via curl https://api.github.com/repos/.../pulls/N (unauth works for public read).
NOTE:list_issues labels=performance returns full bodies(big) but jq-able; #588+#540+#496+#446+#417 are the only perf-labeled issues.
