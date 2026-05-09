# Diff Editor Specification

Status: Draft v1

Purpose: Define a diff viewing and editing component built on the MultiBuffer architecture.

## 1. Problem Statement

The diff editor solves the problem of viewing and editing differences between two versions of a file within a unified, scrollable interface. Unlike traditional side-by-side or read-only unified diffs, this component allows direct editing of the "new" version while maintaining accurate diff visualization.

The system must display deleted lines (from old) interleaved with inserted/modified lines (from new) in a unified view, allow editing of insert and equal lines while keeping delete lines read-only, update the diff live as edits change the old/new relationship, and preserve the user's cursor position through diff recalculations.

## 2. Goals and Non-Goals

### 2.1 Goals

Display a unified diff between two buffers with proper line-number attribution: delete lines as read-only excerpts from the old buffer, insert and equal lines as editable excerpts from the new buffer, with visual decorations (background colors, gutter signs) and an optional dual-gutter mode showing old/new line numbers plus diff signs. Preserve cursor position through excerpt rebuilds via the anchor system, debounce re-diff during rapid editing, and support both convergence (delete+insert pairs collapse when new matches old) and divergence (equal lines split into delete+insert when edited).

### 2.2 Non-Goals

Side-by-side view, word/character-level highlighting within lines, three-way merge, syntax-aware (AST) diffing, hunk folding, and git integration are out of scope — this is a pure unified text diff component.

## 3. System Overview

### 3.1 Main Components

1. **Diff Algorithm** (`src/diff/diff.ts`) — Myers' O(ND) line-level diff; groups edits into hunks with configurable context; returns `DiffResult` with hunks and `isEqual` flag.
2. **Diff MultiBuffer Builder** (`src/diff/multibuffer.ts`) — takes old and new `Buffer` objects, runs the diff, constructs a `MultiBuffer` with excerpts from the appropriate source buffers, and generates `Decoration[]` for visual styling.
3. **Diff Controller** (`src/diff/controller.ts`) — wraps the diff MultiBuffer with change detection; `notifyChange()` debounces and triggers re-diff; notifies subscribers when decorations update.
4. **Diff Gutter Renderer** (in `src/renderer/dom.ts`) — when `gutterMode: "diff"`, renders dual line number columns plus a sign character, applying decoration styles to gutter elements.
5. **Editor** (`src/editor/editor.ts`) — existing editor; respects each excerpt's `editable` flag (rejecting edits to non-editable) and fires `onChange` after mutations.

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

When the user edits, the editor mutates the new buffer via `MultiBuffer.edit()` and fires `onChange`, which calls the controller's `notifyChange()`. After the debounce delay, the controller reads both buffers' current text, runs `diff()`, rebuilds excerpts and decorations, and notifies subscribers.

### 3.3 External Dependencies

`Buffer` (mutable text storage with version tracking and edit log), `MultiBuffer` (excerpts with mixed editability), `Editor` (command dispatcher for cursor movement and editing), and `DomRenderer` (DOM renderer with gutter mode support).

## 4. Core Domain Model

### 4.1 Entities

#### 4.1.1 DiffLine

A single line in the diff output: `kind` (`"equal" | "insert" | "delete"`), `text` (line content without trailing newline), `oldRow` (0-based line in old buffer; undefined for inserts), and `newRow` (0-based line in new buffer; undefined for deletes).

#### 4.1.2 DiffHunk

A contiguous group of diff lines with shared context — analogous to a unified diff hunk. Carries `oldStart`/`oldCount`/`newStart`/`newCount` (line ranges in each buffer) and `lines` (readonly `DiffLine[]` including context).

#### 4.1.3 DiffResult

Complete diff output: `hunks` (readonly `DiffHunk[]`) and `isEqual` (true when old and new text are identical).

#### 4.1.4 Decoration

Visual styling for a range of text: `range` (`MultiBufferRange`) and `style` (`Partial<DecorationStyle>` — backgroundColor, gutterSign, gutterSignColor, etc.).

#### 4.1.5 DecorationStyle

Full visual properties for a decorated line: `backgroundColor`, `color`, `borderColor`, `fontWeight` (`"normal" | "bold"`), `fontStyle` (`"normal" | "italic"`), `textDecoration` (`"none" | "underline" | "line-through"`), and gutter-specific `gutterBackground`, `gutterColor`, `gutterSign`, `gutterSignColor`.

#### 4.1.6 DiffController

