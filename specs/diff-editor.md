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

Display a unified diff between two buffers (with line-number attribution); render deletes as read-only excerpts (old buffer) and inserts/equals as editable (new buffer); apply visual decorations; support dual-gutter mode; preserve cursor via anchors through excerpt rebuilds; debounce re-diff; support convergence and divergence.

### 2.2 Non-Goals

Side-by-side view, word/character-level highlighting, three-way merge, syntax-aware diffing (line-level only), hunk folding/collapsing, and git integration.

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

3. **Diff Controller** (`src/diff/controller.ts`)
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

A single line in the diff output: `kind` ("equal"|"insert"|"delete"), `text` (no trailing newline), `oldRow` (number|undefined, undefined for inserts), `newRow` (number|undefined, undefined for deletes).

#### 4.1.2 DiffHunk

A contiguous group of diff lines with shared context. Fields: `oldStart`, `oldCount`, `newStart`, `newCount` (line range in each buffer), `lines` (readonly DiffLine[], includes context).

#### 4.1.3 DiffResult

Complete diff output: `hunks` (readonly DiffHunk[]), `isEqual` (boolean).

#### 4.1.4 Decoration

Visual styling: `range` (MultiBufferRange), `style` (Partial<DecorationStyle>).

#### 4.1.5 DecorationStyle

All visual properties for a decorated line: `backgroundColor`, `color`, `borderColor`, `fontWeight` ("normal"|"bold"), `fontStyle` ("normal"|"italic"), `textDecoration` ("none"|"underline"|"line-through"), `gutterBackground`, `gutterColor`, `gutterSign`, `gutterSignColor`.

#### 4.1.6 DiffController

Controller for a diff view with re-diff on edit support. See §7.2 for the full TypeScript interface.

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

**Process**: Cancel pending timer; schedule new re-diff after debounce. On fire: read both buffers, run `diff()`, remove existing excerpts, rebuild from result, regenerate decorations, notify subscribers.

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

The MultiBuffer's anchor system handles cursor preservation: anchors reference excerpt ID, buffer offset, and version. `resolveAnchor()` follows the old→new excerpt replacement map and adjusts for buffer edits to restore cursor position after re-diff.

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

| Suite | Test cases |
|-------|-----------|
| Diff Algorithm | Empty inputs (both/one/neither); identical → `isEqual: true`; single/multi-line changes (delete/insert/interleaved); changes at start/end; context merging and separation. |
| Diff MultiBuffer | Excerpt count, source buffers, editable flags, decoration ranges/styles, total line count. |
| DiffController | `reDiff()`, `notifyChange()` debounce, subscriber updates, convergence/divergence, cursor preservation, `dispose()` cleanup. |
| Renderer (E2E) | Diff gutter line numbers; signs (+/−/space); background colors; no excerpt headers; hit testing and selection with diff gutter. |

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
