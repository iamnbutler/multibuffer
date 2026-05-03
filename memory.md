# TI 2026-05-03
cmds:bun test/typecheck/lint/fuzz/test:e2e;bun via bun.sh/install;no CI coverage
fw:bun:test;helpers+property-helpers;num() unwraps brands
TIPRs:#312 #335 #357 #368 clean;#373 unstable(maintainer PR)
blocked:#400 bias;singleton;edit-proxy;webgpu-expected
rr:last=2026-05-03/25276838179 t=3,4,5,7;next=1,2,6,7
state:main=ce545ec;#528 May issue;2274 tests(2265pass,3skip,6todo)
cov:79.76%fn/78.89%ln;gaps:canvas/webgpu/react/glyph-atlas(browser);wrapLineCount=dead code
WARN:Task6 must NOT touch package.json(protected file;#531 failure 2026-05-02)
