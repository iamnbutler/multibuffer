# TI Memory 2026-04-13
cmds:bun test/typecheck/lint/fuzz/test:e2e;bun via bun.sh/install;no CI coverage
fw:bun:test;helpers.ts+property-helpers.ts;num() unwraps brands
TIPRs(clean):#312 #335 #357 #368;#373 unstable(maintainer)
blocked:#400 anchor bias;singleton unimplemented;edit-proxy cross-excerpt unimplemented
webgpu.ts:41KB no tests-expected gap(WebGPU API mocking non-trivial)
adapter.ts:147L no test-logic covered by tree.test.ts;createFsAdapter/getDefaultFsAdapter trivial
rr:last=2026-04-13/24339579019 t=3,4,5,7;next=1,2,6,7
state:main=ce545ec;#409 updated 2026-04-13;suite=2265 tests;30+RA PRs open none merged
