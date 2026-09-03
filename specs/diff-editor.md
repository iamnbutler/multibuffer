# Diff Editor Specification

> **Status: implemented.** This spec predates the code. `src/diff/` is now 11 files / ~3400 lines and has grown past what is described here; where the two disagree, the source wins. Sections marked **Known drift** are requirements the code does not currently meet.

Purpose: Define a diff viewing and editing component built on the MultiBuffer architecture.

## 1. Problem Statement

The diff editor views and edits differences between two versions of a file in a unified, scrollable interface. Unlike traditional side-by-side or read-only unified diffs, it allows direct editing of the "new" version while keeping the diff visualization accurate.

It must display deleted lines from the old version interleaved with inserted and modified lines from the new one; allow editing of insert and equal lines while keeping delete lines read-only; update the diff live when edits change the relationship between the two texts; and preserve the user's editing position across those recalculations.

## 2. Goals and Non-Goals

### 2.1 Goals

Display a unified diff between two buffers with correct line-number attribution — delete lines as read-only excerpts from the old buffer, insert and equal lines as editable excerpts from the new one — with visual decorations (background colors, gutter signs) distinguishing the kinds and a dual-gutter mode showing old line number, new line number, and sign.

Preserve cursor position through excerpt rebuilds via the anchor system, and debounce re-diff calculations so rapid editing does not trigger excessive computation. Support both **convergence** (edits make new text match old, so delete+insert pairs collapse to equal) and **divergence** (edits make equal text differ, so new delete+insert pairs appear).

### 2.2 Non-Goals

Side-by-side diff view (this spec covers unified only), three-way merge visualization, syntax-aware diffing (we diff by lines, not by AST), and git integration — this is a pure text diff component. Side-by-side and three-way merge are genuinely absent from `src/`.

Two items previously listed here have since shipped and are **no longer non-goals**:

- **Intraline highlighting.** `computeIntralineDiff` produces character-level column ranges for paired delete/insert lines, styled via `INTRALINE_DELETE_STYLE` / `INTRALINE_INSERT_STYLE` (0.25 opacity, above the 0.10 line-level backgrounds). The `intraline` option **defaults to true**.
- **Per-file collapsing.** `src/diff/multi-file.ts` provides `collapseFile` / `expandFile` / `collapseAll`. Per-*hunk* folding is still absent.

## 3. System Overview

### 3.1 Modules

| Module | Responsibility |
|--------|----------------|
| `src/diff/diff.ts` | Myers' O(ND) line-level diff; groups edits into hunks with configurable context; also `computeIntralineDiff` and `pairDeleteInsertLines`. Identical texts take an O(1) fast path that skips Myers entirely. |
| `src/diff/multibuffer.ts` | Builds a `MultiBuffer` from two `Buffer`s — excerpts from the appropriate source buffer plus `Decoration[]` for styling. Owns `HUNK_HEADER_STYLE`. |
| `src/diff/controller.ts` | Wraps the diff MultiBuffer with change detection: `notifyChange()`, debounced re-diff, subscriber notification. |
| `src/diff/diff-editor-view.ts` | High-level facade wiring buffers, editor, and renderer together. |
| `src/diff/multi-file.ts` | Multi-file diffs with per-file collapse/expand and stats. |
| `src/diff/patch.ts` | Parses unified patch strings into MultiBuffers (`parsePatch`, `createMultiBufferFromPatch`). |
| `src/diff/unified.ts` | `createUnifiedDiff` — flat unified-diff line list with stats. |
| `src/diff/diff-styles.ts` | Shared decoration styles and range/decoration helpers. |
| `src/diff/helpers.ts` | Hunk header formatting (`formatHunkHeader`, `hunkToHeader`). |
| `src/renderer/dom.ts` | Diff gutter rendering when `gutterMode: "diff"`. |
| `src/editor/editor.ts` | Existing editor; respects the `editable` flag on excerpts and fires `onChange` after mutations. |

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

