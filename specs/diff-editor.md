# Diff Editor Specification

Status: Draft v1

Purpose: Define a diff viewing and editing component built on the MultiBuffer architecture.

## 1. Problem Statement

The diff editor solves the problem of viewing and editing differences between two versions of a file within a unified, scrollable interface. Unlike traditional side-by-side or read-only unified diffs, this component allows direct editing of the "new" version while maintaining accurate diff visualization.

The system must display deleted lines (from old) interleaved with inserted/modified lines (from new) in a unified view, allow editing of insert and equal lines while keeping delete lines read-only, update the diff live as edits change the old/new relationship, and preserve the user's editing position through diff recalculations.

## 2. Goals and Non-Goals

### 2.1 Goals

Display a unified diff between two buffers with proper line-number attribution, rendering delete lines as read-only excerpts from the old buffer and insert/equal lines as editable excerpts from the new buffer. Apply visual decorations (background colors, gutter signs) to distinguish line types, and support a dual-gutter mode showing old line numbers, new line numbers, and diff signs. Preserve cursor position through excerpt rebuilds via the anchor system, and debounce re-diff calculations to avoid excessive computation during rapid editing. Support convergence (edits making new text match old collapse delete+insert pairs to equal) and divergence (edits making equal text differ from old produce new delete+insert pairs).

### 2.2 Non-Goals

Side-by-side diff view (unified only), word- or character-level highlighting within lines, three-way merge visualization, syntax-aware diffing (we diff by lines, not AST), diff folding or hunk collapsing, and git integration (this is a pure text diff component).

## 3. System Overview

### 3.1 Main Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Diff Algorithm | `src/diff/diff.ts` | Myers' O(ND) line-level diff; groups edits into hunks with configurable context; returns `DiffResult` with hunks and `isEqual`. |
| Diff MultiBuffer Builder | `src/diff/multibuffer.ts` | Runs the diff on old/new `Buffer` text, constructs a `MultiBuffer` with excerpts from the appropriate source buffers, and generates `Decoration[]`. |
| Diff Controller | `src/diff/controller.ts` | Wraps the diff MultiBuffer with change detection; `notifyChange()` debounces and triggers re-diff, notifying subscribers when decorations update. |
| Diff Gutter Renderer | `src/renderer/dom.ts` | When `gutterMode: "diff"`, renders dual line-number columns plus sign character and applies decoration styles to gutter elements. |
| Editor | `src/editor/editor.ts` | Handles editing operations, respects the `editable` flag on excerpts (rejecting edits to non-editable ones), and fires `onChange` after mutations. |

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

When the user edits, the editor modifies the new buffer via `MultiBuffer.edit()` and fires `onChange`, which the diff controller receives as `notifyChange()`. After the debounce delay, the controller reads current text from both buffers, runs `diff()` for new hunks, rebuilds the MultiBuffer excerpts, regenerates decorations, and notifies subscribers.

### 3.3 External Dependencies

`Buffer` (mutable text storage with version tracking and edit log), `MultiBuffer` (collection of excerpts supporting mixed editability), `Editor` (command dispatcher for cursor movement and text editing), and `DomRenderer` (DOM renderer with gutter mode support).

## 4. Core Domain Model

### 4.1 Entities

#### 4.1.1 DiffLine

A single line in the diff output: `kind` (`"equal" | "insert" | "delete"`), `text` (string, content without trailing newline), `oldRow` (number | undefined; 0-based old-buffer line, undefined for inserts), and `newRow` (number | undefined; 0-based new-buffer line, undefined for deletes).

#### 4.1.2 DiffHunk

A contiguous group of diff lines with shared context, analogous to a unified diff hunk: `oldStart`/`oldCount` (start line and line count in the old buffer), `newStart`/`newCount` (same for the new buffer), and `lines` (readonly `DiffLine[]`, including context).

#### 4.1.3 DiffResult

Complete diff output: `hunks` (readonly `DiffHunk[]`) and `isEqual` (boolean, true if old and new text are identical).

#### 4.1.4 Decoration

Visual styling applied to a range of text: `range` (`MultiBufferRange`, the rows affected) and `style` (`Partial<DecorationStyle>`; backgroundColor, gutterSign, gutterSignColor, etc.).

#### 4.1.5 DecorationStyle

All visual properties for a decorated line: `backgroundColor`, `color`, `borderColor`, `fontWeight` (`"normal" | "bold"`), `fontStyle` (`"normal" | "italic"`), `textDecoration` (`"none" | "underline" | "line-through"`), `gutterBackground`, `gutterColor` (line-number text), `gutterSign` (e.g. "+", "−"), and `gutterSignColor`.

#### 4.1.6 DiffController

Controller for a diff view with re-diff-on-edit support. See the interface in §7.2.

### 4.2 Excerpt Structure

The diff MultiBuffer contains excerpts in display order:

| Line Kind | Source Buffer | Editable | Gutter Sign |
|-----------|---------------|----------|-------------|
| delete    | old           | false    | "−"         |
| insert    | new           | true     | "+"         |
| equal     | new           | configurable | (none)  |

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

**Standard Mode** (`gutterMode: undefined | "standard"`): a single gutter column showing the MultiBuffer row number, width `gutterWidth` from Measurements.

**Diff Mode** (`gutterMode: "diff"`): three fixed columns — old line number (40px) | new line number (40px) | sign (16px), 96px total — with per-kind display following the rules below.

