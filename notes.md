m:#310#339#565#575 mo:#530 main:ce545ec
last:2026-05-31 r:26719602148 T2+T4+T5+T7
bun:works via curl install in runner
bl:GA/IH(#377)/undo(#435); rope.slice via #565; PT(#540) via #575
0516:new#565 RopeSlice 13x; 0523:new#575 shouldTraverseDir 1.21-1.83x
hold:reinstated(maint-only); lifted twice for #565,#575
0531:state still frozen ~2mo. All4 perf-PRs reconfirmed mergeable_state:clean via direct API (#310 base51f94a3,#339 base7e50d57,#565/#575 base ce545ec). New since 0530=docs#584 only. Closed since=#581,#582(docs,not in SA-list)->no pruning. 59 SA items still all open. No new human comments on perf issues. No new PR/comment(hold+restraint).
0529/0530:condensed RunHistory; 0531:folded 0524/0525 into Earlier rollup to bound size
push_memory:30KB(git)>12KB - persistent infra issue
