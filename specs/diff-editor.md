# Diff Editor Specification

Status: Draft v1

Purpose: Define a diff viewing and editing component built on the MultiBuffer architecture.

## 1. Problem Statement

The diff editor solves the problem of viewing and editing differences between two versions of a file within a unified, scrollable interface. Unlike traditional side-by-side or read-only unified diffs, this component allows direct editing of the "new" version while maintaining accurate diff visualization.

The system must display deleted lines (from the old version) interleaved with inserted/modified lines (from the new version) in a unified view, allow editing of insert and equal lines (from the new buffer) while keeping delete lines read-only, update the diff when edits change the relationship between old and new text, and preserve the user's editing position across diff recalculations.

## 2. Goals and Non-Goals

### 2.1 Goals

Display a unified diff between two buffers with proper line-number attribution: delete lines as read-only excerpts from the old buffer, insert and equal lines as editable excerpts from the new buffer, with visual decorations (background colors, gutter signs) distinguishing line types and a dual-gutter mode showing old line numbers, new line numbers, and diff signs. Preserve cursor position through excerpt rebuilds via the anchor system, and debounce re-diff calculations to avoid excessive computation during rapid editing. Support convergence (edits making new text match old collapse delete+insert pairs to equal) and divergence (edits making equal text differ from old produce new delete+insert pairs).

### 2.2 Non-Goals

Out of scope: side-by-side diff view (this spec covers unified view only), word- or character-level highlighting within lines, three-way merge visualization, syntax-aware diffing (we diff by lines, not by AST), diff folding or hunk collapsing, and git integration (this is a pure text diff component).

## 3. System Overview

### 3.1 Main Components

