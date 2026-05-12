# Diff Editor Specification

Status: Draft v1

Purpose: Define a diff viewing and editing component built on the MultiBuffer architecture.

## 1. Problem Statement

The diff editor solves the problem of viewing and editing differences between two versions of a file within a unified, scrollable interface. Unlike traditional side-by-side or read-only unified diffs, this component allows direct editing of the "new" version while maintaining accurate diff visualization.

The system must handle visualization (deleted lines from old interleaved with inserted/modified lines from new in a unified view), editing (insert/equal lines from the new buffer are editable while delete lines stay read-only), live updates when edits change the old/new relationship, and cursor preservation through diff recalculations.

## 2. Goals and Non-Goals

### 2.1 Goals

Display a unified diff between two buffers with proper line-number attribution. Render delete lines as read-only excerpts from the old buffer and insert/equal lines as editable excerpts from the new buffer. Apply visual decorations (background colors, gutter signs) to distinguish line types, and support a dual-gutter mode showing old line numbers, new line numbers, and diff signs. Preserve cursor position through excerpt rebuilds via the anchor system, and debounce re-diff to avoid excessive computation during rapid editing. Support convergence (edits that make new text match old collapse delete+insert pairs to equal) and divergence (edits that make equal text differ from old create new delete+insert pairs).

### 2.2 Non-Goals

Side-by-side view, word/character-level highlighting, three-way merge, syntax-aware diffing (we diff by lines), hunk folding/collapsing, and git integration are all out of scope.

## 3. System Overview

### 3.1 Main Components

| Component | File | Responsibility |
|-----------|------|----------------|
| Diff Algorithm | `src/diff/diff.ts` | Myers' O(ND) line-level diff; groups edits into hunks with configurable context; returns `DiffResult` with hunks and `isEqual`. |
| Diff MultiBuffer Builder | `src/diff/multibuffer.ts` | Takes old/new `Buffer`s, runs diff, builds a `MultiBuffer` with excerpts from the appropriate source, generates `Decoration[]`. |
| Diff Controller | `src/diff/controller.ts` | Wraps the diff MultiBuffer; `notifyChange()` debounces and triggers re-diff; notifies subscribers when decorations update. |
| Diff Gutter Renderer | `src/renderer/dom.ts` | When `gutterMode: "diff"`, renders dual line-number columns + sign and applies decoration styles to gutter elements. |
| Editor | `src/editor/editor.ts` | Dispatches edits, respects excerpt `editable` flags, fires `onChange` after mutations. |

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

When user edits:
1. Editor modifies the new buffer via `MultiBuffer.edit()`.
2. Editor fires `onChange` callback.
3. Diff controller receives `notifyChange()`.
4. After debounce delay, controller:
   - Reads current text from both buffers.
   - Runs `diff()` to get new hunks.
   - Rebuilds excerpts in the MultiBuffer.
   - Regenerates decorations.
   - Notifies subscribers.

### 3.3 External Dependencies

`Buffer` (mutable text storage with version tracking and edit log), `MultiBuffer` (excerpt collection with mixed editability), `Editor` (cursor/edit command dispatcher), and `DomRenderer` (gutter-mode-aware DOM renderer).

## 4. Core Domain Model

### 4.1 Entities

#### 4.1.1 DiffLine

A single line in the diff output. Fields: `kind` (`"equal" | "insert" | "delete"`), `text` (line content without trailing newline), `oldRow` (0-based, undefined for inserts), `newRow` (0-based, undefined for deletes).

#### 4.1.2 DiffHunk

A contiguous group of diff lines with shared context (analogous to a unified-diff hunk). Fields: `oldStart`, `oldCount`, `newStart`, `newCount`, and `lines` (readonly `DiffLine[]`, including context).

#### 4.1.3 DiffResult

Complete diff output. Fields: `hunks` (readonly `DiffHunk[]`) and `isEqual` (true when old and new texts are identical).

#### 4.1.4 Decoration

Visual styling applied to a range. Fields: `range` (`MultiBufferRange`) and `style` (`Partial<DecorationStyle>`).

#### 4.1.5 DecorationStyle

Visual properties for a decorated line: `backgroundColor`, `color`, `borderColor`, `fontWeight` (`"normal" | "bold"`), `fontStyle` (`"normal" | "italic"`), `textDecoration` (`"none" | "underline" | "line-through"`), `gutterBackground`, `gutterColor`, `gutterSign` (e.g., `"+"`, `"−"`), `gutterSignColor`.

#### 4.1.6 DiffController

See §7.2 for the controller interface.

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

Single gutter column showing the MultiBuffer row number; width comes from `Measurements.gutterWidth`.

#### Diff Mode (`gutterMode: "diff"`)

Three fixed-width columns — old line number (40px), new line number (40px), sign (16px), totaling 96px. The old number is shown for equal and delete lines, the new number for equal and insert lines, and the sign is `"+"`, `"−"`, or a space.

Line number display rules:

