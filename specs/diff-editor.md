# Diff Editor Specification

Status: Draft v1

Purpose: Define a diff viewing and editing component built on the MultiBuffer architecture.

## 1. Problem Statement

The diff editor solves the problem of viewing and editing differences between two versions of a file within a unified, scrollable interface. Unlike traditional side-by-side or read-only unified diffs, this component allows direct editing of the "new" version while maintaining accurate diff visualization.

The system must interleave deleted and inserted lines in one view, keep the new-buffer lines editable while delete lines stay read-only, update the diff as those edits land, and preserve the cursor across recalculations. See §2.1 for the full goal list.

## 2. Goals and Non-Goals

### 2.1 Goals

- Display a unified diff between two buffers with proper line-number attribution.
- Render delete lines as read-only excerpts from the old buffer.
- Render insert and equal lines as editable excerpts from the new buffer.
- Apply visual decorations (background colors, gutter signs) to distinguish line types.
- Support a dual-gutter mode showing old line numbers, new line numbers, and diff signs.
- Preserve cursor position through excerpt rebuilds via the anchor system.
- Debounce re-diff calculations to avoid excessive computation during rapid editing.
- Support convergence: when edits make new text match old, delete+insert pairs collapse to equal.
- Support divergence: when edits make equal text differ from old, new delete+insert pairs appear.

### 2.2 Non-Goals

- Side-by-side diff view (this spec covers unified view only).
- Three-way merge visualization.
- Syntax-aware diffing (we diff by lines, not by AST).
- Diff folding or hunk collapsing.
- Git integration (this is a pure text diff component).

## 3. System Overview

### 3.1 Main Components

| Component | Source | Role |
|-----------|--------|------|
| Diff algorithm | `src/diff/diff.ts` | Myers' O(ND) line diff, grouped into hunks with configurable context (§5.1); also `computeIntralineDiff` (§5.8) |
| MultiBuffer builder | `src/diff/multibuffer.ts` | Builds a `MultiBuffer` of excerpts from the appropriate source buffer, plus `Decoration[]` (§4.2, §5.2) |
| Diff controller | `src/diff/controller.ts` | Debounced re-diff on `notifyChange()`, subscriber notification (§5.4, §7.2) |
| Diff gutter renderer | `src/renderer/dom.ts` | Dual line-number columns and signs under `gutterMode: "diff"` (§4.3, §6) |
| Editor | `src/editor/editor.ts` | Editing; honors the excerpt `editable` flag and fires `onChange` (§5.3) |

Built on the same primitives, but outside this spec: `diff-editor-view.ts` (a facade bundling controller + editor + renderer + input), `multi-file.ts` (multi-file diffs with per-file headers and collapse), `patch.ts` (unified-patch parsing), and `unified.ts` (flat line-by-line view of a whole file).

### 3.2 Data Flow

```
[Old Buffer] ──┐
               ├──> [diff()] ──> [DiffResult] ──> [buildExcerpts()] ──> [MultiBuffer]
[New Buffer] ──┘                                                             │
      ▲                                                                      │
      │                                                                      ▼
      │                                                              [Editor.edit()]
      │                                                                      │
      └──────────────────── [notifyChange()] <── [onChange callback] <───────┘
```

An edit goes through `MultiBuffer.edit()`, fires the editor's `onChange`, and reaches the controller as `notifyChange()`, which re-diffs after the debounce delay. See §5.4 for the full sequence.

### 3.3 External Dependencies

- `Buffer`: Mutable text storage with version tracking and edit log.
- `MultiBuffer`: Collection of excerpts supporting mixed editability.
- `Editor`: Command dispatcher for cursor movement and text editing.
- `DomRenderer`: DOM-based renderer with gutter mode support.

## 4. Core Domain Model

### 4.1 Entities

#### 4.1.1 DiffLine

A single line in the diff output.

| Field | Type | Description |
|-------|------|-------------|
| `kind` | "equal" \| "insert" \| "delete" | The type of change this line represents |
| `text` | string | Line content without trailing newline |
| `oldRow` | number \| undefined | 0-based line number in old buffer; undefined for insert lines |
| `newRow` | number \| undefined | 0-based line number in new buffer; undefined for delete lines |

#### 4.1.2 DiffHunk

A contiguous group of diff lines with shared context. Analogous to a unified diff hunk.