An edit modifies the new buffer via `MultiBuffer.edit()`, the editor fires `onChange`, and the controller receives `notifyChange()`. After the debounce delay it re-reads both buffers, runs `diff()`, rebuilds excerpts, regenerates decorations, and notifies subscribers.

### 3.3 External Dependencies

`Buffer` (mutable text storage with version tracking and edit log), `MultiBuffer` (excerpt collection supporting mixed editability), `Editor` (command dispatcher for cursor movement and editing), and `DomRenderer` (gutter-mode-aware renderer).

## 4. Core Domain Model

### 4.1 Entities

Field-level definitions live in [`../src/diff/types.ts`](../src/diff/types.ts) and [`../src/renderer/types.ts`](../src/renderer/types.ts) — the shapes below are a map, not a duplicate.

| Type | Shape |
|------|-------|
| `DiffLine` | One output line: `kind` (`"equal" \| "insert" \| "delete"`), `text` (no trailing newline), `oldRow` / `newRow` (0-based; `undefined` for insert / delete respectively). |
| `DiffHunk` | A contiguous group of lines with shared context: `oldStart`, `oldCount`, `newStart`, `newCount`, `lines`. |
| `DiffResult` | `hunks` plus `isEqual` (true when old and new text are identical). |
| `Decoration` | A `range` (`MultiBufferRange`) plus a `Partial<DecorationStyle>`. |
| `DecorationStyle` | Line styling (`backgroundColor`, `color`, `borderColor`, `fontWeight`, `fontStyle`, `textDecoration`) and gutter styling (`gutterBackground`, `gutterColor`, `gutterSign`, `gutterSignColor`), plus `isHunkSeparator`. |
| `DiffController` | Read-only `multiBuffer`, `decorations`, `isEqual`, `oldBuffer`, `newBuffer`; methods `reDiff()`, `notifyChange()`, `onUpdate(cb)`, `dispose()`. |

### 4.2 Excerpt Structure

The diff MultiBuffer contains excerpts in display order:

| Line Kind | Source Buffer | Editable | Gutter Sign |
|-----------|---------------|----------|-------------|
| delete    | old           | never    | "−"         |
| insert    | new           | `editableInsert` (default true) | "+" |
| equal     | new           | `editableEqual` (default true)  | (none) |

Setting `readOnly: true` forces both flags false.

**Important**: Each contiguous run of same-kind lines becomes ONE excerpt. This minimizes excerpt count and avoids fragmentation.

Example for diff between "a\nb\nc" (old) and "a\nX\nc" (new):

```
Hunk: lines 0-2 of old, lines 0-2 of new
  equal: "a"  (newRow=0)    → excerpt from new, rows [0,1)
  delete: "b" (oldRow=1)    → excerpt from old, rows [1,2)
  insert: "X" (newRow=1)    → excerpt from new, rows [1,2)
  equal: "c"  (newRow=2)    → excerpt from new, rows [2,3)
```

Results in 4 excerpts total. The MultiBuffer line count is 4 — one more than either buffer, because both "b" and "X" appear.

### 4.3 Hunk Separators

When a diff has more than one hunk and `showHunkSeparators` is true (the default), a synthetic separator line is inserted between non-adjacent hunks, carrying `HUNK_HEADER_STYLE` (muted background, italic, `isHunkSeparator: true`, no line numbers). These lines live in a separate `separatorBuffer` returned alongside the MultiBuffer — **retain that reference** for as long as the MultiBuffer is in use, or the separator text is garbage-collected.

### 4.4 Gutter Display Modes

Standard mode (`gutterMode: undefined | "standard"`) is a single column showing the MultiBuffer row number, `gutterWidth` wide. Diff mode (`gutterMode: "diff"`) is three fixed columns totalling 96px — old line number (40px), new line number (40px), sign (16px):

| Line Kind | Old Gutter | New Gutter | Sign |
|-----------|------------|------------|------|
| equal     | oldRow+1   | newRow+1   | " "  |
| delete    | oldRow+1   | (empty)    | "−"  |
| insert    | (empty)    | newRow+1   | "+"  |

## 5. Behavioral Specification

### 5.1 Diff Calculation

