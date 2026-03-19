# Multibuffer

A lightweight, high-performance text editor component for TypeScript/Bun.

## Setup

This project uses **Bun** as its runtime and package manager. If you need to install it manually:

```bash
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"
bun install --frozen-lockfile
```

## Architecture

```
src/
  buffer/              # Single-file text storage (no multibuffer deps)
    rope.ts            # Rope data structure
    buffer.ts          # Mutable buffer backed by rope
    offset.ts          # Pure offset adjustment through edits
    types.ts           # BufferId, BufferRow, BufferOffset, Bias, etc.

  multibuffer/         # Multi-excerpt view over buffers
    excerpt.ts         # Range within a buffer
    multibuffer.ts     # Collection of excerpts
    anchor.ts          # Stable positions that survive edits
    slot_map.ts        # Generational arena for excerpt IDs
    types.ts           # ExcerptId, Anchor, Selection, MultiBuffer, etc.

  editor/              # Editor state machine + input handling
    editor.ts          # Core editor logic
    editor-view.ts     # High-level facade (Editor + Renderer + Input)
    cursor.ts          # Cursor movement
    selection.ts       # Selection operations
    input-handler.ts   # Keyboard/IME input
    factories.ts       # createSingleBufferEditor, createMultiBufferEditor

  renderer/            # Rendering abstraction (DOM, Canvas, WebGPU)
    dom.ts             # DOM renderer implementation
    measurement.ts     # Line height, character width (fixed)
    highlighter.ts     # Syntax highlighting
    wrap-map.ts        # Soft line wrapping
    theme.ts           # Color themes
```

Other directories: `demo/`, `tests/` (~590 tests), `benchmarks/`.

### Subpath exports

```ts
import { createBuffer } from "multibuffer/buffer";
import { createMultiBuffer } from "multibuffer/multibuffer";
import { Editor } from "multibuffer/editor";
import { createDomRenderer } from "multibuffer/renderer";
import { everything } from "multibuffer"; // kitchen sink
```

## Key Constraints

- **Fixed-height lines** - All lines have identical height for O(1) position calculations
- **Vanilla TypeScript** - No framework dependencies in core
- **Rendering-agnostic** - DOM/Canvas/WebGPU decision deferred to renderer implementations
- **Instance-friendly** - Minimal per-instance memory footprint

## Performance Targets

- Keypress to model update: <1ms
- Viewport calculation: <1ms
- Support 100+ excerpts in single multibuffer

Always measure before/after when proposing performance changes.

## Development

```bash
bun test              # Run all tests (must pass before creating PRs)
bun test --watch      # Watch mode
bun run bench         # Run benchmarks
bun run typecheck     # TypeScript type checking (must pass)
bun run lint          # Biome + GritQL lint (must pass)
bun run build:demo    # Build demo (generates sources.gen.ts)
```

## Code Style

- **No `any`, `unknown`, or `as` type assertions** — banned by Biome. When unavoidable, add a `biome-ignore` comment with an `expect:` explanation (similar to Rust's `// SAFETY:` convention):
  ```ts
  // biome-ignore lint/suspicious/noExplicitAny: expect: Bun.gc() has no type declaration
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction requires cast
  ```
- **No new dependencies** without discussion in an issue first.
- Match existing formatting, naming conventions, and PR scope (one concern per PR).

## Approach

Types → Tests → Benchmarks → Implementation (TDD)

Write tests and benchmarks BEFORE implementation code.