| Component | Location | Responsibility |
|-----------|----------|----------------|
| Diff Algorithm | `src/diff/diff.ts` | Myers' O(ND) line-level diff; groups edits into hunks with configurable context lines; returns `DiffResult` with hunks and `isEqual` flag. |
| Diff MultiBuffer Builder | `src/diff/multibuffer.ts` | Runs the diff on old/new `Buffer` text and constructs a `MultiBuffer` with excerpts from the appropriate source buffers, plus `Decoration[]` for styling. |
| Diff Controller | `src/diff/controller.ts` | Wraps the diff MultiBuffer with change detection; `notifyChange()` debounces and triggers re-diff; notifies subscribers when decorations update. |
| Diff Gutter Renderer | `src/renderer/dom.ts` | When `gutterMode: "diff"`, renders dual line-number columns (old #, new #, sign character) and applies decoration styles to gutter elements. |
| Editor | `src/editor/editor.ts` | Existing editor; respects the `editable` flag on excerpts (rejects edits to non-editable) and fires `onChange` after mutations. |

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

- `Buffer`: Mutable text storage with version tracking and edit log.
- `MultiBuffer`: Collection of excerpts supporting mixed editability.
- `Editor`: Command dispatcher for cursor movement and text editing.
- `DomRenderer`: DOM-based renderer with gutter mode support.

## 4. Core Domain Model

### 4.1 Entities

#### 4.1.1 DiffLine

A single line in the diff output. Fields: `kind` ("equal" | "insert" | "delete"), the type of change; `text` (string), the line content without trailing newline; `oldRow` (number | undefined), 0-based line number in the old buffer (undefined for insert lines); `newRow` (number | undefined), 0-based line number in the new buffer (undefined for delete lines).

#### 4.1.2 DiffHunk

A contiguous group of diff lines with shared context, analogous to a unified diff hunk. Fields: `oldStart` / `oldCount` (number), starting line and line count from the old buffer; `newStart` / `newCount` (number), the same for the new buffer; `lines` (readonly DiffLine[]), the lines in this hunk including context.

#### 4.1.3 DiffResult

Complete diff output. Fields: `hunks` (readonly DiffHunk[]), all hunks describing changes; `isEqual` (boolean), true if old and new text are identical.

#### 4.1.4 Decoration

Visual styling applied to a range of text. Fields: `range` (MultiBufferRange), the rows it applies to; `style` (Partial<DecorationStyle>), visual properties such as backgroundColor, gutterSign, and gutterSignColor.

#### 4.1.5 DecorationStyle

All visual properties for a decorated line. Line styling: `backgroundColor`, `color`, `borderColor` (string); `fontWeight` ("normal" | "bold"); `fontStyle` ("normal" | "italic"); `textDecoration` ("none" | "underline" | "line-through"). Gutter styling: `gutterBackground`, `gutterColor` (string); `gutterSign` (string), the sign character e.g. "+" or "−"; `gutterSignColor` (string).

#### 4.1.6 DiffController

Controller for a diff view with re-diff-on-edit support. See the `DiffController` interface in §7.2 for its fields and methods.

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

**Standard Mode** (`gutterMode: undefined | "standard"`): a single gutter column showing the MultiBuffer row number, with width `gutterWidth` from Measurements.

**Diff Mode** (`gutterMode: "diff"`): three columns — old line number | new line number | sign — at fixed widths 40px + 40px + 16px = 96px total, per the rules below.

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

**Context handling**:
- Default context: 3 lines before and after each change.
- Adjacent changes within `2 * context` lines merge into one hunk.
- Lines outside any hunk's context window are excluded from the view.

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

**Allowed edits**:
- Insert and equal lines (from new buffer) are editable.
- Cursor can move through delete lines but cannot modify them.

**Rejected edits**:
- Any edit targeting a non-editable excerpt is rejected.
- Cross-excerpt edits spanning editable and non-editable regions are rejected.

### 5.4 Live Re-Diff

**Trigger**: `notifyChange()` called (typically from editor's onChange).

**Debounce**: Default 150ms. Configurable via `debounceMs` option.

**Process**:
1. Cancel any pending re-diff timer.
2. Schedule new re-diff after debounce delay.
3. On timer fire:
   a. Get current text from old and new buffers.
   b. Run `diff()`.
   c. Remove all existing excerpts.
   d. Build new excerpts from diff result.
   e. Generate new decorations.
   f. Notify all subscribers.

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

- Old line number: right-aligned, 4px right padding.
- New line number: right-aligned, 4px right padding.
- Sign: centered, fixed character ("+", "−", or space).
- Content: uses remaining width, horizontal scroll if needed.

### 6.3 Hit Testing

In diff mode, `hitTest(x, y)` must account for the wider gutter:
- Effective gutter width = 40 + 40 + 16 = 96px.
- Content starts at x = 96px.
- Column calculation uses `(x - 96) / charWidth`.

### 6.4 Selection Rendering

Selection rectangles must also account for diff gutter width:
- Selection x-start = 96 + (startColumn * charWidth).
- Selection width spans the selected column range.

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

Cover empty inputs (both empty, one empty, neither empty), identical inputs (`isEqual: true`), a single-line change mid-file, multi-line contiguous delete and insert, interleaved changes, changes at file start/end, and context handling — merging changes within `2*context` and separating changes beyond it.

### 8.2 Diff MultiBuffer Tests

Verify excerpt count matches expected grouping, excerpt source buffers (old vs new) and editable flags are correct, decoration ranges match excerpt boundaries with styles correct for each line kind, and total line count is correct.

### 8.3 DiffController Tests

Verify `reDiff()` updates decorations, `notifyChange()` debounces correctly, subscribers receive updates after re-diff, convergence collapses a pair while divergence creates a new one, cursor is preserved through re-diff, and `dispose()` cleans up timers.

### 8.4 Renderer Tests (E2E)

Verify the diff gutter shows correct line numbers; delete/insert/equal lines show "−"/"+"/no sign; background colors are applied; no excerpt headers appear in diff mode; and hit testing and selection rendering account for the diff gutter width.

## 9. Performance Requirements

Diff calculation must stay under 10ms for files below 10K lines with scattered changes, excerpt rebuild under 5ms for typical diff results, and re-render after re-diff under 16ms (one frame). Avoid per-line allocations; reuse excerpt objects where possible.

## 10. Deferred Features

Word-level highlighting (addable later as a decoration extension), hunk folding (requires excerpt expand/collapse support), and three-way merge (requires a significantly different architecture) are out of scope for v1. Undo is supported — the editor's undo stack operates on the new buffer independently of diff state.
