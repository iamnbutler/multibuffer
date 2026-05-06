# TI 2026-05-06
cmd:bun test/typecheck/lint
fw:bun:test;helpers
TIPRs:#312#335#357#368#538#541+new clean;#373 unstable
blocked:bias;singleton;edit-proxy;webgpu
rr:last=t1,2,6,7;next=t3,4,5,7
state:main=ce545ec;#528 May;2274 tests
infra:#538 pending(7 getText);+5 setup files use factory
factory:createSingleBufferEditor src/editor/factories.ts
