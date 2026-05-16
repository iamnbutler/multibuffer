m:#310#339+RopeSlice mo:#530 main:ce545ec
last:2026-05-16 r:25968404461 T1+T3+T4+T6+T7
bun:works via curl install in runner (was thought unavail)
bl:GA/IH(#377)/undo/PT(#540); rope.slice resolved
0512:new#559(biome)#560(DocUnb) close#553#557(DocUnb)
0513:new#561(DocUnb) #310#339 clean
0514:no-new-PRs close#560(DocUnb) #562(DocUnb-wf-fail)
0515:new#563(DocUnb) clean
0516:new RopeSlice PR (perf-assist/rope-slice-binsearch); rope.slice O(n_chunks)->O(log n_chunks)+fastpath; 13x late 1-char(0.93us->0.07us), 7.7x mid, 3.8x 1KB on 10K-line rope; hold-lifted-once for this small algorithmic fix
push_memory:30KB(git)>12KB - persistent infra issue
