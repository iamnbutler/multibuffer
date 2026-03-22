# Multibuffer

A multibuffer text editor component in TypeScript. Inspired by [Zed](https://zed.dev)'s multibuffer — presents multiple file excerpts as a single scrollable, editable document.

```
┌──────────────────────────────┐
│ src/buffer.ts  L1–20         │  ← excerpt header
│ 1  import { Rope } from ...  │
│ 2  export function create... │
│ ...                          │
│ src/excerpt.ts  L1–20        │  ← next excerpt
│ 1  import type { Buffer...   │
│ ...                          │
└──────────────────────────────┘
```

## Architecture

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

## Design

- **Branded types** — `BufferRow`, `MultiBufferRow`, `BufferOffset` prevent mixing coordinate systems at compile time
- **Rope storage** — Chunked text with prefix sums for O(log n) line/offset conversion
- **Anchors** — Stable positions that survive edits via edit log replay with bias semantics
- **Fixed-height lines** — O(1) position calculations, no layout reflow
- **Rendering-agnostic core** — Data model has zero DOM dependencies

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
