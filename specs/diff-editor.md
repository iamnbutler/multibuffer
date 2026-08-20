# Diff Editor Specification

Status: Draft v1

Purpose: Define a diff viewing and editing component built on the MultiBuffer architecture.

## 1. Problem Statement

The diff editor solves the problem of viewing and editing differences between two versions of a file within a unified, scrollable interface. Unlike traditional side-by-side or read-only unified diffs, this component allows direct editing of the "new" version while maintaining accurate diff visualization. See §2.1 for the resulting requirements.

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
| Diff algorithm | `src/diff/diff.ts` | Myers' O(ND) line-level diff; groups edits into hunks with configurable context (§5.1). Also computes intraline diffs (§5.8). |
| MultiBuffer builder | `src/diff/multibuffer.ts` | Diffs two `Buffer`s and builds a `MultiBuffer` of excerpts plus `Decoration[]` (§4.2, §5.2). |
| Diff controller | `src/diff/controller.ts` | Wraps the MultiBuffer with debounced re-diff and update subscriptions (§5.4, §7.2). |
| Diff gutter renderer | `src/renderer/dom.ts`, `src/renderer/canvas.ts` | Under `gutterMode: "diff"`, renders dual line-number columns and sign, and applies decoration styles (§4.3, §6). |
| Editor | `src/editor/editor.ts` | Existing editor; respects each excerpt's `editable` flag and fires `onChange` after mutations (§5.3). |

`src/diff/` also contains modules outside this spec's scope: `patch.ts` (unified-patch parsing), `multi-file.ts` (per-file headers and collapse), `unified.ts` (unified-diff text output), `diff-editor-view.ts` (facade), `diff-styles.ts`, `helpers.ts`, and `types.ts`.

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

An edit mutates the new buffer, the editor's `onChange` calls the controller's `notifyChange()`, and the controller re-diffs after a debounce delay. See §5.4 for the full sequence.

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
| `kind` | "equal" \| "insert" \| "delete" | The type of change this line represents. |
| `text` | string | Line content without trailing newline. |
| `oldRow` | number \| undefined | 0-based line number in old buffer. Undefined for insert lines. |
| `newRow` | number \| undefined | 0-based line number in new buffer. Undefined for delete lines. |

#### 4.1.2 DiffHunk

A contiguous group of diff lines with shared context. Analogous to a unified diff hunk.

| Field | Type | Description |
|-------|------|-------------|
| `oldStart` | number | Starting line number in old buffer. |
| `oldCount` | number | Number of lines from old buffer in this hunk. |
| `newStart` | number | Starting line number in new buffer. |
| `newCount` | number | Number of lines from new buffer in this hunk. |
| `lines` | readonly DiffLine[] | The lines in this hunk, including context. |

#### 4.1.3 DiffResult

Complete diff output: `hunks` (readonly DiffHunk[]) describing all changes, and `isEqual` (boolean), true when old and new text are identical.

#### 4.1.4 Decoration

Visual styling applied to a range of text: `range` (MultiBufferRange) is the rows the decoration applies to, and `style` (Partial<DecorationStyle>) the visual properties. A decoration whose range spans partial columns of a single row is a column decoration, used for intraline highlighting (§5.8).

#### 4.1.5 DecorationStyle

All visual properties for a decorated line. Line styling: `backgroundColor`, `color`, `borderColor`, `fontWeight` ("normal" | "bold"), `fontStyle` ("normal" | "italic"), and `textDecoration` ("none" | "underline" | "line-through"). Gutter styling: `gutterBackground`, `gutterColor`, `gutterSign` (e.g. "+", "−"), and `gutterSignColor`. The optional `isHunkSeparator` (boolean) makes the gutter span full width with no line numbers, used for hunk separator lines.

#### 4.1.6 DiffController

Controller for a diff view with re-diff on edit support. See §7.2 for the full interface.

### 4.2 Excerpt Structure

The diff MultiBuffer contains excerpts in display order:

| Line Kind | Source Buffer | Editable | Gutter Sign |
|-----------|---------------|----------|-------------|
| delete    | old           | false    | "−"         |
| insert    | new           | `editableInsert`, default true | "+" |
| equal     | new           | `editableEqual`, default true  | (none) |

The controller's `readOnly` option (default false) forces both flags to false for read-only viewers.

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

When hunks are non-adjacent, a separator line carrying the `@@ -X,Y +A,B @@` header is inserted between them and decorated with `isHunkSeparator`. Controlled by `showHunkSeparators` (default true).

### 4.3 Gutter Display Modes

Standard mode (`gutterMode: undefined | "standard"`) uses a single gutter column showing the MultiBuffer row number, `gutterWidth` wide.

Diff mode (`gutterMode: "diff"`) uses three fixed-width columns — old line number (40px), new line number (40px), and sign (16px) — for an effective gutter width of 96px. This 96px total governs layout, hit testing, and selection rendering throughout §6.

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

