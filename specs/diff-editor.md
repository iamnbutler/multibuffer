# Diff Editor Specification

Status: Draft v1

Purpose: Define a diff viewing and editing component built on the MultiBuffer architecture.

## 1. Problem Statement

The diff editor solves the problem of viewing and editing differences between two versions of a file within a unified, scrollable interface. Unlike traditional side-by-side or read-only unified diffs, this component allows direct editing of the "new" version while maintaining accurate diff visualization.

The system must handle visualization (deleted lines interleaved with inserted/modified lines in a unified view), editing (insert and equal lines from the new buffer are mutable; delete lines stay read-only), live updates as edits change the old/new relationship, and cursor preservation across diff recalculations.

## 2. Goals and Non-Goals

### 2.1 Goals

Display a unified diff between two buffers with proper line-number attribution: delete lines as read-only excerpts from the old buffer; insert and equal lines as editable excerpts from the new buffer; visual decorations (background colors, gutter signs) to distinguish line types; a dual-gutter mode showing old line numbers, new line numbers, and diff signs. Preserve cursor position through excerpt rebuilds via the anchor system. Debounce re-diff calculations during rapid editing. Support convergence (delete+insert pairs collapse to equal when edits make new match old) and divergence (new delete+insert pairs appear when edits make equal differ from old).

### 2.2 Non-Goals

Side-by-side diff view (unified only), word- or character-level diff highlighting within lines, three-way merge, syntax-aware diffing (lines only, not AST), diff folding or hunk collapsing, and git integration (pure text diff).

## 3. System Overview

### 3.1 Main Components

| Component | File | Role |
|-----------|------|------|
| Diff Algorithm | `src/diff/diff.ts` | Myers' O(ND) line-level diff; groups edits into hunks with configurable context; returns `DiffResult` (hunks + `isEqual`). |
| Diff MultiBuffer Builder | `src/diff/multibuffer.ts` | Runs diff on old/new `Buffer` text; constructs a `MultiBuffer` with excerpts from the correct source buffers; generates `Decoration[]`. |
| Diff Controller | `src/diff/controller.ts` | Wraps the diff MultiBuffer with change detection; `notifyChange()` debounces and triggers re-diff; notifies subscribers on decoration updates. |
| Diff Gutter Renderer | `src/renderer/dom.ts` | When `gutterMode: "diff"`, renders dual line-number columns with sign character and applies decoration styles. |
| Editor | `src/editor/editor.ts` | Existing editor respects the `editable` flag on excerpts and fires `onChange` after mutations. |

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

When the user edits: the editor modifies the new buffer via `MultiBuffer.edit()` and fires `onChange`; the diff controller receives `notifyChange()`; after the debounce delay the controller reads current text from both buffers, runs `diff()`, rebuilds excerpts, regenerates decorations, and notifies subscribers.

### 3.3 External Dependencies

`Buffer` (mutable text storage with version tracking and edit log), `MultiBuffer` (excerpt collection supporting mixed editability), `Editor` (command dispatcher for cursor and text edits), and `DomRenderer` (DOM renderer with gutter mode support).

## 4. Core Domain Model

### 4.1 Entities

#### 4.1.1 DiffLine

A single line in the diff output. Fields: `kind` (`"equal" | "insert" | "delete"`), `text` (line content without trailing newline), `oldRow` (0-based, undefined for inserts), `newRow` (0-based, undefined for deletes).

#### 4.1.2 DiffHunk

A contiguous group of diff lines with shared context, analogous to a unified diff hunk. Fields: `oldStart`/`oldCount` (range in old buffer), `newStart`/`newCount` (range in new buffer), `lines` (readonly `DiffLine[]` including context).

#### 4.1.3 DiffResult

Complete diff output. Fields: `hunks` (readonly `DiffHunk[]`), `isEqual` (true if old and new are identical).

#### 4.1.4 Decoration

Visual styling for a range: `range` (MultiBufferRange) and `style` (`Partial<DecorationStyle>` — backgroundColor, gutterSign, gutterSignColor, etc.).

#### 4.1.5 DecorationStyle

Visual properties for a decorated line: `backgroundColor`, `color`, `borderColor`, `fontWeight` (`"normal" | "bold"`), `fontStyle` (`"normal" | "italic"`), `textDecoration` (`"none" | "underline" | "line-through"`), `gutterBackground`, `gutterColor`, `gutterSign` (e.g. `"+"`, `"−"`), `gutterSignColor`.

#### 4.1.6 DiffController

Controller for a diff view with re-diff on edit support. See §7.2 for the full interface.

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

#### Standard Mode (`gutterMode: undefined | "standard"`)

Single gutter column showing the MultiBuffer row number. Width comes from `gutterWidth` in Measurements.

#### Diff Mode (`gutterMode: "diff"`)

