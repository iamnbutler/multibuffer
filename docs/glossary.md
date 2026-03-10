# Multibuffer Glossary

A reference for project-specific terms and concepts used throughout the codebase.

---

## A

### Anchor

A stable position within a buffer or multibuffer that survives text edits. Anchors track a byte offset and a [bias](#bias), and are updated by replaying the buffer's edit log when the buffer changes. Used to represent cursor positions and selection endpoints durably.

See: `src/multibuffer/anchor.ts`, `src/multibuffer/types.ts`

### AnchorRange

A range defined by two [anchors](#anchor) (start and end). Because both endpoints are anchors, the range remains valid after edits that shift surrounding text.

### Anchor Resolution

The process of converting an anchor to a current [MultiBufferPoint](#multibufferpoint). Resolution replays edits from the anchor's recorded version to the current version to find the adjusted offset, then converts that offset to a row/column position.

### Auto-Indent

A behavior of the `insertNewline` command: when the cursor is on an indented line, the new line automatically receives the same leading whitespace as the current line. The indentation is detected by matching the leading spaces of the current line and prepending them to the `\n` being inserted. Lines with no leading spaces produce an unindented new line.

---

## B

### Bias

A hint that determines how an anchor or clip operation behaves at a position boundary — for example, when text is inserted exactly at the anchor's offset.

- `Bias.Left` — the anchor stays to the left of inserted text (i.e., the cursor does not advance).
- `Bias.Right` — the anchor moves to the right of inserted text (i.e., the cursor advances past the insertion).

Bias is also used when clipping a point to valid bounds: `Bias.Right` clips to the position at or after a boundary; `Bias.Left` clips to the position before it.

### Buffer

A mutable object representing a single file's text content, backed by a [rope](#rope). Buffers support `insert`, `delete`, and `replace` operations and maintain a monotonically increasing `version` counter. Each edit is recorded in an edit log for [anchor](#anchor) resolution.

### BufferAnchor

An anchor scoped to a single buffer. Stores the byte offset and bias at creation time plus the buffer `version`, allowing it to be adjusted forward to the current version via `editsSince`.

### BufferOffset

A branded number type representing a byte offset within a single buffer. Distinct from [MultiBufferOffset](#multibufferoffset) to prevent mixing coordinate systems at compile time.

### BufferPoint

A `{ row: BufferRow, column: number }` position within a single buffer. Row and column are zero-based.

### BufferRow

A branded zero-based line number within a single buffer. Distinct from [MultiBufferRow](#multibufferrow).

### BufferSnapshot

An immutable snapshot of a buffer's state at a point in time. Snapshots support read-only operations (`line`, `lines`, `text`, `pointToOffset`, `offsetToPoint`, `clipPoint`) and remain valid even after the underlying buffer is mutated.

---

## C

### Clipping

The operation of clamping an out-of-bounds point or offset to the nearest valid position within a buffer or multibuffer. Clipping respects [bias](#bias): `Bias.Right` keeps the position at the end of a line rather than beyond it; `Bias.Left` keeps it before the boundary.

### Coordinate Systems

The project uses two distinct coordinate spaces:

- **Buffer coordinates** — row/column or byte offset within a single source file (`BufferRow`, `BufferOffset`, `BufferPoint`).
- **Multibuffer coordinates** — row/column or byte offset within the unified scrollable view across all excerpts (`MultiBufferRow`, `MultiBufferOffset`, `MultiBufferPoint`).

Branded types enforce that these are never accidentally mixed.

---

## D

### dedentLines

An [EditorCommand](#editorcommand) that removes up to 2 leading spaces from the cursor line, or from every line touched by the current selection. All affected lines are updated in a single `_edit()` call so the operation is undone atomically. If no affected line has leading spaces the command is a no-op. Triggered by `Shift+Tab` or `Mod+[`.

See also: [indentLines](#indentlines)

### Decoration

A visual annotation applied to a range of text in the renderer. Decorations carry an optional CSS class name and style properties (background color, font weight, etc.) and are rendered on top of the text.

---

## E

### Edit Log

A per-buffer list of [EditEntry](#editentry) values recording every insert and delete since the buffer was created. The edit log is the source of truth for [anchor](#anchor) resolution: given an anchor's recorded version, the anchor can be advanced to the current version by replaying only the edits that occurred after it.

### EditEntry

A single recorded buffer mutation: `{ offset, deletedLength, insertedLength }`. All values are in pre-edit buffer coordinates.

### Editor

The command-dispatcher layer (`src/editor/`) that sits above the multibuffer data model. The editor is a state machine: each [EditorCommand](#editorcommand) produces a new `EditorState` from the old one without mutation.

### EditorCommand

A discriminated union type representing a user action the editor can execute. Examples: `insertText`, `moveCursor`, `extendSelection`, `deleteLine`, `indentLines`, `dedentLines`, `undo`.

### Excerpt

A contiguous range of lines from a single [buffer](#buffer), displayed within the [multibuffer](#multibuffer). Each excerpt has a context range (all lines shown) and a primary range (the highlighted portion). Excerpts are identified by an [ExcerptId](#excerptid).

### ExcerptBoundary

The dividing row between two adjacent excerpts. Used by the renderer to know where to draw file headers. Carries references to the previous and next [ExcerptInfo](#excerptinfo).

### ExcerptHeader

Renderer-level metadata for drawing a file header at an excerpt boundary: file path, line-range label, and the row at which to display it.

### ExcerptId

A branded [SlotKey](#slotkey) that uniquely identifies an excerpt. Generational: if an excerpt is removed and its slot reused, old `ExcerptId` values pointing to that slot are automatically invalid.

### ExcerptInfo

The public view of an excerpt, exposed to consumers. Contains the excerpt's `id`, `bufferId`, `range`, and its `startRow`/`endRow` in multibuffer coordinates.

### ExcerptRange

The specification for creating an excerpt. Contains:
- `context` — the full `BufferRange` to display (including any surrounding context lines).
- `primary` — the highlighted sub-range within `context`.

---

## G

### Generational Arena

The data structure underlying [SlotMap](#slotmap). Each slot carries a generation counter. When a slot is freed and reused for a new value, the generation increments, making any existing keys to that slot immediately stale. Provides O(1) stale-key detection without bookkeeping at the call site.

### Granularity

The unit of movement or deletion for an editor command: `character`, `word`, `line`, `page`, or `buffer`.

### Gutter

The left-hand area of the editor display reserved for line numbers and other margin decorations. Its width is captured in `Measurements.gutterWidth`.

---

## H

### Hit Test

Converting pixel coordinates `(x, y)` from a mouse event into a `{ row, column }` multibuffer position. Implemented by the renderer using fixed-height line measurements.

---

## I

### indentLines

An [EditorCommand](#editorcommand) that prepends 2 spaces to the cursor line, or to every line touched by the current selection. All affected lines are updated in a single `_edit()` call so the operation is undone atomically. When `insertTab` is dispatched while a non-collapsed selection exists, it is treated as `indentLines`. Triggered by `Tab` (with a selection) or `Mod+]`.

See also: [dedentLines](#dedentlines)

---

## L

### Line Pooling

A DOM-renderer optimization that reuses existing line elements when scrolling, rather than creating and destroying DOM nodes for every visible row. Only the visible viewport's worth of nodes is kept alive.

---

## M

### Measurements

Fixed rendering constants: `lineHeight`, `charWidth`, `gutterWidth`, and optional `wrapWidth`. All lines have the same height, enabling O(1) pixel↔row conversion.

### MultiBuffer

A collection of [excerpts](#excerpt) from one or more buffers, presented as a single unified scrollable document. Supports adding, removing, and expanding excerpts, editing text in multibuffer coordinates, and creating [anchors](#anchor).

### MultiBufferOffset

A branded byte offset within the multibuffer's unified view. Distinct from [BufferOffset](#bufferoffset).

### MultiBufferPoint

A `{ row: MultiBufferRow, column: number }` position within the multibuffer's unified view.

### MultiBufferRow

A branded zero-based line number within the multibuffer's unified view. Distinct from [BufferRow](#bufferrow).

### MultiBufferSnapshot

An immutable snapshot of the multibuffer's state. Supports read operations (`lines`, `excerptAt`, `toBufferPoint`, `toMultiBufferPoint`, `resolveAnchor`, `resolveAnchors`, `clipPoint`, `excerptBoundaries`) without mutation concerns.

---

## P

### Prefix Sum

An array where entry `i` holds the cumulative total of entries `0..i`. Used by [Rope](#rope) (chunk byte offsets) and [WrapMap](#wrapmap) (visual row offsets) for O(1) forward lookup and O(log n) reverse lookup via binary search.

### Position Translation

The three-layer coordinate conversion:

```
MultiBufferPoint → ExcerptInfo → BufferPoint
```

Given a multibuffer row, binary search finds the containing excerpt; subtracting the excerpt's start row gives the buffer-relative row.

---

## R

### Renderer

An interface (`src/multibuffer_renderer/types.ts`) that rendering backends implement. A renderer `mount`s into a container element, accepts a `RenderState` and lines, and handles `scrollTo` and `hitTest`. The current implementation targets the DOM; the interface allows future Canvas or WebGPU backends.

### Rope

The text storage structure backing each [buffer](#buffer). A Rope splits text into fixed-size chunks (≤ 1024 bytes each, preferring newline boundaries). It is immutable: insert/delete/replace return new Rope instances with structural sharing of unchanged chunks. Caches chunk byte offsets as a prefix-sum array for O(log n) line↔offset conversion.

---

## S

### Selection

An [AnchorRange](#anchorrange) plus a `head` field (`"start"` or `"end"`) indicating which end of the range the cursor occupies. The head determines the direction of the selection and where the cursor is rendered.

### Singleton

An optimization flag (`MultiBuffer.isSingleton`) that is `true` when the multibuffer contains exactly one buffer and one excerpt. When set, position translation can skip binary search and return buffer coordinates directly.

### SlotKey

A `{ index, generation }` pair used to address entries in a [SlotMap](#slotmap). The generation component makes stale keys detectable in O(1).

### SlotMap

A generational arena (`src/multibuffer/slot_map.ts`) providing O(1) insert, remove, and lookup with stale-key detection. Used to store excerpts and assign [ExcerptId](#excerptid) values.

### Snapshot Pattern

Both `Buffer` and `MultiBuffer` expose a `snapshot()` method that returns an immutable view of current state. Snapshots can be held concurrently with ongoing mutations; the snapshot remains valid while reflecting the state at the moment it was taken.

### Soft Wrap

Displaying a single logical line across multiple visual rows when it exceeds the available column width. Managed by [WrapMap](#wrapmap).

---

## T

### TextSummary

Cached aggregate metrics for a span of text: `lines`, `bytes`, `lastLineLength`, and `chars`. Stored per-excerpt to enable O(1) position lookups without scanning the text.

### Trailing Newline (synthetic)

An artificial newline appended after an excerpt's last line to visually separate it from the next excerpt. Tracked by `Excerpt.hasTrailingNewline`. Position calculations must account for this: the excerpt's effective line count is one greater than its buffer range, but the extra line contains no editable content.

---

## V

### Viewport

The currently visible rectangular window into the multibuffer: `startRow`, `endRow`, `scrollTop`, `height`, and `width`. The renderer uses viewport information to decide which lines to render.

---

## W

### WrapMap

A mapping between buffer rows and visual rows when soft wrapping is enabled (`src/multibuffer_renderer/wrap-map.ts`). Stores the number of visual rows each buffer row occupies, with a prefix-sum array for O(1) buffer-row → visual-row conversion and binary search for the reverse direction.
