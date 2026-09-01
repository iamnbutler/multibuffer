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

### adjustOffset

A pure function (`src/buffer/offset.ts`) that advances a `BufferOffset` through a chronological sequence of `EditEntry` values, applying `adjustOffsetSingle` for each edit in turn. Offsets before an edit pass through unchanged; offsets past its deleted range shift by `insertedLength − deletedLength`. At the edit start, [Bias](#bias) breaks the tie: `Bias.Right` jumps past the inserted text, while `Bias.Left` — like any offset inside the deleted range — clamps to the edit start.

Used by multibuffer anchor resolution when replaying edits since an anchor's recorded version.

See: `src/buffer/offset.ts`, `src/multibuffer/anchor.ts`

### Auto-Indent

A behavior of the `insertNewline` command: the new line automatically receives the same leading whitespace as the current line.

---

## B

### Bias

A hint controlling behavior at position boundaries — when text is inserted at an anchor's offset or a point is clipped to valid bounds.

- `Bias.Left` — stays left of inserted text; clips to the position before a boundary.
- `Bias.Right` — advances past inserted text; clips to the position at or after a boundary.

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

### Closer

An automated PR triage agent that runs after a review is submitted, labelling each pull request `ready-to-merge` or `needs-review` (defaulting to the latter when uncertain) and closing duplicate, spam, or fundamentally broken PRs. Chains after the [Reviewer](#reviewer); triages on code and review state alone, ignoring draft status.

See: `.github/workflows/closer.md`

### Coordinate Systems

The project uses two distinct coordinate spaces, kept apart by branded types so they can never be accidentally mixed. **Buffer coordinates** (`BufferRow`, `BufferOffset`, `BufferPoint`) address a position within a single source file; **multibuffer coordinates** (`MultiBufferRow`, `MultiBufferOffset`, `MultiBufferPoint`) address one within the unified scrollable view across all excerpts.

---

## D

### dedentLines

An [EditorCommand](#editorcommand) that removes up to 2 leading spaces from the cursor line or every line in the selection, applied atomically (no-op if no line has leading spaces). Triggered by `Shift+Tab` or `Mod+[`.

See also: [indentLines](#indentlines)

### Decoration

A visual annotation applied to a range of text in the renderer. Each decoration specifies a `MultiBufferRange` and optionally a CSS class name and a partial [`DecorationStyle`](#decorationstyle). The DOM renderer builds a per-row lookup during each render pass; when two decorations overlap the same row, the later entry in the array wins.

### DecorationStyle

An interface (`src/renderer/types.ts`) describing the full set of visual properties a [Decoration](#decoration) can apply to a row: `backgroundColor`, `color`, `borderColor`, `fontWeight`, `fontStyle`, `textDecoration`, and gutter-specific fields `gutterBackground`, `gutterColor`, `gutterSign`, and `gutterSignColor`. Decorations accept a `Partial<DecorationStyle>`, so any subset of fields may be specified.

### DiffController

A stateful controller (`src/diff/controller.ts`) that manages a live diff view between two [buffers](#buffer). Created by `createDiffController(oldBuffer, newBuffer, options)`. Maintains a [MultiBuffer](#multibuffer) whose excerpts are rebuilt from the old and new buffers on each diff, along with a set of [decorations](#decoration) for visual styling.

Key methods: `reDiff()` recomputes immediately and returns the new `isEqual` state; `notifyChange()` schedules a debounced re-diff (default 150 ms); `onUpdate(callback)` subscribes to decoration updates and returns an unsubscribe function; `dispose()` cleans up timers and subscriptions.

See also: [DiffResult](#diffresult), [DiffHunk](#diffhunk)

### DiffHunk

A contiguous group of changed and context [DiffLine](#diffline) entries produced by the diff algorithm, analogous to a unified diff hunk (`@@ -a,b +c,d @@`). Carries `oldStart`, `oldCount`, `newStart`, `newCount`, and a `lines` array. Adjacent changes within `2 × context` lines of each other are merged into a single hunk.

See: `src/diff/types.ts`

### DiffKind

The type of change a [DiffLine](#diffline) represents: `"equal"` (unchanged), `"insert"` (added in the new version, so no `oldRow`), or `"delete"` (removed from the old version, so no `newRow`).

### DiffLine

A single line in a diff result, carrying its [DiffKind](#diffkind), `text`, and source row numbers (`oldRow` from the old buffer, `newRow` from the new buffer). Insert lines have `oldRow: undefined`; delete lines have `newRow: undefined`.

See: `src/diff/types.ts`

### DiffResult

The complete output of a diff computation: `{ hunks: DiffHunk[], isEqual: boolean }`. When `isEqual` is `true`, `hunks` is empty and the two texts are identical — no excerpts need to be created for changed content.

See: `src/diff/types.ts`, `src/diff/diff.ts`

---

## E

### Edit Log

A per-buffer list of [EditEntry](#editentry) values recording every insert and delete since buffer creation. Used for [anchor](#anchor) resolution by replaying edits since an anchor's recorded version to find its current position.

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

The specification for creating an excerpt: `context`, the full `BufferRange` to display including surrounding context lines, and `primary`, the highlighted sub-range within it.

---

## G

### Generational Arena

The data structure underlying [SlotMap](#slotmap). Each slot carries a generation counter that increments on reuse, making stale keys detectable in O(1) without call-site bookkeeping.

### Goal Column

A remembered column position stored by the `Editor` for vertical cursor navigation (`moveUp`, `moveDown`). Moving through lines of unequal length targets the goal column rather than the current line's actual column, so the cursor returns to its original column after passing through shorter lines. Cleared by horizontal movement or any edit, and reset at the start of each new vertical movement.

### Granularity

The unit of movement or deletion for an editor command: `character`, `word`, `line`, `page`, or `buffer`.

### Gutter

The left-hand area of the editor display reserved for line numbers and other margin decorations. Its width is captured in `Measurements.gutterWidth`.

### Gutter Sign

A character rendered between the gutter line-number area and the line content on a decorated row. Specified via `DecorationStyle.gutterSign` (e.g., `"+"` or `"−"`) and colored by `gutterSignColor`. Useful for diff-style annotations that indicate added or removed lines.

See also: [Decoration](#decoration), [DecorationStyle](#decorationstyle), [Gutter](#gutter)

---

## H

### Hit Test

Converting pixel coordinates `(x, y)` from a mouse event into a `{ row, column }` multibuffer position. Implemented by the renderer using fixed-height line measurements.

---

## I

### Implementor

An automated agent that picks up issues labeled `agent:implement` and implements them under the project's TDD discipline (Types → Tests → Implementation), opening draft pull requests. Runs twice daily (7 am / 2 pm UTC) or on demand via `/implement`. Decomposes large issues into sub-issues carrying the same label, and prefixes every output with `[Implementor]`.

See: `.github/workflows/implementor.md`

### indentLines

An [EditorCommand](#editorcommand) that prepends 2 spaces to the cursor line or every line in the selection, applied atomically. `insertTab` with a non-collapsed selection is treated as `indentLines`. Triggered by `Tab` (with a selection) or `Mod+]`.

See also: [dedentLines](#dedentlines)

### Incremental Parsing

An optimization in `Highlighter.parseBuffer()` where the previous parse tree is passed to tree-sitter's `parser.parse(text, oldTree)`, letting it reuse unchanged subtrees instead of re-parsing the whole file. Enabled by supplying a [TreeEdit](#treeedit) descriptor so the old tree is updated via `tree.edit()` first; on large files this removes significant per-keystroke overhead.

See: `src/renderer/highlighter.ts`, [TreeEdit](#treeedit)

### InputHandler

A class (`src/editor/input-handler.ts`) that captures keyboard input via a hidden off-screen `<textarea>`, rather than raw `keydown` listeners, so IME composition works for CJK and other complex scripts. Each keyboard event goes through [keyEventToCommand](#keyeventtocommand); if no command matches, the `input` event carries the typed text instead. Exposes `mount(container)`, `unmount()`, `focus()`, and `blur()`.

---

## K

### keyEventToCommand

A function (`src/editor/input-handler.ts`) that translates a raw `KeyboardEvent` into an [EditorCommand](#editorcommand). Handles platform-specific shortcuts such as `Mod+Z` for undo and `Mod+Y` / `Mod+Shift+Z` for redo. Returns `undefined` for events that do not map to a recognized command, allowing the [InputHandler](#inputhandler) to fall through to normal text-input handling via the `input` event.

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

An immutable snapshot of the multibuffer's state, supporting read operations (`lines`, `excerptAt`, `toBufferPoint`, `toMultiBufferPoint`, `resolveAnchor`, `resolveAnchors`, `clipPoint`, `excerptBoundaries`) without mutation concerns. Carries a monotonically increasing `version` counter, shared globally across all `MultiBuffer` instances, that the DOM renderer uses to skip `WrapMap` reconstruction when neither snapshot content nor wrap width has changed since the last render.

### Myers' Algorithm

The O(ND) line-level diff algorithm used in `src/diff/diff.ts`, where N is the sum of line counts in both texts and D is the number of differing lines. It finds the shortest edit script by tracking the furthest-reaching path on each diagonal of an edit graph, storing the trace as active diagonal slices of size `2d+1` at each step `d` — cutting memory from O(max·D) to O(D²), a large win on big files with few changes.

See also: [DiffResult](#diffresult), [DiffHunk](#diffhunk)

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

### Read-Only Mode

A mode in which the `Editor` silently ignores all text-mutating commands. Enabled via `readOnly: true` in the `Editor` constructor or `editor.setReadOnly(true)` at runtime, and readable through the `editor.readOnly` getter. While active, `dispatch()` discards every command classified as an edit (`insertText`, `cut`, `redo`, `deleteLine`, `moveLine`, `duplicateLine`, `indentLines`, `dedentLines`, and others) while still processing cursor movement.

See: `src/editor/editor.ts`

### Renderer

An interface (`src/renderer/types.ts`) that rendering backends implement. A renderer `mount`s into a container element, accepts a `RenderState` and lines, and handles `scrollTo` and `hitTest`. Three backends exist — `dom.ts`, `canvas.ts`, and `webgpu.ts`. `createRenderer({ backend })` selects between `"webgpu"`, `"dom"`, and `"auto"` (the default, which tries WebGPU and falls back to DOM); the canvas backend is constructed directly via `createCanvasRenderer`.

See: `src/renderer/index.ts`

### Reviewer

An automated adversarial code reviewer, triggered on every PR event (opened, synchronize, ready_for_review) and via `/review`. Enforces the project's four priorities in order — accuracy, performance, consistency, public API UX — using `REQUEST_CHANGES` for blocking issues and `COMMENT` otherwise, and hardballs every `biome-ignore` suppression (each must carry concrete justification or be rewritten away). Emits up to 25 inline comments per run, blocking issues first, and at most 1 issue per run for antipatterns recurring across reviews. Read-only: never writes implementation code or pushes to branches.

See: `.github/workflows/reviewer.md`

### Rope

The text storage structure backing each [buffer](#buffer). Splits text into fixed-size chunks (≤ 1024 bytes, preferring newline boundaries); insert/delete/replace return new Rope instances with structural sharing of unchanged chunks. Caches chunk byte offsets as a prefix-sum array for O(log n) line↔offset conversion.

---

## S

### Selection

An [AnchorRange](#anchorrange) plus a `head` field (`"start"` or `"end"`) indicating which end of the range the cursor occupies. The head determines the direction of the selection and where the cursor is rendered.

### selectWordAt

A method on `Editor` that sets the selection to the full word at a given `MultiBufferPoint`, used for double-click word selection. On a word character (`\p{L}`, `\p{N}`, or `_`) the selection expands to the word's boundaries; on whitespace or punctuation it expands to the surrounding non-word run. Unicode-aware — handles CJK and emoji via surrogate-pair stride helpers.

See: `src/editor/editor.ts`

### setExcerpts

A batch method on `MultiBuffer` (`src/multibuffer/multibuffer.ts`) that atomically replaces all current excerpts with a new set. Accepts an array of `{ buffer, range, options }` entries, swaps the excerpts, then calls `_rebuildCache()` exactly once — reducing a full refresh from O(N²) (the `clearExcerpts()` + N×`addExcerpt()` pattern triggers N+1 rebuilds) to O(N).

Used by `DiffController.reDiff()`. Note: it does **not** build an anchor replacement chain, so existing [anchors](#anchor) do not survive the call — matching the prior `clearExcerpts()` + `addExcerpt()` semantics.

See also: [setExcerptsForBuffer](#setexcerptsforbuffer), [DiffController](#diffcontroller)

### setExcerptsForBuffer

A method on `MultiBuffer` that replaces all excerpts belonging to a single buffer with a new set of ranges, leaving other buffers' excerpts untouched. Unlike [`setExcerpts`](#setexcerpts), it preserves [anchor](#anchor) validity: after swapping, it builds a replacement chain mapping each old [ExcerptId](#excerptid) to the first new one, so `resolveAnchor` / `resolveAnchors` can follow the chain to a valid position in the updated excerpt set.

See: `src/multibuffer/multibuffer.ts`, [Anchor Resolution](#anchor-resolution)

### Singleton

An optimization flag (`MultiBuffer.isSingleton`) that is `true` when the multibuffer contains exactly one buffer and one excerpt. When set, position translation can skip binary search and return buffer coordinates directly.

### SlotKey

A `{ index, generation }` pair used to address entries in a [SlotMap](#slotmap).

### SlotMap

A [generational arena](#generational-arena) (`src/multibuffer/slot_map.ts`) providing O(1) insert, remove, and lookup with stale-key detection. Used to store excerpts and assign [ExcerptId](#excerptid) values.

### Snapshot Pattern

Both `Buffer` and `MultiBuffer` expose a `snapshot()` method that returns an immutable view of current state. Snapshots can be held concurrently with ongoing mutations; the snapshot remains valid while reflecting the state at the moment it was taken.

### Soft Wrap

Displaying a single logical line across multiple visual rows when it exceeds the available column width. Managed by [WrapMap](#wrapmap).

### Surrogate Pair Snapping

The behavior of `clipPoint` and `clipOffset` (`src/buffer/buffer.ts`) when a clamped position lands inside a UTF-16 surrogate pair (e.g., emoji or other supplementary Unicode characters outside the Basic Multilingual Plane). A position is inside a surrogate pair when it points at a low surrogate (code unit 0xDC00–0xDFFF); [Bias](#bias) then picks the snap direction, `Bias.Left` stepping back to the high surrogate and `Bias.Right` stepping past the low one — landing before or after the supplementary character respectively. This matches the surrogate-pair-aware cursor movement in `cursor.ts`, which uses `codePointAt`/`prevCpStart` helpers to traverse pairs atomically.

See: `src/buffer/buffer.ts`, [Bias](#bias), [Clipping](#clipping)

---

## T

### TextSummary

Cached aggregate metrics for a span of text: `lines`, `bytes`, `lastLineLength`, and `chars`. Stored per-excerpt to enable O(1) position lookups without scanning the text.

### Trailing Newline (synthetic)

An artificial newline appended after an excerpt's last line to visually separate it from the next excerpt. Tracked by `Excerpt.hasTrailingNewline`. Position calculations must account for this: the excerpt's effective line count is one greater than its buffer range, but the extra line contains no editable content.

### TreeEdit

An interface (`src/renderer/highlighter.ts`) describing a single incremental text edit to supply to tree-sitter. Matches the data fields of web-tree-sitter's `Edit` class: `startIndex` / `oldEndIndex` / `newEndIndex` give the changed range as byte offsets in the old and new text, and `startPosition` / `oldEndPosition` / `newEndPosition` give the same endpoints as row/column positions.

Passed alongside the new buffer text to `Highlighter.parseBuffer()` to enable [Incremental Parsing](#incremental-parsing). The helper `applyTreeEdit(tree, edit)` applies the descriptor to an existing tree before re-parsing.

See: `src/renderer/highlighter.ts`, [Incremental Parsing](#incremental-parsing)

---

## U

### Undo Stack

A bounded list of `HistoryEntry` values recording buffer and cursor state before each edit, capped at `Editor._MAX_HISTORY = 100` entries — past that, the oldest is shifted off. The complementary **redo stack** is cleared on any new edit and populated when `undo` is dispatched. Both live inside `Editor` and are not exposed publicly.

See also: [EditorCommand](#editorcommand)

---

## V

### Viewport

The currently visible rectangular window into the multibuffer: `startRow`, `endRow`, `scrollTop`, `height`, and `width`. The renderer uses viewport information to decide which lines to render.

---

## W

### WrapMap

A mapping between buffer rows and visual rows when soft wrapping is enabled (`src/renderer/wrap-map.ts`). Stores the number of visual rows each buffer row occupies, with a prefix-sum array for O(1) buffer-row → visual-row conversion and binary search for the reverse direction.
