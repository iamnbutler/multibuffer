# Diff Editor Specification

Status: Draft v1

Purpose: Define a diff viewing and editing component built on the MultiBuffer architecture.

## 1. Problem Statement

The diff editor solves the problem of viewing and editing differences between two versions of a file within a unified, scrollable interface. Unlike traditional side-by-side or read-only unified diffs, this component allows direct editing of the "new" version while maintaining accurate diff visualization.

The system must visualize deleted lines (from the old version) interleaved with inserted/modified lines (from the new version) in a unified view; allow editing of insert and equal lines while keeping delete lines read-only; update the diff live as edits change the old/new relationship; and preserve the user's editing position across diff recalculations.

## 2. Goals and Non-Goals

### 2.1 Goals

Display a unified diff between two buffers with proper line-number attribution, rendering delete lines as read-only excerpts from the old buffer and insert/equal lines as editable excerpts from the new buffer. Apply visual decorations (background colors, gutter signs) to distinguish line types and support a dual-gutter mode showing old line numbers, new line numbers, and diff signs. Preserve cursor position through excerpt rebuilds via the anchor system, debounce re-diff to avoid excessive computation during rapid editing, and support convergence (edits making new text match old collapse delete+insert pairs to equal) and divergence (edits making equal text differ produce new delete+insert pairs).

### 2.2 Non-Goals

Out of scope: side-by-side diff view (unified only), word- or character-level intra-line highlighting, three-way merge visualization, syntax-aware diffing (we diff by lines, not AST), diff folding or hunk collapsing, and Git integration (this is a pure text diff component).

## 3. System Overview

### 3.1 Main Components

1. **Diff Algorithm** (`src/diff/diff.ts`) — Myers' O(ND) line-level diff; groups edits into hunks with configurable context, returning a `DiffResult` with hunks and an `isEqual` flag.

2. **Diff MultiBuffer Builder** (`src/diff/multibuffer.ts`) — takes old and new `Buffer` objects, runs the diff on their text, and constructs a `MultiBuffer` with excerpts from the appropriate source buffers plus `Decoration[]` for styling.

3. **Diff Controller** (`src/diff/controller.ts`) — wraps the diff MultiBuffer with change detection, exposing `notifyChange()` to debounce and trigger re-diff on content changes and notify subscribers when decorations update.

4. **Diff Gutter Renderer** (`src/renderer/dom.ts`) — when `gutterMode: "diff"`, renders dual line-number columns (old number, new number, sign) and applies decoration styles to gutter elements.

5. **Editor** (`src/editor/editor.ts`) — the existing editor handles all editing operations, respects the `editable` flag on excerpts (rejecting edits to non-editable ones), and fires `onChange` after mutations.

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

`Buffer` (mutable text storage with version tracking and edit log), `MultiBuffer` (collection of excerpts supporting mixed editability), `Editor` (command dispatcher for cursor movement and text editing), and `DomRenderer` (DOM renderer with gutter-mode support).

## 4. Core Domain Model

### 4.1 Entities

#### 4.1.1 DiffLine

A single line in the diff output. Fields: `kind` ("equal" | "insert" | "delete"), `text` (string, no trailing newline), `oldRow` (number | undefined, 0-based; undefined for inserts), and `newRow` (number | undefined, 0-based; undefined for deletes).

#### 4.1.2 DiffHunk

A contiguous group of diff lines with shared context, analogous to a unified diff hunk. Fields: `oldStart`/`oldCount` (line range in old buffer), `newStart`/`newCount` (line range in new buffer), and `lines` (readonly DiffLine[], including context).

#### 4.1.3 DiffResult

Complete diff output. Fields: `hunks` (readonly DiffHunk[]) and `isEqual` (boolean, true when old and new text are identical).

#### 4.1.4 Decoration

Visual styling applied to a range of text. Fields: `range` (MultiBufferRange — the rows it applies to) and `style` (Partial<DecorationStyle> — backgroundColor, gutterSign, gutterSignColor, etc.).

#### 4.1.5 DecorationStyle

All visual properties for a decorated line: `backgroundColor`, `color`, `borderColor`, `fontWeight` ("normal" | "bold"), `fontStyle` ("normal" | "italic"), `textDecoration` ("none" | "underline" | "line-through"), `gutterBackground`, `gutterColor`, `gutterSign` (e.g. "+", "−"), and `gutterSignColor`.