| Line Kind | Old Gutter | New Gutter | Sign |
|-----------|------------|------------|------|
| equal     | oldRow+1   | newRow+1   | " "  |
| delete    | oldRow+1   | (empty)    | "−"  |
| insert    | (empty)    | newRow+1   | "+"  |

## 5. Behavioral Specification

### 5.1 Diff Calculation

**Input**: Two text strings (old and new).

**Algorithm**: Myers' diff with configurable context.

**Context handling**: Default 3 lines before/after each change; adjacent changes within `2 * context` merge into one hunk; lines outside any hunk's context window are excluded.

**Edge cases**: Both empty → `isEqual: true`, no excerpts. Empty old → all inserts. Empty new → all deletes. Identical texts → `isEqual: true`, single excerpt from new buffer (if non-empty).

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

Insert and equal lines (from new buffer) are editable; the cursor can traverse delete lines but cannot modify them. Edits targeting a non-editable excerpt, or cross-excerpt edits spanning editable and non-editable regions, are rejected.

### 5.4 Live Re-Diff

**Trigger**: `notifyChange()` called (typically from editor's onChange).

**Debounce**: Default 150ms. Configurable via `debounceMs` option.

**Process**: Cancel any pending timer, schedule a new re-diff after the debounce delay; on fire, read current text from both buffers, run `diff()`, replace all excerpts, regenerate decorations, and notify subscribers.

### 5.5 Convergence and Divergence

**Convergence** (edit makes insert match delete):

When user edits an insert line to match the corresponding delete line:
- The delete+insert pair should collapse to a single equal line.
- Line count in MultiBuffer decreases.
- The delete excerpt is removed.
- The insert excerpt becomes an equal excerpt.

Example:
```
Before: delete "foo" + insert "bar"  →  2 lines, 2 excerpts
Edit: change "bar" to "foo"
After: equal "foo"  →  1 line, 1 excerpt
```

**Divergence** (edit makes equal differ from old):

When user edits an equal line to no longer match the old text:
- A new delete+insert pair appears.
- Line count in MultiBuffer increases.
- The equal excerpt splits into delete (from old) + insert (from new).

Example:
```
Before: equal "foo"  →  1 line, 1 excerpt
Edit: change "foo" to "bar"
After: delete "foo" + insert "bar"  →  2 lines, 2 excerpts
```

### 5.6 Cursor Preservation

The MultiBuffer's anchor system handles cursor preservation: the editor creates anchors at the cursor position before operations (referencing excerpt ID + buffer offset + version); when excerpts are rebuilt, a replacement map tracks old→new ID mappings; `resolveAnchor()` follows the replacement chain and adjusts for buffer edits, restoring the cursor after re-diff.

**Edge cases**: A cursor on a disappearing delete line (convergence) moves to the resulting equal line; a cursor on a diverging equal line moves to the new insert line (the editable one).

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

In diff mode, each row contains four columns:

```
┌──────────────────────────────────────────────────────────┐
│ [old#] │ [new#] │ [±] │ [content........................]│
│  40px  │  40px  │16px │  flex: 1                        │
└──────────────────────────────────────────────────────────┘
```

Old and new line numbers are right-aligned with 4px right padding; the sign is a centered fixed character (`"+"`, `"−"`, or space); content takes the remaining width and scrolls horizontally if needed.

### 6.3 Hit Testing

In diff mode, `hitTest(x, y)` accounts for the wider 96px gutter (40 + 40 + 16): content starts at `x = 96` and column = `(x - 96) / charWidth`.

### 6.4 Selection Rendering

Selection rectangles also offset by the diff gutter: x-start = `96 + (startColumn * charWidth)`, width spans the selected column range.

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

Empty inputs (both empty, one empty, neither empty), identical inputs returning `isEqual: true`, single-line changes mid-file, multi-line contiguous delete/insert, interleaved changes, changes at file start/end, and context merging vs. separation around the `2 * context` boundary.

### 8.2 Diff MultiBuffer Tests

Excerpt count matches expected grouping; source buffers and editable flags are correct; decoration ranges align with excerpt boundaries; decoration styles match line kind; total line count is correct.

### 8.3 DiffController Tests

`reDiff()` updates decorations; `notifyChange()` debounces correctly; subscribers receive updates; convergence collapses pairs; divergence creates new pairs; cursor survives re-diff; `dispose()` cleans up timers.

### 8.4 Renderer Tests (E2E)

Diff gutter shows correct line numbers and signs (`"−"` for delete, `"+"` for insert, none for equal); backgrounds apply correctly; no excerpt headers render in diff mode; hit testing and selection rendering account for the diff gutter width.

## 9. Performance Requirements

Diff calculation: <10ms for files under 10K lines with scattered changes. Excerpt rebuild: <5ms typical. Re-render after re-diff: <16ms (one frame). Memory: no per-line allocations; reuse excerpt objects where possible.

## 10. Deferred Features

Word-level highlighting (addable as a decoration extension), hunk folding (requires excerpt expand/collapse), and three-way merge (different architecture) are out of scope for v1. Undo is supported — the editor's undo stack operates on the new buffer independently of diff state.
