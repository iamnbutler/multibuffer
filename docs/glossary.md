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

A pure function (`src/buffer/offset.ts`) that advances a `BufferOffset` through a chronological sequence of `EditEntry` values. Applies `adjustOffsetSingle` for each edit in turn, respecting [Bias](#bias) to resolve ambiguous positions at edit boundaries:

- Offsets before the edit pass through unchanged.
- Offsets after the edit's deleted range are shifted by `insertedLength − deletedLength`.
- Offsets at the edit start with `Bias.Right` jump past inserted text.
- Offsets at the edit start with `Bias.Left`, or within the deleted range, clamp to the edit start.

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

### CanvasRenderer

A [Renderer](#renderer) implementation (`src/renderer/canvas.ts`) that draws visible visual rows into an HTML `<canvas>` element instead of DOM nodes. Native scrolling is preserved by placing the canvas inside a scroll container with a spacer element sized to the full content height. Text is drawn through a [GlyphAtlas](#glyphatlas), with syntax colors applied by compositing color over the grayscale glyph bitmaps.

Supports [soft wrap](#soft-wrap) via [WrapMap](#wrapmap), and builds the wrap map lazily for documents over 5,000 lines (500 rows per animation frame) so that opening a large file does not block the main thread.

See: `src/renderer/canvas.ts`, [Renderer](#renderer), [GlyphAtlas](#glyphatlas)

### Clipping

The operation of clamping an out-of-bounds point or offset to the nearest valid position within a buffer or multibuffer. Clipping respects [bias](#bias): `Bias.Right` keeps the position at the end of a line rather than beyond it; `Bias.Left` keeps it before the boundary.

### Closer

An automated PR triage agent (`.github/workflows/closer.md`). Runs after a review is submitted and decides the outcome for each pull request:

- Applies the `ready-to-merge` label when CI is green and no blocking reviews remain.
- Applies the `needs-review` label when blocking reviews or unresolved issues exist.
- Closes PRs that are duplicate, spam, or fundamentally broken.

Defaults to `needs-review` when uncertain. Chains naturally after the [Reviewer](#reviewer). Draft status is irrelevant — all PRs are triaged on their code and review state alone.

See: `.github/workflows/closer.md`

### Coordinate Systems

The project uses two distinct coordinate spaces:

- **Buffer coordinates** — row/column or byte offset within a single source file (`BufferRow`, `BufferOffset`, `BufferPoint`).
- **Multibuffer coordinates** — row/column or byte offset within the unified scrollable view across all excerpts (`MultiBufferRow`, `MultiBufferOffset`, `MultiBufferPoint`).

Branded types enforce that these are never accidentally mixed.

### createMemoryFsAdapter

A factory (`src/project/adapter.ts`) that builds an in-memory [FsAdapter](#fsadapter) from a plain `Record<string, MemoryFsEntry>` mapping absolute paths to `{ type: "file", content, size }` or `{ type: "directory" }` markers. Intended for tests and for environments with no real filesystem: it synthesizes `readdir` results from the path keys and throws `ENOTDIR` / `ENOENT` errors matching the real adapter's behavior.

The Node/Bun counterpart is `createFsAdapter()`, which is backed by `node:fs/promises`.

See: `src/project/adapter.ts`, [FsAdapter](#fsadapter)

### createProjectTree

The factory (`src/project/tree.ts`) that constructs a [ProjectTree](#projecttree) for a given root path. Accepts `ProjectTreeOptions` — `adapter`, `include` / `exclude` glob patterns, a custom [GlobMatcher](#globmatcher), `includeMetadata`, and `maxDepth`. Each option falls back to a default: the Bun/Node filesystem adapter, no filters, the built-in minimal glob matcher, no metadata, and unlimited depth. The `root` path is normalized to drop any trailing slash.

See: `src/project/tree.ts`, [ProjectTree](#projecttree)

### createSyncDiffClient

A factory (`src/worker/diff-client.ts`) returning a [DiffClient](#diffclient) that always computes on the main thread — `diff()` resolves immediately with the result of the synchronous `diff()` function, `dispose()` is a no-op, and `workerAvailable` is permanently `false`. Used in environments without `Worker` support and in tests, where worker scheduling would make results non-deterministic.

See also: [DiffClient](#diffclient)

---

## D

### dedentLines

An [EditorCommand](#editorcommand) that removes up to 2 leading spaces from the cursor line or every line in the selection, applied atomically (no-op if no line has leading spaces). Triggered by `Shift+Tab` or `Mod+[`.

See also: [indentLines](#indentlines)

### Decoration

A visual annotation applied to a range of text in the renderer. Each decoration specifies a `MultiBufferRange` and optionally a CSS class name and a partial [`DecorationStyle`](#decorationstyle). The DOM renderer builds a per-row lookup during each render pass; when two decorations overlap the same row, the later entry in the array wins.

### DecorationStyle

An interface (`src/renderer/types.ts`) describing the full set of visual properties a [Decoration](#decoration) can apply to a row: `backgroundColor`, `color`, `borderColor`, `fontWeight`, `fontStyle`, `textDecoration`, and gutter-specific fields `gutterBackground`, `gutterColor`, `gutterSign`, and `gutterSignColor`. Decorations accept a `Partial<DecorationStyle>`, so any subset of fields may be specified.

### DiffClient

The main-thread interface to the diff worker (`src/worker/diff-client.ts`). Exposes `diff(oldText, newText, options)` returning a `Promise<DiffResult>`, `dispose()`, and a `workerAvailable` flag.

Created by `createDiffClient(workerUrl)`. If no worker URL is given, `Worker` is undefined, or worker construction throws, the client silently falls back to computing on the main thread — callers do not need to branch on availability. When a new request is issued while an older one is still outstanding, the older promise is **rejected** as stale (`"Request superseded by newer request"`) rather than left pending, so only the newest diff resolves.

See also: [createSyncDiffClient](#createsyncdiffclient), [DiffResult](#diffresult), [HighlightClient](#highlightclient)

### DiffController

A stateful controller (`src/diff/controller.ts`) that manages a live diff view between two [buffers](#buffer). Created by `createDiffController(oldBuffer, newBuffer, options)`. Maintains a [MultiBuffer](#multibuffer) whose excerpts are rebuilt from the old and new buffers on each diff, along with a set of [decorations](#decoration) for visual styling.

Key methods:

- `reDiff()` — recomputes the diff immediately; returns the new `isEqual` state.
- `notifyChange()` — schedules a debounced re-diff (default 150 ms).
- `onUpdate(callback)` — subscribes to decoration updates; returns an unsubscribe function.
- `dispose()` — cleans up timers and subscriptions.

See also: [DiffResult](#diffresult), [DiffHunk](#diffhunk)

### DiffHunk

A contiguous group of changed and context [DiffLine](#diffline) entries produced by the diff algorithm, analogous to a unified diff hunk (`@@ -a,b +c,d @@`). Carries `oldStart`, `oldCount`, `newStart`, `newCount`, and a `lines` array. Adjacent changes within `2 × context` lines of each other are merged into a single hunk.

See: `src/diff/types.ts`

### DiffKind

The type of change a [DiffLine](#diffline) represents:

- `"equal"` — the line is unchanged between old and new.
- `"insert"` — the line was added in the new version (has no `oldRow`).
- `"delete"` — the line was removed from the old version (has no `newRow`).

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

The specification for creating an excerpt. Contains:
- `context` — the full `BufferRange` to display (including any surrounding context lines).
- `primary` — the highlighted sub-range within `context`.

---

## F

### FsAdapter

The filesystem abstraction (`src/project/types.ts`) that makes [ProjectTree](#projecttree) platform-agnostic. Requires a single method, `readdir(path)`, returning `FsDirEntry` values (`{ name, isDirectory }`); `stat(path)` is optional and only needed when the `includeMetadata` option is enabled.

Implementations ship for Bun/Node (`createFsAdapter()`) and for tests ([createMemoryFsAdapter](#creatememoryfsadapter)); a browser consumer can supply its own backed by the File System Access API or a virtual filesystem.

See: `src/project/types.ts`, [ProjectTree](#projecttree)

---

## G

### Generational Arena

The data structure underlying [SlotMap](#slotmap). Each slot carries a generation counter that increments on reuse, making stale keys detectable in O(1) without call-site bookkeeping.

### GlobMatcher

A function type (`src/project/types.ts`) with the signature `(pattern: string, path: string) => boolean`, used by [ProjectTree](#projecttree) to test `include` and `exclude` patterns against each entry's path relative to the project root. The project ships a minimal built-in matcher; a consumer needing fuller glob semantics can inject their own implementation via the `globMatcher` option rather than pulling in a dependency.

Exclusions are applied after inclusions.

See: `src/project/types.ts`, [createProjectTree](#createprojecttree)

### GlyphAtlas

A texture cache of rasterized characters (`src/renderer/glyph-atlas.ts`) shared by the [CanvasRenderer](#canvasrenderer) and [WebGpuRenderer](#webgpurenderer). Because the editor assumes a monospace font, every glyph occupies a fixed `charWidth × lineHeight` cell, which makes lookup pure arithmetic and packing trivial — glyphs fill rows left-to-right, top-to-bottom on an `OffscreenCanvas` (falling back to a regular canvas where unavailable).

The atlas stores glyph *shapes* only, as single-channel alpha; color is applied later by the shader or by canvas compositing, so one cached glyph serves every syntax color. Printable ASCII is pre-populated at construction and any other character is rasterized lazily on first use. A `dirty` flag and a `version` counter let a renderer detect when the texture must be re-uploaded to the GPU; the atlas grows on demand up to `maxSize` (default 4096 px).

See: `src/renderer/glyph-atlas.ts`

### Goal Column

A remembered column position stored by the `Editor` for vertical cursor navigation (`moveUp`, `moveDown`). When moving vertically through lines of unequal length, the cursor targets the goal column rather than the actual column of the current line. The goal column is cleared by horizontal movement or any edit, and reset at the start of each new vertical movement. This allows the cursor to return to its original column after passing through shorter intermediate lines.

### Granularity

The unit of movement or deletion for an editor command: `character`, `word`, `line`, `page`, or `buffer`.

### Gutter

The left-hand area of the editor display reserved for line numbers and other margin decorations. Its width is captured in `Measurements.gutterWidth`.

### Gutter Sign

A character rendered between the gutter line-number area and the line content on a decorated row. Specified via `DecorationStyle.gutterSign` (e.g., `"+"` or `"−"`) and colored by `gutterSignColor`. Useful for diff-style annotations that indicate added or removed lines.

See also: [Decoration](#decoration), [DecorationStyle](#decorationstyle), [Gutter](#gutter)

---

## H

### HighlightClient

The main-thread interface to the syntax-highlighting worker (`src/worker/highlight-client.ts`). Extends `SyntaxHighlighter` with async, worker-aware counterparts: `init(treeSitterWasmUrl, languageWasmUrl, languageName?)` must be called first, `parseBufferAsync(bufferId, text, edit?)` parses (passing a [TreeEdit](#treeedit) enables [incremental parsing](#incremental-parsing)), and `getTokensAsync(bufferId, startRow, endRow)` returns a row → [Token] map.

Results are cached per buffer; `invalidateCache(bufferId)` drops them after an edit, `deleteBuffer(bufferId)` also evicts the buffer from the worker, and `dispose()` terminates the worker. Moving tree-sitter parsing off the main thread keeps highlighting of large files from competing with the <1 ms keypress budget.

See also: [DiffClient](#diffclient), [Incremental Parsing](#incremental-parsing)

### Hit Test

Converting pixel coordinates `(x, y)` from a mouse event into a `{ row, column }` multibuffer position. Implemented by the renderer using fixed-height line measurements.

---

## I

### Implementor

An automated AI agent (`.github/workflows/implementor.md`) that picks up GitHub issues labeled `agent:implement` and implements them following the project's TDD discipline — Types, then Tests, then Implementation. Runs twice daily (7 am/2 pm UTC) or on demand via the `/implement` slash command on any issue. Creates draft pull requests, self-maintains its open PRs for CI failures (delegating complex fixes to `/pr-fix`), and can decompose large issues into sub-issues also labeled `agent:implement`. Every output is prefixed with `[Implementor]` for transparency.

See: `.github/workflows/implementor.md`

### indentLines

An [EditorCommand](#editorcommand) that prepends 2 spaces to the cursor line or every line in the selection, applied atomically. `insertTab` with a non-collapsed selection is treated as `indentLines`. Triggered by `Tab` (with a selection) or `Mod+]`.

See also: [dedentLines](#dedentlines)

### Incremental Parsing

An optimization in `Highlighter.parseBuffer()` (`src/renderer/highlighter.ts`) where the previous parse tree is passed to tree-sitter's `parser.parse(text, oldTree)`. Tree-sitter reuses unchanged subtrees instead of re-parsing the entire file on every edit. Enabled by supplying a [TreeEdit](#treeedit) descriptor so the old tree is updated via `tree.edit()` before re-parsing; on large files this eliminates significant per-keystroke overhead.

See: `src/renderer/highlighter.ts`, [TreeEdit](#treeedit)

### InjectionHighlighter

A `SyntaxHighlighter` implementation (`src/renderer/injection-highlighter.ts`) that adds [language injection](#language-injection) support on top of tree-sitter parsing. It keeps a parser and `Language` per loaded language: `init()` loads the primary language, and `loadLanguage(name, wasmUrl)` registers each additional language that may appear embedded.

Each buffer's cached parse holds the primary tree, a tree per injected language, the detected injection ranges, and a row → range index so `getLineTokens()` can find the responsible language in O(1) rather than scanning.

See: `src/renderer/injection-highlighter.ts`, [Language Injection](#language-injection)

### InputHandler

A class (`src/editor/input-handler.ts`) that captures keyboard input via a hidden off-screen `<textarea>` element. Using a textarea rather than raw `keydown` listeners enables IME (Input Method Editor) composition for CJK and other complex scripts. On each keyboard event, `InputHandler` calls [keyEventToCommand](#keyeventtocommand) to produce an `EditorCommand`; if no command matches, the `input` event carries the typed text instead. Exposes `mount(container)`, `unmount()`, `focus()`, and `blur()`.

### InvalidationReason

A string union (`src/renderer/tile-map.ts`) naming why a [Tile](#tile) was marked dirty: `"edit"`, `"selection"`, `"scroll"`, `"theme"`, `"resize"`, or `"initial"`. [TileManager](#tilemanager) accepts it as an optional trailing argument on `markDirty`, `markRowDirty`, `markAllDirty`, and `markDocumentDirty`.

The reason is currently **advisory** — it is recorded for debugging and to leave room for future per-reason optimizations, but does not change which tiles are invalidated.

See: `src/renderer/tile-map.ts`, [TileManager](#tilemanager)

---

## K

### keyEventToCommand

A function (`src/editor/input-handler.ts`) that translates a raw `KeyboardEvent` into an [EditorCommand](#editorcommand). Handles platform-specific shortcuts such as `Mod+Z` for undo and `Mod+Y` / `Mod+Shift+Z` for redo. Returns `undefined` for events that do not map to a recognized command, allowing the [InputHandler](#inputhandler) to fall through to normal text-input handling via the `input` event.

---

## L

### Language Injection

Highlighting a region of a file with a language other than the file's own — for example a YAML frontmatter block or a fenced code block inside a Markdown document. The outer parse tree locates the embedded regions, each region's text is parsed with its own language's parser, and the resulting tokens are mapped back into buffer coordinates using the region's row offset.

Implemented by [InjectionHighlighter](#injectionhighlighter), which currently detects YAML frontmatter (`minus_metadata`), TOML frontmatter (`plus_metadata`), and fenced code blocks — taking the language from the fence's info string.

See: `src/renderer/injection-highlighter.ts`, [InjectionHighlighter](#injectionhighlighter)

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

An immutable snapshot of the multibuffer's state. Carries a monotonically increasing `version` counter that increments on every mutation (shared globally across all `MultiBuffer` instances). Supports read operations (`lines`, `excerptAt`, `toBufferPoint`, `toMultiBufferPoint`, `resolveAnchor`, `resolveAnchors`, `clipPoint`, `excerptBoundaries`) without mutation concerns. The `version` field is used by the DOM renderer to skip `WrapMap` reconstruction when neither the snapshot content nor the wrap width has changed since the last render.

### Myers' Algorithm

The O(ND) line-level diff algorithm used in `src/diff/diff.ts`, where N is the sum of line counts in both texts and D is the number of differing lines. Finds the shortest edit script by tracking the furthest-reaching path on each diagonal of an edit graph. The implementation stores the trace as active diagonal slices of size `2d+1` at each step `d`, reducing memory from O(max·D) to O(D²) — a significant win for large files with few changes.

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

### ProjectTree

The file-discovery interface (`src/project/types.ts`) for walking a directory tree, filtering it, and backing a file-tree UI. Exposes `root`, `entries()` and `children(path)` (both `AsyncIterable<ProjectEntry>`), plus `get(path)` and `has(path)`.

Enumeration is **lazy**: directories are walked only as they are iterated, and a `ProjectDirectoryEntry` exposes its own `children()` iterator, so expanding one folder in a large repository does not force a full-tree walk. `ProjectEntry` is a discriminated union on `type` (`"file"` or `"directory"`); file entries carry `size` and `mtime` only when the `includeMetadata` option is set.

This is a data layer only — the project ships no tree UI; consumers render the entries themselves.

See: `src/project/types.ts`, [createProjectTree](#createprojecttree), [FsAdapter](#fsadapter)

---

## R

### Read-Only Mode

A mode in which the `Editor` silently ignores all text-mutating commands. Enabled by passing `readOnly: true` to the `Editor` constructor or by calling `editor.setReadOnly(true)` at runtime. While active, `dispatch()` discards any command classified as an edit command — including `insertText`, `cut`, `redo`, `deleteLine`, `moveLine`, `duplicateLine`, `indentLines`, `dedentLines`, and others — while still processing cursor-movement commands. The current state is readable via the `editor.readOnly` getter.

See: `src/editor/editor.ts`

### Renderer

An interface (`src/renderer/types.ts`) that rendering backends implement. A renderer `mount`s into a container element, accepts a `RenderState` and lines, and handles `scrollTo` and `hitTest`. The current implementation targets the DOM; the interface allows future Canvas or WebGPU backends.

### Reviewer

An automated adversarial code reviewer (`.github/workflows/reviewer.md`). Triggered on every PR event (opened, synchronize, ready_for_review) and via the `/review` slash command. Enforces the project's four priorities in order: accuracy, performance, consistency, public API UX.

- Uses `REQUEST_CHANGES` for blocking issues; `COMMENT` for non-blocking suggestions.
- Hardballs every `biome-ignore` suppression — suppressions must have concrete justification (or be rewritten to avoid needing one).
- Can sparingly create issues (max 1/run) for antipatterns recurring across multiple reviews.
- Up to 25 inline review comments per run, prioritising blocking issues first.

Read-only: never writes implementation code or pushes to branches.

See: `.github/workflows/reviewer.md`

### Rope

The text storage structure backing each [buffer](#buffer). Splits text into fixed-size chunks (≤ 1024 bytes, preferring newline boundaries); insert/delete/replace return new Rope instances with structural sharing of unchanged chunks. Caches chunk byte offsets as a prefix-sum array for O(log n) line↔offset conversion.

---

## S

### Selection

An [AnchorRange](#anchorrange) plus a `head` field (`"start"` or `"end"`) indicating which end of the range the cursor occupies. The head determines the direction of the selection and where the cursor is rendered.

### selectWordAt

A method on `Editor` that sets the selection to the full word at a given `MultiBufferPoint`, used for double-click word selection. If the target position is on a word character (`\p{L}`, `\p{N}`, or `_`), the selection expands to the word's boundaries; if it is on non-word content (whitespace or punctuation), it expands to the surrounding non-word run. Unicode-aware: handles multibyte characters including CJK and emoji via surrogate-pair stride helpers.

See: `src/editor/editor.ts`

### setExcerpts

A batch method on `MultiBuffer` (`src/multibuffer/multibuffer.ts`) that atomically replaces all current excerpts with a new set in a single operation. Accepts an array of `{ buffer, range, options }` entries, removes all existing excerpts, inserts the new ones, then calls `_rebuildCache()` exactly once. This reduces the cost of a full excerpt refresh from O(N²) — the `clearExcerpts()` + N×`addExcerpt()` pattern triggers N+1 cache rebuilds — to O(N).

Used by `DiffController.reDiff()` when rebuilding the diff view. Note: `setExcerpts()` does **not** build an anchor replacement chain, so existing [anchors](#anchor) do not survive the call; this matches the prior semantics of `clearExcerpts()` + `addExcerpt()`.

See also: [setExcerptsForBuffer](#setexcerptsforBuffer), [DiffController](#diffcontroller)

### setExcerptsForBuffer

A method on `MultiBuffer` that replaces all excerpts belonging to a single buffer with a new set of ranges, while preserving [anchor](#anchor) validity. After swapping the excerpts, it builds a replacement chain mapping each old [ExcerptId](#excerptid) to the first new one, so that `resolveAnchor` / `resolveAnchors` can follow the chain and return a valid position in the updated excerpt set.

Differs from [`setExcerpts`](#setexcerpts) in two ways: it operates on one buffer only (leaving other buffers' excerpts untouched), and it does maintain the anchor replacement chain.

See: `src/multibuffer/multibuffer.ts`, [Anchor Resolution](#anchor-resolution)

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

### Surrogate Pair Snapping

The behavior of `clipPoint` and `clipOffset` (`src/buffer/buffer.ts`) when a clamped position lands inside a UTF-16 surrogate pair (e.g., emoji or other supplementary Unicode characters outside the Basic Multilingual Plane). A position is inside a surrogate pair when it points at a low surrogate (code unit 0xDC00–0xDFFF); [Bias](#bias) then determines the snap direction:

- `Bias.Left` — steps back to the high surrogate (the position *before* the supplementary character).
- `Bias.Right` — steps past the low surrogate (the position *after* the supplementary character).

This matches the surrogate-pair-aware cursor movement in `cursor.ts`, which uses `codePointAt`/`prevCpStart` helpers to traverse pairs atomically.

See: `src/buffer/buffer.ts`, [Bias](#bias), [Clipping](#clipping)

---

## T

### TextSummary

Cached aggregate metrics for a span of text: `lines`, `bytes`, `lastLineLength`, and `chars`. Stored per-excerpt to enable O(1) position lookups without scanning the text.

### Tile

A fixed-height horizontal band of rows used for dirty-region tracking: `{ startRow, endRow, dirty }`, where `startRow` is inclusive and `endRow` exclusive. Tiles are identified by their start row and are aligned to multiples of the tile size (0, 10, 20, … for the default 10 lines per tile), so the tile containing any row is `floor(row / linesPerTile) * linesPerTile`.

See: `src/renderer/tile-map.ts`, [TileManager](#tilemanager)

### TileManager

The dirty-region tracker (`src/renderer/tile-map.ts`) that lets a renderer redraw only the parts of the viewport that changed. It divides the document into [tiles](#tile) and holds dirty tile start rows in a `Set`, which gives O(1) marking and lookup and coalesces repeated invalidations within a frame for free.

The render loop is: `setViewport(startRow, endRow)` when scrolling or resizing — which automatically marks *newly visible* tiles dirty — `markDirty(startRow, endRow, reason)` when content changes, `getDirtyTiles()` to collect the tiles to repaint (viewport-clipped, sorted by start row), then `clearDirty()` after the pass. `setTotalLines()` keeps the document length current.

Two helpers translate common events into tile invalidations: `markEditDirty()` marks a single row for edits that do not change the line count and the full affected span when they do, and `markSelectionDirty()` marks the *symmetric difference* between the old and new selection rather than their union, so extending a selection repaints only the rows whose selected state actually flipped.

See: `src/renderer/tile-map.ts`, [Tile](#tile), [InvalidationReason](#invalidationreason)

### Trailing Newline (synthetic)

An artificial newline appended after an excerpt's last line to visually separate it from the next excerpt. Tracked by `Excerpt.hasTrailingNewline`. Position calculations must account for this: the excerpt's effective line count is one greater than its buffer range, but the extra line contains no editable content.

### TreeEdit

An interface (`src/renderer/highlighter.ts`) describing a single incremental text edit to supply to tree-sitter. Matches the data fields of web-tree-sitter's `Edit` class:

- `startIndex` / `oldEndIndex` / `newEndIndex` — byte offsets of the changed range in the old and new text.
- `startPosition` / `oldEndPosition` / `newEndPosition` — row/column positions of the range endpoints.

Passed alongside the new buffer text to `Highlighter.parseBuffer()` to enable [Incremental Parsing](#incremental-parsing). The helper `applyTreeEdit(tree, edit)` applies the descriptor to an existing tree before re-parsing.

See: `src/renderer/highlighter.ts`, [Incremental Parsing](#incremental-parsing)

---

## U

### Undo Stack

A bounded list of `HistoryEntry` values recording buffer and cursor state before each edit. Limited to `Editor._MAX_HISTORY = 100` entries; when the limit is exceeded, the oldest entry is dropped (shifted off). The complementary **redo stack** is cleared on any new edit and populated when `undo` is dispatched. Both stacks are managed inside `Editor` and are not exposed publicly.

See also: [EditorCommand](#editorcommand)

### useEditorView

The React hook (`src/react/use-editor-view.ts`) that mounts an `EditorView` into a container element and manages its lifecycle. Returns `{ containerRef, view, setDecorations, setTheme }` — attach `containerRef` to a `<div>`, and `view` is `null` during SSR and until the first effect runs.

Content is **uncontrolled**: the `text` option is applied only on mount and later changes are ignored, so typing does not round-trip through React state. Use the `view.editor` API directly for controlled content. Other options (`readOnly`, `theme`, `decorations`) can be updated after mount and are synchronized without tearing down and recreating the view. The hook is SSR-safe — it no-ops when `document` is undefined — and destroys the view on unmount.

See: `src/react/use-editor-view.ts`

---

## V

### Viewport

The currently visible rectangular window into the multibuffer: `startRow`, `endRow`, `scrollTop`, `height`, and `width`. The renderer uses viewport information to decide which lines to render.

---

## W

### WebGpuRenderer

A [Renderer](#renderer) implementation (`src/renderer/webgpu.ts`) targeting very large files, where per-glyph CPU drawing becomes the bottleneck. Visible glyphs are drawn with GPU instanced rendering: each instance carries a position, atlas coordinates, and a color, sampled from a [GlyphAtlas](#glyphatlas) texture, so an entire viewport is submitted as a single draw call. The WGSL shader source is inlined in the module for portability.

Unlike the [CanvasRenderer](#canvasrenderer), it has no native scrollbars — scroll position is tracked manually and rendering is driven by a `requestAnimationFrame` loop with a `needsRender` flag. It shares the lazy [WrapMap](#wrapmap) strategy for large documents (`LAZY_WRAP_THRESHOLD` 5,000 lines, `WRAP_CHUNK_SIZE` 2,000 rows per frame) and re-uploads the atlas texture only when the atlas version changes.

See: `src/renderer/webgpu.ts`, [Renderer](#renderer), [GlyphAtlas](#glyphatlas)

### WrapMap

A mapping between buffer rows and visual rows when soft wrapping is enabled (`src/renderer/wrap-map.ts`). Stores the number of visual rows each buffer row occupies, with a prefix-sum array for O(1) buffer-row → visual-row conversion and binary search for the reverse direction.
