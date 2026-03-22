# Multibuffer

A monorepo of connected TypeScript modules for building text editors. Inspired by [Zed](https://zed.dev)'s multibuffer architecture.

## Modules

```
src/
  buffer/         Single-file text storage (rope-backed)
  multibuffer/    Multi-excerpt view over buffers, anchors, selections
  editor/         Editor state machine, cursor, selection, input handling
  renderer/       DOM, Canvas, and WebGPU renderers, syntax highlighting, soft wrap
  diff/           Diff computation, unified/multi-file diff views
  react/          React bindings (EditorView, DiffView hooks)
  worker/         Web Worker clients for highlighting and diffing
  project/        Project tree, file discovery, glob matching
```

### Subpath exports

```ts
import { createBuffer } from "multibuffer/buffer";
import { createMultiBuffer } from "multibuffer/multibuffer";
import { Editor } from "multibuffer/editor";
import { createDomRenderer } from "multibuffer/renderer";
import { createDiffView } from "multibuffer/diff";
import { EditorView } from "multibuffer/react";
```

## Development

Requires [Bun](https://bun.sh).

```bash
bun install
bun test
bun run bench
bun run typecheck
bun run lint
bun run dev             # Playground at localhost:3000
```