| Field | Type | Description |
|-------|------|-------------|
| `oldStart` | number | Starting line number in old buffer |
| `oldCount` | number | Lines from old buffer in this hunk |
| `newStart` | number | Starting line number in new buffer |
| `newCount` | number | Lines from new buffer in this hunk |
| `lines` | readonly DiffLine[] | The lines in this hunk, including context |

#### 4.1.3 DiffResult

Complete diff output: `hunks` (readonly DiffHunk[]) describing all changes, and `isEqual` (boolean), true when old and new text are identical.

#### 4.1.4 Decoration

Visual styling applied to a range of text: `range` (MultiBufferRange) selects the rows, `style` (Partial\<DecorationStyle\>) supplies the visual properties, and `className` (string, optional) attaches a CSS class instead of inline styles.

#### 4.1.5 DecorationStyle

All visual properties for a decorated line.

| Field | Type | Description |
|-------|------|-------------|
| `backgroundColor` | string | Line background color |
| `color` | string | Text color |
| `borderColor` | string | Border color |
| `fontWeight` | "normal" \| "bold" | Text weight |
| `fontStyle` | "normal" \| "italic" | Text style |
| `textDecoration` | "none" \| "underline" \| "line-through" | Text decoration |
| `gutterBackground` | string | Background for gutter area |
| `gutterColor` | string | Text color for line numbers |
| `gutterSign` | string | Sign character (e.g., "+", "−") |
| `gutterSignColor` | string | Color for the sign character |
| `isHunkSeparator` | boolean (optional) | Gutter spans full width with no line numbers; used for hunk separators (§6.1) |

#### 4.1.6 DiffController

Controller for a diff view with re-diff on edit support. Exposes the `multiBuffer`, current `decorations`, `isEqual`, and both buffers, plus `reDiff()`, `notifyChange()`, `onUpdate()`, and `dispose()`. Full signatures in §7.2.

### 4.2 Excerpt Structure

The diff MultiBuffer contains excerpts in display order:

| Line Kind | Source Buffer | Editable | Gutter Sign |
|-----------|---------------|----------|-------------|
| delete    | old           | false        | "−"     |
| insert    | new           | configurable | "+"     |
| equal     | new           | configurable | (none)  |

Insert and equal editability default to true and are set by `editableInsert` / `editableEqual`; `readOnly` forces both off (§7.2).

**Important**: Each contiguous run of same-kind lines becomes ONE excerpt. This minimizes excerpt count and avoids fragmentation.

Example for diff between "a\nb\nc" (old) and "a\nX\nc" (new):

```
Hunk: lines 0-2 of old, lines 0-2 of new
  equal: "a"  (newRow=0)    → excerpt from new, rows [0,1)
  delete: "b" (oldRow=1)    → excerpt from old, rows [1,2)
  insert: "X" (newRow=1)    → excerpt from new, rows [1,2)
  equal: "c"  (newRow=2)    → excerpt from new, rows [2,3)
```

Results in 4 excerpts total. The MultiBuffer line count is 4 (one more than either buffer because both "b" and "X" appear).

### 4.3 Gutter Display Modes

**Standard mode** (`gutterMode: undefined | "standard"`) is a single gutter column showing the MultiBuffer row number, `gutterWidth` wide (from Measurements).

**Diff mode** (`gutterMode: "diff"`) uses three fixed-width columns — old line number (40px), new line number (40px), sign (16px), 96px total — filled per line kind:

| Line Kind | Old Gutter | New Gutter | Sign |
|-----------|------------|------------|------|
| equal     | oldRow+1   | newRow+1   | " "  |
| delete    | oldRow+1   | (empty)    | "−"  |
| insert    | (empty)    | newRow+1   | "+"  |

## 5. Behavioral Specification

### 5.1 Diff Calculation

Myers' diff over two text strings (old and new), with a default context of 3 lines around each change. Adjacent changes within `2 * context` lines merge into one hunk, and lines outside any hunk's context window are excluded from the view.

**Edge cases**:
- Empty old + empty new: `isEqual = true`, no excerpts.
- Empty old + non-empty new: All lines are inserts.
- Non-empty old + empty new: All lines are deletes.
- Identical texts: `isEqual = true`, single excerpt from new buffer (if non-empty).

### 5.2 Excerpt Construction

For each hunk, iterate through lines and group consecutive same-kind lines:

