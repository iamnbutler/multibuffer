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

Display a unified diff between two buffers with per-line attribution. Delete lines are read-only excerpts from the old buffer; insert and equal lines are editable excerpts from the new buffer. Visual decorations (background colors, gutter signs) distinguish line types, and a dual-gutter mode shows old/new line numbers alongside diff signs. Cursor position is preserved through excerpt rebuilds, re-diffs are debounced, and the view handles convergence (delete+insert collapses to equal) and divergence (equal splits into delete+insert).

### 2.2 Non-Goals

Out of scope: side-by-side view, word/character-level highlighting, three-way merge, syntax-aware diffing (line-level only), hunk folding, and Git integration.

## 3. System Overview

### 3.1 Main Components

| Component | File | Responsibility |
|-----------|------|----------------|
| Diff Algorithm | `src/diff/diff.ts` | Myers' O(ND) line diff; groups hunks with configurable context; returns `DiffResult`. |
| Diff MultiBuffer Builder | `src/diff/multibuffer.ts` | Takes old/new buffers, runs diff, constructs `MultiBuffer` with excerpts and `Decoration[]`. |
| Diff Controller | `src/diff/controller.ts` | Wraps MultiBuffer; provides `notifyChange()`; debounces re-diffs; notifies subscribers. |
| Diff Gutter Renderer | `src/renderer/dom.ts` | In `gutterMode: "diff"`, renders dual line-number columns with decoration styles. |
| Editor | `src/editor/editor.ts` | Handles all editing; respects `editable` on excerpts; fires `onChange` after mutations. |

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

A single line in the diff output.

Fields: `kind` ("equal" | "insert" | "delete"), `text` (string, no trailing newline), `oldRow` (number | undefined, absent for inserts), `newRow` (number | undefined, absent for deletes).

#### 4.1.2 DiffHunk

A contiguous group of changed and context lines, analogous to a unified diff hunk (`@@ -a,b +c,d @@`).

Fields: `oldStart`, `oldCount`, `newStart`, `newCount` (line positions/counts in each buffer), `lines` (readonly DiffLine[], including context). Adjacent changes within `2 × context` lines are merged into one hunk.

#### 4.1.3 DiffResult

Complete diff output.

Fields: `hunks` (readonly DiffHunk[]) and `isEqual` (boolean — true when texts are identical).

#### 4.1.4 Decoration

Visual styling applied to a range of text.

Fields: `range` (MultiBufferRange) and `style` (Partial<DecorationStyle> — backgroundColor, gutterSign, gutterSignColor, etc.).

#### 4.1.5 DecorationStyle

All visual properties for a decorated line. Text fields: `backgroundColor`, `color`, `borderColor`, `fontWeight` ("normal" | "bold"), `fontStyle` ("normal" | "italic"), `textDecoration` ("none" | "underline" | "line-through"). Gutter fields: `gutterBackground`, `gutterColor`, `gutterSign` (e.g., "+", "−"), `gutterSignColor`. All are strings unless noted.

#### 4.1.6 DiffController

Controller for a live diff view. See full interface in [§7.2 createDiffController](#72-creatediffcontroller).

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

Insert and equal lines (from the new buffer) are editable; delete lines permit cursor movement but reject modifications. Edits targeting non-editable excerpts or spanning editable and non-editable regions are rejected.

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

The MultiBuffer's anchor system handles cursor preservation: before re-diff, anchors record cursor position (excerpt ID + buffer offset + version); when excerpts are rebuilt, the replacement map tracks old→new ID mappings so `resolveAnchor()` can follow the chain and restore position.

On convergence (cursor on a delete line that disappears), the cursor moves to the equal line. On divergence (cursor on an equal line that splits), it moves to the insert line.

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

Cover: both/one/neither empty inputs, identical (isEqual: true), single-line/multi-line/interleaved changes, start/end of file, context-line merging (within 2×context), and separation (beyond 2×context).

### 8.2 Diff MultiBuffer Tests

Verify excerpt count, source buffer assignment (old vs new), editable flags, decoration ranges and styles, and total line count.

### 8.3 DiffController Tests

Verify `reDiff()` updates decorations, `notifyChange()` debounces, subscribers receive updates, convergence/divergence behavior, cursor preservation, and `dispose()` cleanup.

### 8.4 Renderer Tests (E2E)

Verify diff gutter line numbers, "−"/"+" signs on delete/insert lines, no sign on equal, background colors, no excerpt headers in diff mode, and correct hit test/selection accounting for 96px diff gutter.

## 9. Performance Requirements

- Diff calculation: <10ms for files under 10K lines with scattered changes.
- Excerpt rebuild: <5ms for typical diff results.
- Re-render after re-diff: <16ms (one frame).
- Memory: No per-line allocations; reuse excerpt objects where possible.

## 10. Deferred Features

- **Word-level highlighting**: Out of scope for v1; can be added as a decoration extension.
- **Hunk folding**: Out of scope for v1; requires excerpt expand/collapse support.
- **Three-way merge**: Out of scope; requires significantly different architecture.
- **Undo behavior**: Supported — the editor's undo stack operates on the new buffer independently of diff state.
