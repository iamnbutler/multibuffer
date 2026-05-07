# TI 2026-05-07
cmd:bun test/typecheck/lint
fw:bun:test;helpers
TIPRs:#312#335#357#368#538#541#543+new memfs clean;#373 unstable
blocked:bias;singleton;edit-proxy;webgpu
rr:last=t3,4,5,7;next=t1,2,6,7
state:main=ce545ec;#528 May;2278 tests
infra:#538 pending(7 getText);#543 pending(+5 setup files)
factory:createSingleBufferEditor src/editor/factories.ts
backlog:adapter.ts createFsAdapter+getDefaultFsAdapter still untested(low pri)