| Line Kind | Old Gutter | New Gutter | Sign |
|-----------|------------|------------|------|
| equal     | oldRow+1   | newRow+1   | " "  |
| delete    | oldRow+1   | (empty)    | "−"  |
| insert    | (empty)    | newRow+1   | "+"  |

## 5. Behavioral Specification

### 5.1 Diff Calculation

**Input**: Two text strings (old and new).

**Algorithm**: Myers' diff with configurable context.

**Context handling**: default 3 lines before and after each change; adjacent changes within `2 * context` lines merge into one hunk; lines outside any hunk's context window are excluded from the view.

**Edge cases**: empty old + empty new → `isEqual = true`, no excerpts; empty old + non-empty new → all inserts; non-empty old + empty new → all deletes; identical texts → `isEqual = true`, single excerpt from the new buffer (if non-empty).

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

**Allowed**: insert and equal lines (from the new buffer) are editable; the cursor can move through delete lines but cannot modify them.

**Rejected**: any edit targeting a non-editable excerpt, and any cross-excerpt edit spanning editable and non-editable regions.

### 5.4 Live Re-Diff

**Trigger**: `notifyChange()` called (typically from editor's onChange).

**Debounce**: Default 150ms. Configurable via `debounceMs` option.

**Process**: cancel any pending re-diff timer and schedule a new one after the debounce delay. On fire, read current text from both buffers, run `diff()`, remove all existing excerpts, build new excerpts from the result, regenerate decorations, and notify all subscribers.

### 5.5 Convergence and Divergence

**Convergence** (edit makes insert match delete): the delete+insert pair collapses to a single equal line — the delete excerpt is removed, the insert excerpt becomes equal, and the MultiBuffer line count decreases.

Example:
```
Before: delete "foo" + insert "bar"  →  2 lines, 2 excerpts
Edit: change "bar" to "foo"
After: equal "foo"  →  1 line, 1 excerpt
```

**Divergence** (edit makes equal differ from old): the equal excerpt splits into a delete (from old) + insert (from new) pair, and the MultiBuffer line count increases.

Example:
```
Before: equal "foo"  →  1 line, 1 excerpt
Edit: change "foo" to "bar"
After: delete "foo" + insert "bar"  →  2 lines, 2 excerpts
```

### 5.6 Cursor Preservation

The MultiBuffer's anchor system handles cursor preservation: the editor creates anchors (excerpt ID + buffer offset + version) at the cursor before operations; when excerpts are rebuilt, the replacement map tracks old→new ID mappings; `resolveAnchor()` follows the replacement chain and adjusts for buffer edits; and the cursor position is restored after re-diff.

**Edge cases**: a cursor on a delete line that disappears (convergence) moves to the resulting equal line; a cursor on an equal line that diverges moves to the insert line (the editable one).

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

## 6. Rendering Specification

### 6.1 Excerpt Headers

Excerpt headers must NOT be shown in diff mode — the unified view spans two files, so showing file paths at every hunk boundary is wrong. Skip header rendering when `gutterMode === "diff"`, or expose a `showExcerptHeaders: boolean` option.

### 6.2 Diff Gutter Layout

In diff mode, each line row contains:

```
┌──────────────────────────────────────────────────────────┐
│ [old#] │ [new#] │ [±] │ [content........................]│
│  40px  │  40px  │16px │  flex: 1                        │
└──────────────────────────────────────────────────────────┘
```

Old and new line numbers are right-aligned with 4px right padding, the sign is a centered fixed character ("+", "−", or space), and content uses the remaining width with horizontal scroll if needed.

### 6.3 Hit Testing

In diff mode, `hitTest(x, y)` must account for the wider gutter: effective width = 40 + 40 + 16 = 96px, content starts at x = 96px, and the column is `(x - 96) / charWidth`.

### 6.4 Selection Rendering

Selection rectangles must also account for the diff gutter width: x-start = 96 + (startColumn * charWidth), with width spanning the selected column range.

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
}

interface UnifiedDiffMultiBufferResult {
  readonly multiBuffer: MultiBuffer;
  readonly decorations: readonly Decoration[];
  readonly isEqual: boolean;
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

### 8.1 Diff Algorithm Tests

Empty inputs (both/one/neither empty); identical inputs → `isEqual: true`; single-line change mid-file; multi-line contiguous delete and insert; interleaved changes; change at file start/end; context-line merging (within 2*context) and separation (beyond 2*context).

### 8.2 Diff MultiBuffer Tests

Excerpt count matches expected grouping; excerpt source buffers (old vs new) and editable flags correct; decoration ranges match excerpt boundaries; decoration styles correct per line kind; total line count correct.

### 8.3 DiffController Tests

`reDiff()` updates decorations; `notifyChange()` debounces correctly; subscribers receive updates after re-diff; convergence collapses a pair and divergence creates one; cursor preserved through re-diff; `dispose()` cleans up timers.

### 8.4 Renderer Tests (E2E)

Diff gutter shows correct line numbers; delete/insert/equal lines show "−"/"+"/no sign; background colors applied correctly; no excerpt headers in diff mode; hit testing and selection rendering account for the diff gutter width.

## 9. Performance Requirements

Diff calculation <10ms for files under 10K lines with scattered changes; excerpt rebuild <5ms for typical results; re-render after re-diff <16ms (one frame); no per-line allocations, reusing excerpt objects where possible.

## 10. Deferred Features

Word-level highlighting (addable as a decoration extension), hunk folding (requires excerpt expand/collapse support), and three-way merge (requires a significantly different architecture) are out of scope for v1. Undo is supported — the editor's undo stack operates on the new buffer independently of diff state.