#### 4.1.6 DiffController

Controller for a diff view with re-diff on edit support. See the full interface in §7.2.

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

**Diff Mode** (`gutterMode: "diff"`): three fixed-width columns — old line number (40px) | new line number (40px) | sign (16px), 96px total. The old number shows for equal and delete lines, the new number for equal and insert lines, and the sign shows "+", "−", or space.

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

**Context handling**: default context is 3 lines before and after each change; adjacent changes within `2 * context` lines merge into one hunk, and lines outside any hunk's context window are excluded from the view.

**Edge cases**: empty old + empty new gives `isEqual = true` with no excerpts; empty old + non-empty new makes all lines inserts; non-empty old + empty new makes all lines deletes; identical texts give `isEqual = true` with a single excerpt from the new buffer (if non-empty).

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

**Allowed edits**: insert and equal lines (from the new buffer) are editable; the cursor can move through delete lines but cannot modify them.

**Rejected edits**: any edit targeting a non-editable excerpt, and any cross-excerpt edit spanning editable and non-editable regions.

### 5.4 Live Re-Diff

**Trigger**: `notifyChange()` called (typically from editor's onChange).

**Debounce**: Default 150ms. Configurable via `debounceMs` option.

**Process**: Cancel any pending re-diff timer and schedule a new one after the debounce delay. On timer fire, read current text from both buffers, run `diff()`, remove all existing excerpts, build new ones from the diff result, regenerate decorations, and notify all subscribers.

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

The MultiBuffer's anchor system handles cursor preservation. The editor creates anchors at the cursor position before operations; each anchor references excerpt ID + buffer offset + version. When excerpts are rebuilt, the replacement map tracks old→new ID mappings, and `resolveAnchor()` follows that chain (adjusting for buffer edits) to restore the cursor after re-diff.

**Edge cases**: On convergence, a cursor on a disappearing delete line moves to the resulting equal line; on divergence, a cursor on an equal line moves to the insert line (the editable one).

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

Both line numbers are right-aligned with 4px right padding, the sign is a centered fixed character ("+", "−", or space), and content uses the remaining width with horizontal scroll if needed.

### 6.3 Hit Testing

In diff mode, `hitTest(x, y)` must account for the wider gutter: the effective width is 40 + 40 + 16 = 96px, content starts at x = 96px, and column calculation uses `(x - 96) / charWidth`.

### 6.4 Selection Rendering

Selection rectangles must also account for the diff gutter: x-start = 96 + (startColumn * charWidth), with width spanning the selected column range.

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

Cover empty inputs (both, one, neither), identical inputs (`isEqual: true`), single-line changes mid-file, multi-line contiguous deletes and inserts, interleaved changes, changes at file start/end, and context-window behavior (merging within `2*context`, separation beyond it).

### 8.2 Diff MultiBuffer Tests

Verify excerpt count matches expected grouping, source buffers (old vs new) and editable flags are correct, decoration ranges match excerpt boundaries with styles correct per line kind, and total line count is correct.

### 8.3 DiffController Tests

Verify `reDiff()` updates decorations, `notifyChange()` debounces correctly, subscribers receive post-diff updates, convergence collapses a pair when an edit matches old, divergence creates a pair when an edit differs, cursor is preserved through re-diff, and `dispose()` cleans up timers.

### 8.4 Renderer Tests (E2E)

Verify the diff gutter shows correct line numbers; delete/insert/equal lines show "−"/"+"/no sign; background colors apply correctly; no excerpt headers render in diff mode; and hit testing and selection rendering account for the diff gutter width.

## 9. Performance Requirements

Diff calculation must run in <10ms for files under 10K lines with scattered changes, excerpt rebuild in <5ms for typical results, and re-render after re-diff within one 16ms frame. Avoid per-line allocations; reuse excerpt objects where possible.

## 10. Deferred Features

Word-level highlighting (addable later as a decoration extension), hunk folding (requires excerpt expand/collapse), and three-way merge (requires a significantly different architecture) are all out of scope for v1. Undo is supported — the editor's undo stack operates on the new buffer independently of diff state.