Myers' diff over two text strings, with `context` unchanged lines kept around each change (default 3). Adjacent changes within `2 * context` lines merge into one hunk; lines outside any hunk's context window are excluded from the view.

Edge cases: both empty → `isEqual = true`, no excerpts. Empty old → all inserts. Empty new → all deletes. Identical texts → `isEqual = true` via the O(1) fast path, single excerpt from the new buffer if non-empty.

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

When intraline highlighting is enabled, paired delete/insert lines additionally receive column-range decorations from `computeIntralineDiff`.

### 5.3 Editing Behavior

Insert and equal lines come from the new buffer and are editable; the cursor can move through delete lines but cannot modify them. Any edit targeting a non-editable excerpt is rejected, as is any cross-excerpt edit spanning editable and non-editable regions.

### 5.4 Live Re-Diff

`notifyChange()` (typically from the editor's `onChange`) cancels any pending timer and schedules a re-diff after `debounceMs`, default 150. On fire, the controller reads current text from both buffers, runs `diff()`, replaces all excerpts, regenerates decorations, and notifies subscribers. The excerpt replacement is a single `setExcerpts` call rather than a remove-then-add pair.

### 5.5 Convergence and Divergence

**Convergence** — editing an insert line to match its delete line collapses the pair into a single equal line: the delete excerpt is removed, the insert excerpt becomes an equal excerpt, and the MultiBuffer line count drops.

```
Before: delete "foo" + insert "bar"  →  2 lines, 2 excerpts
Edit: change "bar" to "foo"
After: equal "foo"  →  1 line, 1 excerpt
```

**Divergence** — editing an equal line so it no longer matches the old text splits it into a delete (from old) plus an insert (from new), increasing the line count:

```
Before: equal "foo"  →  1 line, 1 excerpt
Edit: change "foo" to "bar"
After: delete "foo" + insert "bar"  →  2 lines, 2 excerpts
```

### 5.6 Cursor Preservation

Cursor preservation falls out of the MultiBuffer anchor system rather than any diff-specific code. Anchors reference excerpt ID + buffer offset + version; when excerpts are rebuilt, a replacement map records old→new IDs, and `resolveAnchor()` follows that chain and adjusts for buffer edits.

Intended edge-case behavior: a cursor on a delete line that disappears through convergence lands on the resulting equal line, and a cursor on an equal line that diverges lands on the insert line (the editable one).

> **Known drift.** These two guarantees are approximate. `controller.ts` contains no anchor, cursor, or selection code at all, and `setExcerptsForBuffer` (`src/multibuffer/multibuffer.ts`) maps *every* old excerpt ID to `newIds[0]`, despite a comment claiming it picks the first new ID covering the same buffer region.

### 5.7 Decoration Styles

Defaults, from `src/diff/diff-styles.ts`. Equal lines get no decoration.

| | Delete | Insert |
|---|---|---|
| `backgroundColor` | `rgba(255, 80, 80, 0.10)` | `rgba(80, 200, 80, 0.10)` |
| `gutterBackground` | `rgba(255, 80, 80, 0.18)` | `rgba(80, 200, 80, 0.18)` |
| `gutterSign` | `−` | `+` |
| `gutterSignColor` | `#f87171` | `#4ade80` |
| Intraline `backgroundColor` | `rgba(255, 80, 80, 0.25)` | `rgba(80, 200, 80, 0.25)` |

## 6. Rendering Specification

### 6.1 Excerpt Headers

Excerpt headers must NOT be shown in diff mode — the unified view spans two files, so showing file paths at every hunk boundary is wrong. Skip header rendering when `gutterMode === "diff"`, or expose a `showExcerptHeaders: boolean` option.

> **Known drift.** Neither is implemented. `diff-editor-view.ts:315-329` builds `excerptHeaders` from boundaries and passes them to `render()` unconditionally, and `showExcerptHeaders` does not exist anywhere in `src/`.

### 6.2 Diff Gutter Layout

```
┌──────────────────────────────────────────────────────────┐
│ [old#] │ [new#] │ [±] │ [content........................]│
│  40px  │  40px  │16px │  flex: 1                        │
└──────────────────────────────────────────────────────────┘
```

Both line numbers are right-aligned with 4px right padding; the sign is centered; content takes the remaining width and scrolls horizontally if needed.

### 6.3 Hit Testing and Selection

Both must use the effective gutter width — 40 + 40 + 16 = 96px in diff mode — rather than the standard `gutterWidth`. Content starts at x = 96, `hitTest` computes the column as `(x - gutterWidth) / charWidth`, and selection rectangles start at `96 + (startColumn * charWidth)`.

## 7. API Specification

Signatures live in [`../src/diff/index.ts`](../src/diff/index.ts) and the modules it re-exports. The two primary entry points:

- `createUnifiedDiffMultiBuffer(oldBuffer, newBuffer, options?)` → `{ multiBuffer, decorations, isEqual, separatorBuffer? }`
- `createDiffController(oldBuffer, newBuffer, options?)` → `DiffController`

For a fully wired view, `createDiffEditorView(container, oldText, newText, options?)` takes strings, and `createDiffEditorViewFromBuffers(container, oldBuffer, newBuffer, options?)` takes existing buffers.

Options and their defaults:

| Option | Default | Effect |
|--------|---------|--------|
| `context` | 3 | Unchanged context lines around each change. |
| `editableEqual` | true | Whether equal (context) lines can be edited. |
| `editableInsert` | true | Whether insert lines can be edited. |
| `readOnly` | false | Forces both editable flags off. |
| `intraline` | true | Character-level highlighting on paired delete/insert lines. |
| `intralineOptions` | `maxLineLength: 1000`, `timeBudgetMs: 2` | Guardrails; longer lines skip intraline diffing. |
| `showHunkSeparators` | true | Separator lines between non-adjacent hunks (multi-hunk diffs only). |
| `debounceMs` | 150 | Re-diff debounce delay (controller only). |

`Measurements` (`src/renderer/types.ts`) is extended with `gutterMode?: "standard" | "diff"` alongside `lineHeight`, `charWidth?`, `gutterWidth`, and `wrapWidth?`.

## 8. Testing Requirements

Coverage lives in `tests/diff/` (8 files, ~2800 lines):

| Area | File | Covers |
|------|------|--------|
| Diff algorithm | `diff.test.ts` | Empty and identical inputs, single- and multi-line changes, interleaved changes, changes at file start/end, context merging and separation at the `2 * context` boundary. |
| Intraline | `intraline.test.ts` | Column ranges, prefix/suffix optimization, length and time-budget guardrails. |
| MultiBuffer construction | `multibuffer.test.ts` | Excerpt count and grouping, source buffer selection, editable flags, decoration ranges and styles, total line count, hunk separators. |
| Controller | `controller.test.ts` | `reDiff()` updating decorations, `notifyChange()` debouncing, subscriber notification, convergence and divergence, cursor preservation, `dispose()` cleanup. |
| View facade | `diff-editor-view.test.ts` | Wiring of buffers, editor, and renderer; read-only option resolution. |
| Multi-file | `multi-file.test.ts` | Per-file collapse/expand, stats. |
| Patch parsing | `patch.test.ts` | Unified patch parsing into MultiBuffers. |
| Unified output | `unified.test.ts` | Flat unified-diff line list and stats. |

Renderer behavior — gutter line numbers, the "−" / "+" / blank signs, background colors, hit testing and selection at the 96px gutter width, and the absent excerpt headers from §6.1 — is not covered by `tests/diff/`; `tests/e2e/` currently holds only `editor.e2e.ts`.

## 9. Performance Requirements

Diff calculation under 10ms for files below 10K lines with scattered changes; excerpt rebuild under 5ms for typical results; re-render after re-diff within one 16ms frame. No per-line allocations — reuse excerpt objects where possible.

## 10. Deferred Features

Per-hunk folding (requires excerpt expand/collapse support; per-file collapsing already ships) and three-way merge (requires a significantly different architecture) remain out of scope. Undo is already supported: the editor's undo stack operates on the new buffer independently of diff state.