Controller for a diff view with re-diff on edit support. See [§7.2](#72-creatediffcontroller) for the full TypeScript interface.

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

Single gutter column showing the MultiBuffer row number, sized by `gutterWidth` from Measurements.

#### Diff Mode (`gutterMode: "diff"`)

Three columns: old line number (40px) | new line number (40px) | sign (16px), totaling 96px. Old number shown for equal and delete lines; new number shown for equal and insert lines; sign shows `"+"`, `"−"`, or a space.

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

**Context handling**: default 3 lines before/after each change; adjacent changes within `2 * context` lines merge into one hunk; lines outside any hunk's context window are excluded from the view.

**Edge cases**: both empty → `isEqual = true`, no excerpts; empty old + non-empty new → all inserts; non-empty old + empty new → all deletes; identical texts → `isEqual = true` with a single excerpt from the new buffer (when non-empty).

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

Insert and equal lines (from the new buffer) are editable; the cursor may move through delete lines but cannot modify them. Edits targeting a non-editable excerpt — or cross-excerpt edits spanning editable and non-editable regions — are rejected.

### 5.4 Live Re-Diff

**Trigger**: `notifyChange()` called (typically from editor's onChange).

**Debounce**: Default 150ms. Configurable via `debounceMs` option.

**Process**: Cancel any pending timer and schedule a new re-diff after the debounce delay. On fire, read current text from both buffers, run `diff()`, replace excerpts with the new ones, regenerate decorations, and notify subscribers.

### 5.5 Convergence and Divergence

**Convergence** (edit makes insert match delete): the delete+insert pair collapses into a single equal excerpt — the delete excerpt is removed, the insert becomes equal, and the MultiBuffer line count decreases.

```
Before: delete "foo" + insert "bar"  →  2 lines, 2 excerpts
Edit: change "bar" to "foo"
After: equal "foo"  →  1 line, 1 excerpt
```

**Divergence** (edit makes equal differ from old): the equal excerpt splits into a new delete (from old) + insert (from new) pair, and the line count increases.

```
Before: equal "foo"  →  1 line, 1 excerpt
Edit: change "foo" to "bar"
After: delete "foo" + insert "bar"  →  2 lines, 2 excerpts
```

### 5.6 Cursor Preservation

The MultiBuffer's anchor system handles cursor preservation: the editor creates anchors (excerpt ID + buffer offset + version) before operations; when excerpts are rebuilt, a replacement map tracks old→new IDs; `resolveAnchor()` follows the chain and adjusts for buffer edits to restore the cursor after re-diff.

**Edge cases**: when a delete line disappears under convergence, the cursor moves to the resulting equal line; when an equal line diverges, the cursor moves to the (editable) insert line.

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

Old and new line numbers are right-aligned with 4px right padding; the sign is centered (`"+"`, `"−"`, or space); content uses the remaining width with horizontal scroll if needed.

### 6.3 Hit Testing

In diff mode, `hitTest(x, y)` accounts for the wider gutter: effective gutter width is 40 + 40 + 16 = 96px, so content starts at `x = 96` and column is `(x - 96) / charWidth`.

### 6.4 Selection Rendering

Selection rectangles likewise start at `96 + (startColumn * charWidth)` and span the selected column range.

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

Cover empty inputs (both/one/neither), identical inputs (`isEqual: true`), single-line changes mid-file, multi-line contiguous deletes/inserts, interleaved changes, changes at file start/end, and context-line merging vs. separation around the `2 * context` threshold.

### 8.2 Diff MultiBuffer Tests

Verify excerpt count and grouping, source buffers (old vs. new), `editable` flags, decoration ranges and styles per line kind, and total line count.

### 8.3 DiffController Tests

`reDiff()` updates decorations; `notifyChange()` debounces correctly; subscribers receive updates after re-diff; convergence collapses delete+insert pairs; divergence creates new pairs; cursor is preserved across re-diff; `dispose()` cleans up timers.

### 8.4 Renderer Tests (E2E)

Diff gutter shows correct old/new line numbers and signs (`"+"`, `"−"`, or none) per line kind; background colors apply correctly; excerpt headers are suppressed in diff mode; hit-testing and selection rendering both account for the 96px diff gutter.

## 9. Performance Requirements

Diff calculation under 10ms for files below 10K lines with scattered changes; excerpt rebuild under 5ms for typical results; re-render after re-diff within one 16ms frame; no per-line allocations (reuse excerpt objects where possible).

## 10. Deferred Features

Word-level highlighting (addable later as a decoration extension), hunk folding (needs excerpt expand/collapse support), and three-way merge (significantly different architecture) are all out of scope for v1. Undo is already supported — the editor's undo stack operates on the new buffer independently of diff state.
