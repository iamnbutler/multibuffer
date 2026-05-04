# TI 2026-05-04
cmds:bun test/typecheck/lint/fuzz/test:e2e;bun via bun.sh/install
fw:bun:test;helpers+property-helpers;num()=unwrap-brand
TIPRs:#312#335#357#368 clean;#373 unstable;infra-PR=shared-get-text-helpers(2026-05-04,#TBD)
blocked:#400 bias;singleton;edit-proxy;webgpu
rr:last=2026-05-04/25315234038 t=1,2,6,7;next=3,4,5,7
state:main=ce545ec;#528 May issue;2274 tests
cov:79.76%fn/78.89%ln;gaps:canvas/webgpu/react/glyph-atlas
WARN:Task6 no-package.json(#531)
infra:getMultiBufferText+getEditorText added helpers.ts;migrated 3 files;7 remain
