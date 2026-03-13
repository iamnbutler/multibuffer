# Diff Editor Specification

Status: Draft v1

Purpose: Define a diff viewing and editing component built on the MultiBuffer architecture.

## 1. Problem Statement

The diff editor solves the problem of viewing and editing differences between two versions of a file within a unified, scrollable interface. Unlike traditional side-by-side or read-only unified diffs, this component allows direct editing of the "new" version while maintaining accurate diff visualization.

The system must handle:

- **Visualization**: Display deleted lines (from old version) interleaved with inserted/modified lines (from new version) in a unified view.
- **Editing**: Allow users to edit insert and equal lines (from the new buffer) while keeping delete lines read-only.
- **Live updates**: When edits change the relationship between old and new text, the diff must update accordingly.
- **Cursor preservation**: User's editing position must survive diff recalculations.

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
- Word-level or character-level diff highlighting within lines.
- Three-way merge visualization.
- Syntax-aware diffing (we diff by lines, not by AST).
- Diff folding or hunk collapsing.
- Git integration (this is a pure text diff component).

## 3. System Overview

### 3.1 Main Components

1. **Diff Algorithm** (`src/diff/diff.ts`)
   - Implements Myers' O(ND) line-level diff.
   - Groups edits into hunks with configurable context lines.
   - Returns `DiffResult` with hunks and `isEqual` flag.

2. **Diff MultiBuffer Builder** (`src/diff/multibuffer.ts`)
   - Takes old and new `Buffer` objects.
   - Runs diff algorithm on their text content.
   - Constructs a `MultiBuffer` with excerpts from appropriate source buffers.
   - Generates `Decoration[]` for visual styling.

3. **Live Diff Controller** (`src/diff/live-diff.ts`)
   - Wraps the diff MultiBuffer with change detection.
   - Provides `notifyChange()` for edit notifications.
   - Debounces and triggers re-diff on content changes.
   - Notifies subscribers when decorations update.

4. **Diff Gutter Renderer** (in `src/renderer/dom.ts`)
   - When `gutterMode: "diff"`, renders dual line number columns.
   - Displays old line number, new line number, and sign character.
   - Applies decoration styles to gutter elements.

5. **Editor** (`src/editor/editor.ts`)
   - Existing editor handles all editing operations.
   - Respects `editable` flag on excerpts (rejects edits to non-editable).
   - Fires `onChange` callback after mutations.

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
3. Live diff controller receives `notifyChange()`.
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

A single line in the diff output.

Fields:
- `kind` ("equal" | "insert" | "delete")
  - The type of change this line represents.
- `text` (string)
  - The line content without trailing newline.
- `oldRow` (number | undefined)
  - 0-based line number in old buffer. Undefined for insert lines.
- `newRow` (number | undefined)
  - 0-based line number in new buffer. Undefined for delete lines.

#### 4.1.2 DiffHunk

A contiguous group of diff lines with shared context. Analogous to a unified diff hunk.

Fields:
- `oldStart` (number)
  - Starting line number in old buffer.
- `oldCount` (number)
  - Number of lines from old buffer in this hunk.
- `newStart` (number)
  - Starting line number in new buffer.
- `newCount` (number)
  - Number of lines from new buffer in this hunk.
- `lines` (readonly DiffLine[])
  - The lines in this hunk, including context.

#### 4.1.3 DiffResult

Complete diff output.

Fields:
- `hunks` (readonly DiffHunk[])
  - All hunks describing changes.
- `isEqual` (boolean)
  - True if old and new text are identical.

#### 4.1.4 Decoration

Visual styling applied to a range of text.

Fields:
- `range` (MultiBufferRange)
  - The rows this decoration applies to.
- `style` (Partial<DecorationStyle>)
  - Visual properties: backgroundColor, gutterSign, gutterSignColor, etc.

#### 4.1.5 DecorationStyle

All visual properties for a decorated line.

Fields:
- `backgroundColor` (string) - Line background color.
- `color` (string) - Text color.
- `borderColor` (string) - Border color.
- `fontWeight` ("normal" | "bold") - Text weight.
- `fontStyle` ("normal" | "italic") - Text style.
- `textDecoration` ("none" | "underline" | "line-through") - Text decoration.
- `gutterBackground` (string) - Background for gutter area.
- `gutterColor` (string) - Text color for line numbers.
- `gutterSign` (string) - Sign character (e.g., "+", "−").
- `gutterSignColor` (string) - Color for the sign character.