```
for each hunk:
  i = 0
  while i < hunk.lines.length:
    kind = hunk.lines[i].kind
    startRow = (kind == delete) ? oldRow : newRow
    count = 0

    while i < hunk.lines.length && hunk.lines[i].kind == kind:
      count++
      i++

    add excerpt:
      buffer = (kind == delete) ? oldBuffer : newBuffer
      range = [startRow, startRow + count)
      editable = (kind != delete)

    if kind == delete:
      add decoration with DELETE_STYLE
    else if kind == insert:
      add decoration with INSERT_STYLE
```

### 5.3 Editing Behavior

Insert and equal lines (from the new buffer) are editable; the cursor can move through delete lines but cannot modify them. Any edit targeting a non-editable excerpt is rejected, as is a cross-excerpt edit spanning editable and non-editable regions.

### 5.4 Live Re-Diff

`notifyChange()` (typically from the editor's `onChange`) cancels any pending timer and schedules a re-diff after the debounce delay — 150ms by default, set via `debounceMs`. On fire, the controller reads the current text from both buffers, runs `diff()`, replaces all excerpts with ones built from the result, regenerates decorations, and notifies subscribers.

### 5.5 Convergence and Divergence

**Convergence**: editing an insert line to match its delete line collapses the pair — the delete excerpt is dropped, the insert excerpt becomes equal, and the MultiBuffer line count decreases.

```
Before: delete "foo" + insert "bar"  →  2 lines, 2 excerpts
Edit: change "bar" to "foo"
After: equal "foo"  →  1 line, 1 excerpt
```

**Divergence**: editing an equal line so it no longer matches the old text is the inverse — the equal excerpt splits into delete (from old) + insert (from new), and the line count increases.

```
Before: equal "foo"  →  1 line, 1 excerpt
Edit: change "foo" to "bar"
After: delete "foo" + insert "bar"  →  2 lines, 2 excerpts
```

### 5.6 Cursor Preservation

The MultiBuffer's anchor system handles cursor preservation:

1. Editor creates anchors at cursor position before operations.
2. Anchors reference excerpt ID + buffer offset + version.
3. When excerpts are rebuilt, the replacement map tracks old→new ID mappings.
4. `resolveAnchor()` follows replacement chain and adjusts for buffer edits.
5. Cursor position is restored after re-diff.

**Edge cases**:
- Cursor on delete line that disappears (convergence): Cursor moves to the resulting equal line.
- Cursor on equal line that diverges: Cursor moves to the insert line (the editable one).

### 5.7 Decoration Styles

Default styles (CSS-compatible colors):

**Delete lines**:
```
backgroundColor: "rgba(255, 80, 80, 0.10)"
gutterBackground: "rgba(255, 80, 80, 0.18)"
gutterSign: "−"
gutterSignColor: "#f87171"
```

**Insert lines**:
```
backgroundColor: "rgba(80, 200, 80, 0.10)"
gutterBackground: "rgba(80, 200, 80, 0.18)"
gutterSign: "+"
gutterSignColor: "#4ade80"
```

**Equal lines**: No decoration (use default background).

Intraline highlights use the same colors at higher opacity — `rgba(255, 80, 80, 0.25)` for deletes, `rgba(80, 200, 80, 0.25)` for inserts (§5.8).

### 5.8 Intraline Highlighting

Character-level highlighting within paired delete/insert lines is enabled by default (`intraline: true`). `pairDeleteInsertLines()` matches deletes to inserts within a hunk, `computeIntralineDiff()` produces the differing character ranges, and those become column decorations the renderer paints as background spans. Two guardrails bound the cost: lines longer than `intralineOptions.maxLineLength` (default 1000) fall back to full-line ranges, and computation aborts past `timeBudgetMs` (default 2) per line pair.

## 6. Rendering Specification

### 6.1 Excerpt Headers and Hunk Separators

Excerpt headers are not per-hunk file paths in diff mode: when `gutterMode === "diff"` the renderer hides all gutter columns on a header row and lets the header text span the full width, which is what multi-file diffs use for per-file headings.

Between non-adjacent hunks the builder inserts separator lines carrying the hunk header text (e.g. `@@ -10,5 +12,7 @@`), styled by `HUNK_HEADER_STYLE` with `isHunkSeparator: true` so the gutter renders full-width with no line numbers. Controlled by `showHunkSeparators` (default true); the lines come from a generated separator buffer returned as `separatorBuffer`, which callers must retain to prevent garbage collection.

### 6.2 Diff Gutter Layout

In diff mode, each line row contains:

```
┌──────────────────────────────────────────────────────────┐
│ [old#] │ [new#] │ [±] │ [content........................]│
│  40px  │  40px  │16px │  flex: 1                        │
└──────────────────────────────────────────────────────────┘
```

Both line numbers are right-aligned with 4px right padding, the sign is centered, and the content takes the remaining width with horizontal scroll if needed.

### 6.3 Hit Testing and Selection

Both must account for the 96px diff gutter (§4.3): content starts at x = 96, so `hitTest(x, y)` derives the column from `(x - 96) / charWidth` and selection rectangles start at `96 + (startColumn * charWidth)`, spanning the selected column range.

## 7. API Specification

### 7.1 createUnifiedDiffMultiBuffer

```typescript
function createUnifiedDiffMultiBuffer(
  oldBuffer: Buffer,
  newBuffer: Buffer,
  options?: DiffOptions & UnifiedDiffMultiBufferOptions
): UnifiedDiffMultiBufferResult;

interface UnifiedDiffMultiBufferOptions {
  /** Make equal (context) lines editable. Default: true. */
  editableEqual?: boolean;
  /** Make insert lines editable. Default: true. */
  editableInsert?: boolean;
  /** Enable intraline (character-level) highlighting. Default: true. */
  intraline?: boolean;
  intralineOptions?: IntralineDiffOptions;
  /** Show separator lines between non-adjacent hunks. Default: true. */
  showHunkSeparators?: boolean;
}

interface UnifiedDiffMultiBufferResult {
  readonly multiBuffer: MultiBuffer;
  readonly decorations: readonly Decoration[];
  readonly isEqual: boolean;
  /** Present only when separator lines were generated; retain to prevent GC. */
  readonly separatorBuffer?: Buffer;
}
```

### 7.2 createDiffController

```typescript
function createDiffController(
  oldBuffer: Buffer,
  newBuffer: Buffer,
  options?: DiffControllerOptions
): DiffController;

interface DiffControllerOptions extends DiffOptions, UnifiedDiffMultiBufferOptions {
  /** Debounce delay in milliseconds. Default: 150. */
  debounceMs?: number;
  /** Force every excerpt non-editable, for read-only viewers. Default: false. */
  readOnly?: boolean;
}

interface DiffController {
  readonly multiBuffer: MultiBuffer;
  readonly decorations: readonly Decoration[];
  readonly isEqual: boolean;
  readonly oldBuffer: Buffer;
  readonly newBuffer: Buffer;

  reDiff(): boolean;
  notifyChange(): void;
  onUpdate(callback: (decorations: readonly Decoration[]) => void): () => void;
  dispose(): void;
}
```

### 7.3 Measurements (extended)

```typescript
interface Measurements {
  readonly lineHeight: number;
  readonly charWidth?: number;
  readonly gutterWidth: number;
  readonly wrapWidth?: number;
  /** Gutter mode: "standard" (default) or "diff" (dual line numbers). */
  readonly gutterMode?: "standard" | "diff";
}
```

## 8. Testing Requirements

**Diff algorithm**: empty inputs (both, either, neither); identical inputs → `isEqual: true`; single-line change mid-file; multi-line contiguous delete and insert; interleaved changes; changes at file start and end; context merging within `2 * context` and separation beyond it.

**Diff MultiBuffer**: excerpt count matches the expected grouping, with correct source buffer, editable flag, and total line count; decoration ranges match excerpt boundaries and styles match line kind; intraline decorations cover the differing character ranges only.

**DiffController**: `reDiff()` updates decorations; `notifyChange()` debounces; subscribers fire after re-diff; convergence collapses a pair and divergence creates one; cursor survives re-diff; `dispose()` clears timers.

**Renderer (E2E)**: correct old/new line numbers per line kind; "−" on deletes, "+" on inserts, none on equal lines; background colors applied; hunk separators render full-width without line numbers; hit testing and selection account for the diff gutter width.

## 9. Performance Requirements

- Diff calculation: <10ms for files under 10K lines with scattered changes.
- Excerpt rebuild: <5ms for typical diff results.
- Re-render after re-diff: <16ms (one frame).
- Memory: No per-line allocations; reuse excerpt objects where possible.

## 10. Deferred Features

Out of scope: **hunk folding** (needs excerpt expand/collapse; multi-file diff collapses whole files, not hunks) and **three-way merge** (needs a significantly different architecture).

**Undo** is supported — the editor's undo stack operates on the new buffer independently of diff state.
