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

### BracketMatch

A type (`src/editor/bracket-match.ts`) representing a matched bracket pair in the multibuffer. Contains `open` and `close` as [`MultiBufferPoint`](#multibufferpoint) values identifying the positions of the opening and closing brackets. Returned by the `Editor.bracketMatch` getter and emitted via the `bracketMatch` event. The scan is bounded to 1,000 lines in each direction to avoid scanning the entire document. Only computed when `bracketMatching: true` is set in `EditorOptions`.

See: `src/editor/bracket-match.ts`

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

A high-performance canvas-based renderer (`src/renderer/canvas.ts`) that implements the [`Renderer`](#renderer) interface using an HTML `<canvas>` element. Text is drawn using a per-instance glyph atlas for efficient character caching and compositing. Uses a scroll container with a spacer element for native browser scrolling, and [`TileManager`](#tilemanager) for dirty-region tracking so only changed tiles are redrawn each frame. Supports soft wrapping via [`WrapMap`](#wrapmap) with lazy computation for large documents. Created by `createCanvasRenderer()`.

See: `src/renderer/canvas.ts`

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

Key methods:

- `reDiff()` — recomputes the diff immediately; returns the new `isEqual` state.
- `notifyChange()` — schedules a debounced re-diff (default 150 ms).
- `onUpdate(callback)` — subscribes to decoration updates; returns an unsubscribe function.
- `dispose()` — cleans up timers and subscriptions.

See also: [DiffResult](#diffresult), [DiffHunk](#diffhunk)

### DiffEditorView

A high-level facade (`src/diff/diff-editor-view.ts`) that bundles [`DiffController`](#diffcontroller), [`Editor`](#editor), `DomRenderer`, and [`InputHandler`](#inputhandler) into a single component for inline (unified) diff views. Created by `createDiffEditorView(container, oldText, newText, options)` or `createDiffEditorViewFromBuffers()` for existing `Buffer` instances. Supports automatic re-diff on edit (debounced via `DiffController`), keyed decoration groups, CSS-variable theming, and read-only mode with optional cursor hiding.

See: `src/diff/diff-editor-view.ts`, [`DiffController`](#diffcontroller)

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

A platform-portability interface (`src/project/types.ts`) for filesystem access used by [`ProjectTree`](#projecttree). Implementations provide `readdir(path)` for listing directory entries and an optional `stat(path)` for file metadata (size and modification time). The library ships `createFsAdapter()` for Bun/Node environments and `createMemoryFsAdapter()` for in-memory testing. A custom adapter can be passed via `ProjectTreeOptions.adapter` to use the browser File System Access API or any other virtual filesystem.

See: `src/project/types.ts`, [`ProjectTree`](#projecttree)

---

## G

### Generational Arena

The data structure underlying [SlotMap](#slotmap). Each slot carries a generation counter that increments on reuse, making stale keys detectable in O(1) without call-site bookkeeping.

### GlobMatcher

A function type `(pattern: string, path: string) => boolean` used by [`ProjectTree`](#projecttree) to filter files against glob patterns. Consumers may inject a custom implementation via `ProjectTreeOptions.globMatcher`; the default is a minimal built-in matcher created by `createGlobMatcher()` in `src/project/glob.ts`.

See: `src/project/types.ts`, [`ProjectTree`](#projecttree)

### GlyphAtlas

A texture atlas (`src/renderer/glyph-atlas.ts`) that caches pre-rendered character glyphs for GPU-accelerated text rendering. Glyphs are rasterized on first use into a fixed-cell grid (charWidth × lineHeight) on an offscreen canvas, producing a single-channel alpha texture for upload to WebGPU. The atlas grows when its current capacity is exhausted, up to a configurable `maxSize`. Exposes `GlyphInfo` (x, y, valid) per glyph for shader use.

See: `src/renderer/glyph-atlas.ts`, `src/renderer/webgpu.ts`

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

### HighlightCategory

A string union type (`src/renderer/queries/types.ts`) enumerating the syntax highlight categories that map to CSS custom properties (`--syntax-*`). Categories include `"keyword"`, `"string"`, `"number"`, `"comment"`, `"type"`, `"function"`, `"property"`, `"operator"`, `"punctuation"`, `"constant"`, `"variable_builtin"`, and `"default"`. Used in [`LanguageQuery`](#languagequery) to classify tree-sitter node types for per-language highlighting.

See: `src/renderer/queries/types.ts`, [`LanguageQuery`](#languagequery)

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

A tree-sitter–based syntax highlighter (`src/renderer/injection-highlighter.ts`) that extends the base `Highlighter` with support for [Language Injection](#language-injection). Maintains separate parse trees per injected language and builds a row → injection-range index for O(1) token lookup during rendering. Suitable for mixed-language files such as Markdown with YAML frontmatter.

See: `src/renderer/injection-highlighter.ts`, [Language Injection](#language-injection), [Incremental Parsing](#incremental-parsing)

### InputHandler

A class (`src/editor/input-handler.ts`) that captures keyboard input via a hidden off-screen `<textarea>` element. Using a textarea rather than raw `keydown` listeners enables IME (Input Method Editor) composition for CJK and other complex scripts. On each keyboard event, `InputHandler` calls [keyEventToCommand](#keyeventtocommand) to produce an `EditorCommand`; if no command matches, the `input` event carries the typed text instead. Exposes `mount(container)`, `unmount()`, `focus()`, and `blur()`.

---

## K

### keyEventToCommand

A function (`src/editor/input-handler.ts`) that translates a raw `KeyboardEvent` into an [EditorCommand](#editorcommand). Handles platform-specific shortcuts such as `Mod+Z` for undo and `Mod+Y` / `Mod+Shift+Z` for redo. Returns `undefined` for events that do not map to a recognized command, allowing the [InputHandler](#inputhandler) to fall through to normal text-input handling via the `input` event.

---

## L

### Language Injection

A syntax highlighting technique where a region of text is highlighted using a different language grammar than the surrounding file — for example, parsing a YAML frontmatter block inside a Markdown file with the YAML grammar. Injection ranges carry a `rowOffset` to translate token positions back to buffer coordinates. Implemented by [`InjectionHighlighter`](#injectionhighlighter).

See: `src/renderer/injection-highlighter.ts`

### LanguageQuery

A language-specific descriptor (`src/renderer/queries/types.ts`) providing the data needed to map tree-sitter node types to syntax highlight categories. Contains:

- `nodeTypeCategory` — a `ReadonlyMap<string, HighlightCategory>` mapping node type strings to highlight categories.
- `styledParents` (optional) — node types that propagate their styling to children (e.g., Markdown headings).
- `skipChildren` (optional) — node types whose children should not be highlighted separately (e.g., code blocks handled by injection).

Per-language modules in `src/renderer/queries/` export a `LanguageQuery`; the registry in `src/renderer/queries/index.ts` provides `nodeTypeToCategoryForLanguage(language, nodeType)` for O(1) lookup.

See: `src/renderer/queries/types.ts`, [`HighlightCategory`](#highlightcategory)

### Line Pooling

A DOM-renderer optimization that reuses existing line elements when scrolling, rather than creating and destroying DOM nodes for every visible row. Only the visible viewport's worth of nodes is kept alive.

---

## M

### Measurements

Fixed rendering constants: `lineHeight`, `charWidth`, `gutterWidth`, and optional `wrapWidth`. All lines have the same height, enabling O(1) pixel↔row conversion.

### moveWordBoundary

A cursor movement function (`src/editor/cursor.ts`) that advances one contiguous character-class run. Unlike `moveWord` (which skips two classes — e.g., whitespace then the following word — to reach the next word start), `moveWordBoundary` stops at the first class transition. Used for word-granularity deletion (`Opt+Backspace` / `Opt+Delete`) so that deleting forward from the end of a word removes only the whitespace, not the following word as well. Navigation commands (`Opt+Arrow`) still use `moveWord`.

See: `src/editor/cursor.ts`

### Multi-Cursor

The ability to have multiple simultaneous cursor positions and selections in the [`Editor`](#editor). Each cursor maps to an entry in the internal `_selections` array. Multi-cursor commands include `addCursor`, `addCursorAbove`, `addCursorBelow`, and `clearExtraCursors`. All edit operations (insert, delete, indent) are applied bottom-to-top across all selections so that higher row indices remain valid after lower edits. Overlapping or adjacent selections are automatically merged. The primary selection (index 0) is accessible via the backward-compatible `editor.selection` getter.

See also: [Primary Selection](#primary-selection), [Selection](#selection)

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

### Position Translation

The three-layer coordinate conversion:

```
MultiBufferPoint → ExcerptInfo → BufferPoint
```

Given a multibuffer row, binary search finds the containing excerpt; subtracting the excerpt's start row gives the buffer-relative row.

### Prefix Sum

An array where entry `i` holds the cumulative total of entries `0..i`. Used by [Rope](#rope) (chunk byte offsets) and [WrapMap](#wrapmap) (visual row offsets) for O(1) forward lookup and O(log n) reverse lookup via binary search.

### Primary Selection

The first entry in the [`Editor`](#editor)'s selections array (`_selections[0]`). In [multi-cursor](#multi-cursor) mode there may be additional selections, but the primary selection is always the one exposed via the backward-compatible `editor.selection` getter. When selections are merged after overlapping edits, the merged result becomes the primary selection.

See also: [Multi-Cursor](#multi-cursor), [Selection](#selection)

### ProjectDirectoryEntry

A directory entry returned by [`ProjectTree`](#projecttree). Has `type: "directory"`, `name`, `path` (absolute), and `relativePath` (relative to project root). Its `children()` method returns an `AsyncIterable<ProjectEntry>` that lazily walks the directory only when iterated, enabling efficient handling of large repositories.

See: `src/project/types.ts`, [`ProjectTree`](#projecttree)

### ProjectEntry

A discriminated union type (`ProjectFileEntry | ProjectDirectoryEntry`) representing a single item in a [`ProjectTree`](#projecttree). Disambiguated by the `type` field (`"file"` or `"directory"`).

See: `src/project/types.ts`

### ProjectFileEntry

A file entry returned by [`ProjectTree`](#projecttree). Has `type: "file"`, `name`, `path` (absolute), and `relativePath` (relative to project root). When `ProjectTreeOptions.includeMetadata` is `true`, also carries `size` (bytes) and `mtime` (Unix timestamp in ms).

See: `src/project/types.ts`, [`ProjectTree`](#projecttree)

### ProjectTree

An API (`src/project/`) for lazily enumerating files in a directory tree. Created by `createProjectTree(root, options)`. Supports glob-based include/exclude filtering via [`GlobMatcher`](#globmatcher), a pluggable [`FsAdapter`](#fsadapter) for platform portability, and async iteration via `entries()` and `children()`. Individual entries are retrievable by path via `get()`. Designed for building file tree UIs on top of multibuffer while keeping the library focused on the data layer.

See: `src/project/tree.ts`, [`FsAdapter`](#fsadapter), [`GlobMatcher`](#globmatcher)

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

A fixed-height chunk of rows used for dirty-region tracking in the [`CanvasRenderer`](#canvasrenderer). Each tile spans a configurable number of lines and carries a `dirty` flag indicating whether it needs to be redrawn. Tiles are identified by their start row. Multiple invalidations to the same tile in a single frame are coalesced automatically.

See: `src/renderer/tile-map.ts`, [`TileManager`](#tilemanager)

### TileManager

A class (`src/renderer/tile-map.ts`) that manages [`Tile`](#tile)-based dirty-region tracking for efficient partial redraws. Tracks dirty tiles in a `Set` for O(1) lookup and insertion. Exposes `markDirty(row, reason)`, `getDirtyTiles()`, `clearDirty()`, and `setViewport(start, end)` (which marks newly visible tiles dirty on scroll). Used by [`CanvasRenderer`](#canvasrenderer) to skip redrawing unchanged tiles each frame. Invalidation reasons include `"edit"`, `"selection"`, `"scroll"`, `"theme"`, `"resize"`, and `"initial"`.

See: `src/renderer/tile-map.ts`

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

---

## V

### Viewport

The currently visible rectangular window into the multibuffer: `startRow`, `endRow`, `scrollTop`, `height`, and `width`. The renderer uses viewport information to decide which lines to render.

---

## W

### WrapMap

A mapping between buffer rows and visual rows when soft wrapping is enabled (`src/renderer/wrap-map.ts`). Stores the number of visual rows each buffer row occupies, with a prefix-sum array for O(1) buffer-row → visual-row conversion and binary search for the reverse direction.
