# TI Memory 2026-04-20
cmds:bun test/typecheck/lint/fuzz/test:e2e;bun via bun.sh/install;no CI coverage
fw:bun:test;helpers.ts+property-helpers.ts;num() unwraps brands
TIPRs(clean):#312 #335 #357 #368;#373 unstable(maintainer)
blocked:#400 anchor bias;singleton unimpl;edit-proxy cross-excerpt unimpl;webgpu-expected
rr:last=2026-04-20/24662670055 t=1,2,6,7;next=3,4,5,7
state:main=ce545ec;#409 updated;suite=2271(PR#481 branch CI)
new:#481 cursorChange/selectionChange tests(6,clean)