Three columns — old line number, new line number, sign — with fixed widths 40 + 40 + 16 = 96px. Old number renders for equal/delete lines, new number for equal/insert lines, sign for "+", "−", or space.

Line number display rules:

| Line Kind | Old Gutter | New Gutter | Sign |
|-----------|------------|------------|------|
| equal     | oldRow+1   | newRow+1   | " "  |
| delete    | oldRow+1   | (empty)    | "−"  |
| insert    | (empty)    | newRow+1   | "+"  |

## 5. Behavioral Specification

### 5.1 Diff Calculation

**Input**: Two text strings (old and new). **Algorithm**: Myers' diff with configurable context.

**Context handling**: default 3 lines before and after each change; adjacent changes within `2 * context` lines merge into one hunk; lines outside any hunk's context window are excluded from the view.

**Edge cases**: both empty → `isEqual = true`, no excerpts; empty old + non-empty new → all inserts; non-empty old + empty new → all deletes; identical texts → `isEqual = true` with a single excerpt from the new buffer (if non-empty).

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

Insert and equal lines (from the new buffer) are editable; cursors can move through delete lines but cannot modify them. Edits targeting a non-editable excerpt, or spanning editable and non-editable regions, are rejected.

### 5.4 Live Re-Diff

Triggered by `notifyChange()` (typically from the editor's `onChange`). Default debounce is 150ms (`debounceMs` option). On each call, any pending timer is cancelled and a new one is scheduled. When it fires, the controller reads current text from both buffers, runs `diff()`, removes existing excerpts, builds new ones from the result, regenerates decorations, and notifies subscribers.

### 5.5 Convergence and Divergence

**Convergence** (edit makes insert match delete): the delete+insert pair collapses to a single equal line — the delete excerpt is removed, the insert excerpt becomes an equal excerpt, and the MultiBuffer line count decreases.

```
Before: delete "foo" + insert "bar"  →  2 lines, 2 excerpts
Edit: change "bar" to "foo"
After: equal "foo"  →  1 line, 1 excerpt
```

**Divergence** (edit makes equal differ from old): the equal excerpt splits into delete (from old) + insert (from new), and the line count increases.

```
Before: equal "foo"  →  1 line, 1 excerpt
Edit: change "foo" to "bar"
After: delete "foo" + insert "bar"  →  2 lines, 2 excerpts
```

### 5.6 Cursor Preservation

The MultiBuffer's anchor system handles cursor preservation: the editor creates anchors (excerpt ID + buffer offset + version) before operations; when excerpts are rebuilt, a replacement map tracks old→new ID mappings; `resolveAnchor()` follows the replacement chain and adjusts for buffer edits, restoring the cursor after re-diff.

**Edge cases**: a cursor on a delete line that disappears (convergence) moves to the resulting equal line; a cursor on an equal line that diverges moves to the (editable) insert line.

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

Old and new line numbers are right-aligned with 4px right padding; the sign character ("+", "−", or space) is centered; content uses the remaining width with horizontal scroll if needed.

### 6.3 Hit Testing

In diff mode, `hitTest(x, y)` accounts for the wider gutter: effective gutter width is 40 + 40 + 16 = 96px, content starts at x = 96, and column calculation uses `(x - 96) / charWidth`.

### 6.4 Selection Rendering

Selection rectangles also account for the diff gutter: x-start = 96 + (startColumn * charWidth); width spans the selected column range.

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

Cover empty inputs (both, one, neither), identical inputs (`isEqual: true`), single-line changes mid-file, multi-line contiguous deletes and inserts, interleaved changes, changes at file start/end, and context handling (merging within `2*context` and separation beyond it).

### 8.2 Diff MultiBuffer Tests

Verify excerpt count matches expected grouping; source buffers (old vs new) and editable flags are correct; decoration ranges match excerpt boundaries with the right style per line kind; total line count is correct.

### 8.3 DiffController Tests

Verify `reDiff()` updates decorations; `notifyChange()` debounces correctly; subscribers receive updates after re-diff; convergence collapses pairs; divergence creates new pairs; cursor is preserved through re-diff; `dispose()` cleans up timers.

### 8.4 Renderer Tests (E2E)

Verify the diff gutter shows correct line numbers and signs ("−" for delete, "+" for insert, none for equal); background colors apply; excerpt headers are hidden in diff mode; hit testing and selection rendering account for diff gutter width.

## 9. Performance Requirements

Diff calculation under 10ms for files under 10K lines with scattered changes; excerpt rebuild under 5ms for typical diffs; re-render after re-diff under 16ms (one frame); no per-line allocations — reuse excerpt objects where possible.

## 10. Deferred Features

Word-level highlighting (can be added as a decoration extension), hunk folding (requires excerpt expand/collapse support), and three-way merge (requires significantly different architecture) are all out of scope for v1. Undo is supported: the editor's undo stack operates on the new buffer independently of diff state.