Insert and equal lines come from the new buffer and are editable; the cursor can move through delete lines but cannot modify them. Any edit targeting a non-editable excerpt is rejected, as is a cross-excerpt edit spanning both editable and non-editable regions.

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

**Convergence**: when an insert line is edited to match its corresponding delete line, the pair collapses to a single equal line — the delete excerpt is removed, the insert excerpt becomes an equal excerpt, and the MultiBuffer line count decreases.

```
Before: delete "foo" + insert "bar"  →  2 lines, 2 excerpts
Edit: change "bar" to "foo"
After: equal "foo"  →  1 line, 1 excerpt
```

**Divergence**: when an equal line is edited to no longer match the old text, it splits into a delete excerpt (from old) plus an insert excerpt (from new), and the line count increases.

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

### 5.8 Intraline Highlighting

Delete and insert lines within a hunk are paired, and each pair is diffed at character level to mark the column ranges that actually changed. Each range becomes a column decoration (§4.1.4) rendered as a stronger-opacity background over the line-level one: `rgba(255, 80, 80, 0.25)` for deletes and `rgba(80, 200, 80, 0.25)` for inserts.

Enabled by default via `intraline` (default true). `intralineOptions` bounds the cost: `maxLineLength` (default 1000) skips longer lines, and `timeBudgetMs` (default 2) caps time per line pair.

## 6. Rendering Specification

### 6.1 Excerpt Headers

Excerpt headers must NOT be shown in diff mode — the unified view spans two files, so showing file paths at every hunk boundary is wrong. Skip header rendering when `gutterMode === "diff"`, or expose a `showExcerptHeaders: boolean` option. Hunk separator lines (§4.2) are a distinct mechanism and remain visible.

### 6.2 Diff Gutter Layout

In diff mode, each line row contains:

```
┌──────────────────────────────────────────────────────────┐
│ [old#] │ [new#] │ [±] │ [content........................]│
│  40px  │  40px  │16px │  flex: 1                        │
└──────────────────────────────────────────────────────────┘
```

Both line numbers are right-aligned with 4px right padding, the sign is a centered fixed character ("+", "−", or space), and content takes the remaining width with horizontal scroll if needed.

### 6.3 Hit Testing and Selection

Both must use the 96px effective gutter width from §4.3 rather than `gutterWidth`. Content starts at x = 96px, so `hitTest(x, y)` computes the column as `(x - 96) / charWidth`, and a selection rectangle starts at `96 + (startColumn * charWidth)` and spans the selected column range.

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
  /** Enable intraline (character-level) diff highlighting. Default: true. */
  intraline?: boolean;
  intralineOptions?: IntralineDiffOptions;
  /** Show hunk separator lines between non-adjacent hunks. Default: true. */
  showHunkSeparators?: boolean;
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
  /** Force all excerpts non-editable, for read-only viewers. Default: false. */
  readOnly?: boolean;
}

interface DiffController {
  readonly multiBuffer: MultiBuffer;
  readonly decorations: readonly Decoration[];
  readonly isEqual: boolean;
  readonly oldBuffer: Buffer;
  readonly newBuffer: Buffer;

  /** Manually trigger re-diff. Returns new isEqual state. */
  reDiff(): boolean;
  /** Schedule debounced re-diff. */
  notifyChange(): void;
  /** Subscribe to decoration updates. Returns unsubscribe function. */
  onUpdate(callback: (decorations: readonly Decoration[]) => void): () => void;
  /** Clean up timers and subscriptions. */
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
- Intraline: changed column ranges for a paired delete/insert; lines over `maxLineLength` skipped.

### 8.2 Diff MultiBuffer Tests

- Excerpt count matches expected grouping.
- Excerpt source buffers (old vs new) correct.
- Excerpt editable flags correct, including `editableInsert`/`editableEqual`/`readOnly`.
- Decoration ranges match excerpt boundaries.
- Decoration styles correct for line kind.
- Total line count correct.

### 8.3 DiffController Tests

- `reDiff()` updates decorations.
- `notifyChange()` debounces correctly.
- Subscribers receive updates after re-diff.
- Convergence: edit to match old collapses pair.
- Divergence: edit to differ creates new pair.
- Cursor preserved through re-diff.
- `dispose()` cleans up timers.

### 8.4 Renderer Tests (E2E)

- Diff gutter shows correct line numbers.
- Delete lines show "−" sign, insert lines "+", equal lines none.
- Background colors applied correctly, including intraline column ranges.
- No excerpt headers in diff mode.
- Hit testing and selection rendering account for the diff gutter width.

## 9. Performance Requirements

- Diff calculation: <10ms for files under 10K lines with scattered changes.
- Excerpt rebuild: <5ms for typical diff results.
- Re-render after re-diff: <16ms (one frame).
- Memory: No per-line allocations; reuse excerpt objects where possible.

## 10. Deferred Features

Out of scope for v1: **hunk folding** (requires excerpt expand/collapse support — `multi-file.ts` collapses whole files, not hunks) and **three-way merge** (requires significantly different architecture).

**Undo behavior** is supported: the editor's undo stack operates on the new buffer independently of diff state.
