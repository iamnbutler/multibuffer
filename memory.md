mine:#310#339#565#575(all clean/draft/no-conflict 0808) mo:Aug#670 main:ce545ec last:2026-08-08 run:31270138022 hold-reinstated(maint-only) bun-via-curl
SA-list:61 verified 0804(paged 501 PRs); 0808: 0 ticked, nothing on list closed. **Top item now #510.**
issues-filed:#664(0731)#672(0802)#673(0802)#682(0804)#688(0805)
**DIVISION OF LABOUR: I identify+measure+VERIFY, RepoAssist writes PRs (#672->#685, #682->#684). Keep filing issues + verifying its PRs, NOT writing PRs.**
**0808: found keystroke path is O(doc) via byteLength() on every edit; ALREADY fixed by open PR#510 - verified it (50x@16K, main misses <1ms target) and commented instead of filing a dup. See notes.md.**
bl:GA/IH(#377)/undo(#435)/bench-fixture/flaky(#673->PR#611 just merge)/addExcerpt(#688,dormant)
REJECTED-do-not-reinvestigate: undo-shift(0802,0.083us); diff/patch.ts(0804,healthy); renderer dom.ts:533(0807,2% frame budget); **multicursor-quadratic(0808: it is LINEAR ~150us/cursor, NO defect - only AMPLIFIES per-edit cost by N)**
cmds:bun1.3.14 typecheck0 lint0(1 info) bench118/118(120 w/#510) test2265/0 ; bun test FLAKY buffer.test.ts:444 = 10/36(28%)
commented:#492(0730)#668(0801)#672(0803)#510(0808) - NO human comments EVER, all other actors are bots => T5 is a repeat no-op
