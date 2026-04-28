# Diff Editor Specification

Status: Draft v1

Purpose: Define a diff viewing and editing component built on the MultiBuffer architecture.

## 1. Problem Statement

The diff editor views and edits differences between two file versions in a unified, scrollable interface, allowing direct editing of the "new" version while maintaining accurate diff visualization. It must handle: visualization (interleaved delete/insert/equal lines), editing (insert and equal lines from the new buffer are editable; delete lines are read-only), live re-diff when content changes, and cursor preservation through recalculations.

## 2. Goals and Non-Goals

### 2.1 Goals

Display a unified diff with proper line-number attribution, rendering delete lines as read-only (old buffer) and insert/equal lines as editable (new buffer). Apply visual decorations (background colors, gutter signs) to distinguish line types. Support dual-gutter mode (old#, new#, diff sign). Preserve cursor position through excerpt rebuilds via the anchor system. Debounce re-diff for performance; support convergence (delete+insert collapses to equal) and divergence (equal splits into delete+insert).

### 2.2 Non-Goals

Side-by-side diff view, word/character-level highlighting, three-way merge, syntax-aware diffing (line-level only), diff folding/hunk collapsing, and Git integration are all out of scope.

## 3. System Overview

### 3.1 Main Components

1. **Diff Algorithm** (`src/diff/diff.ts`): Myers' O(ND) line-level diff grouped into hunks with configurable context; returns `DiffResult` with hunks and `isEqual` flag.
2. **Diff MultiBuffer Builder** (`src/diff/multibuffer.ts`): Runs the diff on old/new `Buffer` text, builds a `MultiBuffer` with excerpts from the appropriate source buffer, and generates `Decoration[]` for visual styling.
3. **Diff Controller** (`src/diff/controller.ts`): Wraps the diff MultiBuffer with change detection — debounces `notifyChange()` calls, triggers re-diff, and notifies subscribers when decorations update.
4. **Diff Gutter Renderer** (`src/renderer/dom.ts`): When `gutterMode: "diff"`, renders dual line number columns (old#, new#, sign) with decoration styles applied.
5. **Editor** (`src/editor/editor.ts`): Existing editor; respects the `editable` flag on excerpts and fires `onChange` after mutations.

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

When the user edits, the editor modifies the new buffer via `MultiBuffer.edit()` and fires `onChange`. The diff controller receives `notifyChange()` and, after the debounce delay, reads both buffers, runs `diff()`, rebuilds excerpts, regenerates decorations, and notifies subscribers.

### 3.3 External Dependencies

- `Buffer`: Mutable text storage with version tracking and edit log.
- `MultiBuffer`: Collection of excerpts supporting mixed editability.
- `Editor`: Command dispatcher for cursor movement and text editing.
- `DomRenderer`: DOM-based renderer with gutter mode support.

## 4. Core Domain Model

### 4.1 Entities

#### 4.1.1 DiffLine

A single line in the diff output. Fields: `kind` ("equal"|"insert"|"delete"), `text` (content without trailing newline), `oldRow` (0-based old-buffer line; undefined for insert lines), `newRow` (0-based new-buffer line; undefined for delete lines).

#### 4.1.2 DiffHunk

A contiguous group of diff lines with shared context, analogous to a unified diff hunk. Fields: `oldStart`, `oldCount`, `newStart`, `newCount` (line range in each buffer) and `lines` (DiffLine[] including context).

#### 4.1.3 DiffResult

Complete diff output: `hunks` (all change hunks) and `isEqual` (true when old and new texts are identical).

#### 4.1.4 Decoration

Visual styling applied to a range of text: `range` (MultiBufferRange of affected rows) and `style` (Partial<DecorationStyle> — backgroundColor, gutterSign, gutterSignColor, etc.).

#### 4.1.5 DecorationStyle

All visual properties for a decorated line. Text: `backgroundColor`, `color`, `borderColor`, `fontWeight` ("normal"|"bold"), `fontStyle` ("normal"|"italic"), `textDecoration` ("none"|"underline"|"line-through"). Gutter: `gutterBackground`, `gutterColor`, `gutterSign` ("+", "−", etc.), `gutterSignColor`.

#### 4.1.6 DiffController

Controller for a diff view with re-diff on edit support. See [§7.2](#72-creatediffcontroller) for the full `DiffController` interface.

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
3. On timer fire: read both buffers, run `diff()`, remove existing excerpts, build new excerpts from the result, regenerate decorations, notify subscribers.

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

The MultiBuffer's anchor system handles cursor preservation. The editor creates anchors (excerpt ID + buffer offset + version) before re-diff; as excerpts are rebuilt, a replacement map tracks old→new ID mappings; `resolveAnchor()` follows the chain and adjusts for buffer edits, restoring the cursor position.

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

Empty inputs (all combinations), identical inputs (`isEqual: true`), single-line change in the middle, multi-line contiguous delete and insert, interleaved changes, changes at file start/end, context merging (within 2*context) and separation (beyond 2*context).

### 8.2 Diff MultiBuffer Tests

Excerpt count, source buffers (old vs new), and editable flags are correct; decoration ranges match excerpt boundaries; decoration styles match line kind; total line count is correct.

### 8.3 DiffController Tests

`reDiff()` updates decorations; `notifyChange()` debounces correctly; subscribers receive updates after re-diff. Convergence collapses delete+insert to equal; divergence creates a new delete+insert pair. Cursor preserved through re-diff; `dispose()` cleans up timers.

### 8.4 Renderer Tests (E2E)

Diff gutter shows correct old/new line numbers with signs (delete "−", insert "+", equal none). Background colors applied correctly by line kind. No excerpt headers in diff mode. Hit testing and selection rendering both account for the 96px diff gutter width.

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