#### 4.1.6 LiveDiffController

Controller for a live-updating diff view.

Interface:
- `multiBuffer` (MultiBuffer) - The underlying MultiBuffer.
- `decorations` (readonly Decoration[]) - Current decorations.
- `isEqual` (boolean) - Whether buffers are currently equal.
- `oldBuffer` (Buffer) - The baseline buffer.
- `newBuffer` (Buffer) - The editable buffer.
- `reDiff()` - Manually trigger re-diff. Returns new `isEqual` state.
- `notifyChange()` - Schedule debounced re-diff.
- `onUpdate(callback)` - Subscribe to decoration updates. Returns unsubscribe fn.
- `dispose()` - Clean up timers and subscriptions.

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
- Single gutter column showing MultiBuffer row number.
- Width: `gutterWidth` from Measurements.

#### Diff Mode (`gutterMode: "diff"`)
- Three columns: old line number | new line number | sign.
- Fixed widths: 40px + 40px + 16px = 96px total.
- Old line number shown for equal and delete lines.
- New line number shown for equal and insert lines.
- Sign shows "+", "−", or space.

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

**Problem**: The current implementation shows excerpt headers at every excerpt boundary, which creates visual clutter in diff views.

**Solution**: Excerpt headers should NOT be shown in diff mode. The diff is a unified view of two files; showing file paths between every hunk fragment is wrong.

**Implementation**:
- When `gutterMode === "diff"`, skip excerpt header rendering.
- Alternative: Provide an explicit `showExcerptHeaders: boolean` option.

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

### 7.2 createLiveDiff

```typescript
function createLiveDiff(
  oldBuffer: Buffer,
  newBuffer: Buffer,
  options?: LiveDiffOptions
): LiveDiffController;

interface LiveDiffOptions extends DiffOptions, UnifiedDiffMultiBufferOptions {
  /** Debounce delay in milliseconds. Default: 150. */
  debounceMs?: number;
}

interface LiveDiffController {
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

- Empty inputs (both empty, one empty, neither empty).
- Identical inputs → `isEqual: true`.
- Single-line change in middle of file.
- Multi-line contiguous delete.
- Multi-line contiguous insert.
- Interleaved changes.
- Change at file start/end.
- Context line merging (changes within 2*context).
- Context line separation (changes beyond 2*context).

### 8.2 Diff MultiBuffer Tests

- Excerpt count matches expected grouping.
- Excerpt source buffers (old vs new) correct.
- Excerpt editable flags correct.
- Decoration ranges match excerpt boundaries.
- Decoration styles correct for line kind.
- Total line count correct.

### 8.3 Live Diff Tests

- `reDiff()` updates decorations.
- `notifyChange()` debounces correctly.
- Subscribers receive updates after re-diff.
- Convergence: edit to match old collapses pair.
- Divergence: edit to differ creates new pair.
- Cursor preserved through re-diff.
- `dispose()` cleans up timers.

### 8.4 Renderer Tests (E2E)

- Diff gutter shows correct line numbers.
- Delete lines show "−" sign.
- Insert lines show "+" sign.
- Equal lines show no sign.
- Background colors applied correctly.
- No excerpt headers in diff mode.
- Hit testing works with diff gutter width.
- Selection rendering accounts for diff gutter.

## 9. Performance Requirements

- Diff calculation: <10ms for files under 10K lines with scattered changes.
- Excerpt rebuild: <5ms for typical diff results.
- Re-render after re-diff: <16ms (one frame).
- Memory: No per-line allocations; reuse excerpt objects where possible.

## 10. Open Questions

1. **Word-level highlighting**: Should we highlight changed words/characters within a line, not just the whole line?
   - Decision: Out of scope for v1. Can be added as decoration extension later.

2. **Hunk folding**: Should users be able to collapse unchanged context regions?
   - Decision: Out of scope for v1. Would require excerpt expand/collapse support.

3. **Three-way merge**: Should we support base/ours/theirs views?
   - Decision: Out of scope. Would require significantly different architecture.

4. **Undo behavior**: Should undo after convergence restore the original insert text?
   - Decision: Yes. The editor's undo stack operates on the new buffer independently of diff state.
