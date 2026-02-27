# Multibuffer

A multibuffer text editor component in TypeScript. Inspired by [Zed](https://zed.dev)'s multibuffer — presents multiple file excerpts as a single scrollable, editable document.

**Status**: Active development. Core data model complete, editing functional, DOM renderer working. Not production-ready.

## What it does

A multibuffer composites excerpts from multiple source files into one unified view. Each excerpt is a range of lines from a buffer. The editor supports cursor movement, text insertion/deletion, selection (keyboard and mouse), and syntax highlighting via tree-sitter.

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
  multibuffer/              Data model (rendering-agnostic)
    rope.ts                   Chunked text with prefix sums (O(log n) edits)
    buffer.ts                 Single file's text, backed by Rope
    excerpt.ts                Range within a buffer
    multibuffer.ts            Collection of excerpts, edit proxy, anchor system
    anchor.ts                 Stable positions that survive edits
    slot_map.ts               Generational arena for excerpt IDs
    types.ts                  Branded types (BufferRow, MultiBufferRow, etc.)

  editor/                   Command dispatcher
    editor.ts                 State machine: commands → cursor/selection/buffer updates
    cursor.ts                 Pure cursor movement functions
    selection.ts              Selection creation, extension, collapse
    input-handler.ts          Hidden textarea for keyboard input + key→command mapping
    types.ts                  EditorCommand union type, Direction, Granularity

  multibuffer_renderer/     DOM renderer
    dom.ts                    Line pooling, viewport rendering, cursor/selection display
    wrap-map.ts               Soft wrap via prefix sum (buffer row ↔ visual row)
    highlighter.ts            Tree-sitter WASM syntax highlighting
    theme.ts                  Gruvbox dark color mapping
    measurement.ts            Fixed-height line calculations, viewport creation
    types.ts                  Renderer interface, Viewport, Measurements
```

## Key design decisions

- **Branded types** — `BufferRow`, `MultiBufferRow`, `BufferOffset` etc. prevent mixing coordinate systems at compile time
- **Rope storage** — Chunked text with prefix sums for O(log n) line↔offset conversion
- **Edit log on Buffer** — Anchors track positions across edits by replaying the edit log with bias semantics
- **Snapshot pattern** — Immutable snapshots for concurrent reads; Rope is structurally shared
- **Fixed-height lines** — O(1) position calculations, no layout reflow
- **Rendering-agnostic core** — Data model has zero DOM dependencies

## Development

```bash
bun test              # 386 tests (~70ms)
bun test --watch      # Watch mode
bun run bench         # Benchmarks (23 cases)
bun run typecheck     # tsc --noEmit
bun run lint          # Biome + GritQL (no `any`, no `as`, no `unknown`)
```

## Demo

```bash
bun run dev           # http://localhost:3000
```

Live editor with syntax highlighting, cursor, selection, and keyboard editing. Loads source files from `src/multibuffer/` as excerpts.

### Debug API

The demo exposes a WebSocket debug API for interacting with the editor from the CLI:

```bash
bun run demo/debug-client.ts getState              # cursor position, selection, line count
bun run demo/debug-client.ts getText                # full buffer text
bun run demo/debug-client.ts press "ArrowRight"     # simulate keypress
bun run demo/debug-client.ts press "Meta+ArrowLeft" # Cmd+Left (line start)
bun run demo/debug-client.ts press "Alt+ArrowRight" # Opt+Right (word right)
bun run demo/debug-client.ts type "hello"           # simulate typing
bun run demo/debug-client.ts click 5 10             # set cursor to row 5, col 10
```

Also available as `window.__editor` in the browser console.

## Task tracking

Using [spool](https://github.com/iamnbutler/spool) for task management. Data is in `.spool/`.

```bash
spool list                    # Open tasks
spool stream list             # All streams with task counts
spool list --stream <id>      # Tasks in a stream
```

## What works

- Multibuffer with multiple excerpts from multiple buffers
- Cursor movement: character, word, line, page, buffer granularity
- Selection: keyboard extend, click-drag, double-click word, triple-click line
- Text editing: insert, delete (char/word/line), newline, tab
- Delete line (Cmd+Shift+K)
- Anchors that survive edits (edit log replay with bias)
- Rope-backed buffers with O(log n) edits
- DOM renderer with line pooling and viewport-based rendering
- Soft wrap via WrapMap
- Tree-sitter syntax highlighting (TypeScript)
- WebSocket debug API for CLI interaction
- macOS keybindings (Cmd=line/buffer, Opt=word)

## What's next

Open tasks by priority:

- **p0**: Cursor clipping past end of line
- **p1**: Auto-scroll to follow cursor, paste support, re-parse after edit for highlighting, browser integration tests
- **p2**: Undo/redo, clipboard operations, cursor blink, decoration mapping
