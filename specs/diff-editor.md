# Diff Editor Specification

Purpose: define a diff viewing and editing component built on the MultiBuffer architecture.

> **Status: implemented.** This was drafted as "Draft v1" before the code existed; `src/diff/` now ships it, with tests in `tests/diff/`. Field-by-field type listings have been replaced with pointers to source so the spec cannot drift from it. Sections that the code does *not* satisfy are marked **Known drift**.

## 1. Problem Statement

The diff editor views and edits differences between two versions of a file in one unified, scrollable interface. Unlike side-by-side or read-only unified diffs, it allows direct editing of the "new" version while keeping the diff visualization accurate.

That requires displaying deleted lines (from the old version) interleaved with inserted and modified lines (from the new version); keeping delete lines read-only while insert and equal lines stay editable; recomputing the diff when an edit changes the relationship between the two texts; and preserving the user's cursor position across those recomputations.

## 2. Scope

**In scope**: a unified diff between two buffers with correct line-number attribution; delete lines as read-only excerpts from the old buffer and insert/equal lines as editable excerpts from the new buffer; decorations (background colors, gutter signs) distinguishing line kinds; a dual gutter showing old line numbers, new line numbers, and diff signs; cursor preservation across excerpt rebuilds via anchors; debounced re-diff; and convergence/divergence (§5.5).

**Out of scope**: side-by-side view, three-way merge visualization, syntax-aware diffing (we diff by lines, not by AST), and per-hunk folding. Git integration is out of scope in the sense that nothing shells out to git, though `patch.ts` parses git-format unified diff patches (including renames and binary markers).

Two original non-goals have since been implemented and are now specified here: **intraline highlighting** (`computeIntralineDiff`, on by default) and **per-file collapsing** in the multi-file view (`collapseFile`/`expandAll`). Per-*hunk* folding remains unimplemented.

## 3. System Overview

### 3.1 Modules

| Module | Responsibility |
|---|---|
| `src/diff/diff.ts` | Myers' O(ND) line diff; hunk grouping with configurable context; `computeIntralineDiff`, `pairDeleteInsertLines` |
| `src/diff/multibuffer.ts` | `createUnifiedDiffMultiBuffer` — builds the MultiBuffer and `Decoration[]` from two buffers |
| `src/diff/controller.ts` | `createDiffController` — change detection, debounced re-diff, subscriber notification |
| `src/diff/diff-editor-view.ts` | Facade bundling DiffController + Editor + DomRenderer + InputHandler |
| `src/diff/diff-styles.ts` | Shared decoration constants and range/decoration builders |
| `src/diff/unified.ts` | `createUnifiedDiff` — flat line-by-line view of the whole file (no hunk windowing) |
| `src/diff/patch.ts` | Parses unified diff patch strings into MultiBuffers |
| `src/diff/multi-file.ts` | Multi-file diff view with per-file collapse and lazy rendering |
| `src/diff/helpers.ts` | `formatHunkHeader` / `hunkToHeader` |
| `src/renderer/dom.ts` | Renders the dual gutter when `gutterMode: "diff"` |
| `src/editor/editor.ts` | Existing editor; enforces the `editable` flag and fires `onChange` |

Depends on `Buffer` (text storage with version tracking), `MultiBuffer` (excerpt collection supporting mixed editability), `Editor`, and `DomRenderer`.

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

An edit runs `MultiBuffer.edit()` on the new buffer, the editor fires `onChange`, and the controller receives `notifyChange()`. After the debounce delay it reads both buffers, re-runs `diff()`, rebuilds excerpts and decorations in one `setExcerpts()` call, and notifies subscribers.

## 4. Domain Model

Types are defined in [`src/diff/types.ts`](../src/diff/types.ts) and [`src/renderer/types.ts`](../src/renderer/types.ts) with per-field documentation; they are not restated here.

| Type | Shape |
|---|---|
| `DiffKind` | `"equal" \| "insert" \| "delete"` |
| `DiffLine` | One line: `kind`, `text` (no trailing newline), `oldRow`/`newRow` (0-based, `undefined` on the side that lacks the line) |
| `DiffHunk` | Contiguous run of lines plus context: `oldStart`/`oldCount`, `newStart`/`newCount`, `lines` |
| `DiffResult` | `hunks` + `isEqual` |
| `IntralineRange` / `IntralineDiff` | Changed column ranges within a paired delete/insert line |
| `HunkHeader` | Data for an `@@ -X,Y +A,B @@` separator line |
| `Decoration` | A `MultiBufferRange` plus a `Partial<DecorationStyle>` |
| `DecorationStyle` | Background/text/border color, weight, style, decoration, gutter background/color, `gutterSign`, `gutterSignColor`, `isHunkSeparator` |

### 4.1 Excerpt Structure

| Line Kind | Source Buffer | Editable | Gutter Sign |
|-----------|---------------|----------|-------------|
| delete    | old           | false    | "−"         |
| insert    | new           | configurable (default true) | "+" |
| equal     | new           | configurable (default true) | (none) |

**Each contiguous run of same-kind lines becomes ONE excerpt.** This minimizes excerpt count and avoids fragmentation. Diffing `"a\nb\nc"` (old) against `"a\nX\nc"` (new):

```
Hunk: lines 0-2 of old, lines 0-2 of new
  equal: "a"  (newRow=0)    → excerpt from new, rows [0,1)
  delete: "b" (oldRow=1)    → excerpt from old, rows [1,2)
  insert: "X" (newRow=1)    → excerpt from new, rows [1,2)
  equal: "c"  (newRow=2)    → excerpt from new, rows [2,3)
```

Four excerpts, and a MultiBuffer line count of 4 — one more than either buffer, because both "b" and "X" appear.

When a diff has multiple non-adjacent hunks and `showHunkSeparators` is on (default), a synthetic separator buffer supplies one `@@ ... @@` line between hunks, styled with `HUNK_HEADER_STYLE` (`isHunkSeparator: true`, which makes the gutter span full width with no line numbers). Callers must retain the returned `separatorBuffer` to keep it from being collected.

### 4.2 Gutter Display Modes

Standard mode (`gutterMode: undefined | "standard"`) uses a single column of MultiBuffer row numbers at `gutterWidth` from Measurements. Diff mode (`gutterMode: "diff"`) uses three fixed columns totalling 96px: old line number (40px), new line number (40px), sign (16px).

| Line Kind | Old Gutter | New Gutter | Sign |
|-----------|------------|------------|------|
| equal     | oldRow+1   | newRow+1   | " "  |
| delete    | oldRow+1   | (empty)    | "−"  |
| insert    | (empty)    | newRow+1   | "+"  |

## 5. Behavioral Specification

### 5.1 Diff Calculation

Myers' diff over two text strings, with `context` unchanged lines around each change (default 3). Adjacent changes within `2 * context` lines merge into one hunk; lines outside every hunk's context window are excluded from the view. Identical texts take an O(1)/O(N) fast path that skips Myers entirely.

Edge cases: both empty → `isEqual = true`, no excerpts. Empty old → all inserts. Empty new → all deletes. Identical non-empty texts → `isEqual = true` and a single excerpt from the new buffer.

### 5.2 Excerpt Construction

For each hunk, walk the lines and group consecutive same-kind lines:

```
kind      = lines[i].kind
startRow  = (kind == delete) ? oldRow : newRow
count     = length of the same-kind run

excerpt: buffer   = (kind == delete) ? oldBuffer : newBuffer
         range    = [startRow, startRow + count)
         editable = (kind != delete)

decoration: DELETE_STYLE for delete, INSERT_STYLE for insert, none for equal
```

Excerpts and decorations are built up front and applied in a single `setExcerpts()` call, so a rebuild triggers one cache rebuild rather than N+1.

### 5.3 Editing Behavior

Insert and equal lines (both from the new buffer) are editable; the cursor may move through delete lines but cannot modify them. The Editor — not the MultiBuffer — enforces this: `edit()` returns `false` when either endpoint lands in a non-editable excerpt, and a cross-excerpt edit is rejected if *any* excerpt it spans is non-editable. `readOnly: true` forces every excerpt non-editable for viewer use cases.

### 5.4 Live Re-Diff

`notifyChange()` (typically from the editor's `onChange`) cancels any pending timer and schedules a re-diff after `debounceMs` (default 150). On fire, the controller reads both buffers, runs `diff()`, replaces all excerpts, regenerates decorations, and notifies subscribers. `reDiff()` does the same work synchronously and returns the new `isEqual` state.

### 5.5 Convergence and Divergence

Convergence: editing an insert line until it matches the corresponding delete line collapses the pair into a single equal line — the delete excerpt is removed, the insert excerpt becomes an equal excerpt, and the MultiBuffer line count drops. Divergence is the exact inverse: editing an equal line so it no longer matches the old text splits it into a delete (from old) plus an insert (from new), and the line count rises.

```
delete "foo" + insert "bar"   2 lines, 2 excerpts
        ▲                            │  edit "bar" → "foo"  (convergence)
        │  edit "foo" → "bar"        ▼  edit "foo" → "bar"  (divergence)
equal "foo"                    1 line,  1 excerpt
```

### 5.6 Cursor Preservation

The MultiBuffer anchor system carries the cursor across rebuilds: anchors reference excerpt ID + buffer offset + version, excerpt replacement records an old→new ID map, and `resolveAnchor()` follows that replacement chain and adjusts for buffer edits.

If the cursor sits on a delete line that disappears through convergence it should land on the resulting equal line; on an equal line that diverges it should land on the insert line, which is the editable one. **Known drift**: the controller does no explicit cursor restoration of its own — it relies entirely on anchor resolution, and the replacement map maps every old excerpt ID to the *first* new ID rather than to the one covering the same region, so landing positions across a rebuild are approximate rather than guaranteed.

### 5.7 Decoration Styles

Defined in `src/diff/diff-styles.ts`. Equal lines get no decoration.

| Style | Background | Gutter background | Sign | Sign color |
|---|---|---|---|---|
| `DELETE_STYLE` | `rgba(255, 80, 80, 0.10)` | `rgba(255, 80, 80, 0.18)` | `−` | `#f87171` |
| `INSERT_STYLE` | `rgba(80, 200, 80, 0.10)` | `rgba(80, 200, 80, 0.18)` | `+` | `#4ade80` |
| `INTRALINE_DELETE_STYLE` | `rgba(255, 80, 80, 0.25)` | — | — | — |
| `INTRALINE_INSERT_STYLE` | `rgba(80, 200, 80, 0.25)` | — | — | — |

Intraline styles are column-range decorations applied on top of the line-level ones; the stronger opacity is what makes the changed span read as distinct.

## 6. Rendering Specification

### 6.1 Excerpt Headers

Excerpt headers should not appear in diff mode — the unified view spans two files, so a file path at every hunk boundary is wrong. Hunk separator lines (§4.1) serve that role instead.

**Known drift**: this is unimplemented. `DiffEditorView._render()` builds `excerptHeaders` from excerpt boundaries and passes them to the renderer unconditionally, and no `showExcerptHeaders` option exists anywhere in `src/`.

### 6.2 Diff Gutter Layout

```
┌──────────────────────────────────────────────────────────┐
│ [old#] │ [new#] │ [±] │ [content........................]│
│  40px  │  40px  │16px │  flex: 1                        │
└──────────────────────────────────────────────────────────┘
```

Line numbers are right-aligned with 4px right padding; the sign is centered; content takes the remaining width and scrolls horizontally when needed.

### 6.3 Hit Testing and Selection

Both must use the effective gutter width, which is 96px in diff mode rather than `gutterWidth` — `DomRenderer._getEffectiveGutterWidth()` centralizes this. Content therefore starts at x = 96, `hitTest(x, y)` computes the column as `(x - gutterWidth) / charWidth`, and selection rectangles start at `96 + startColumn * charWidth`.

## 7. API Specification

Exported from [`src/diff/index.ts`](../src/diff/index.ts). Primary entry points:

```typescript
createUnifiedDiffMultiBuffer(oldBuffer, newBuffer, options?): UnifiedDiffMultiBufferResult
createDiffController(oldBuffer, newBuffer, options?): DiffController
createDiffEditorViewFromBuffers(container, oldBuffer, newBuffer, options?): DiffEditorView
```

`UnifiedDiffMultiBufferResult` carries `multiBuffer`, `decorations`, `isEqual`, and the optional `separatorBuffer`. `DiffController` adds `oldBuffer`/`newBuffer` plus `reDiff()`, `notifyChange()`, `onUpdate(cb)` (returns an unsubscribe function), and `dispose()`.

| Option | Default | Effect |
|---|---|---|
| `context` | 3 | Unchanged lines kept around each change |
| `editableEqual` | true | Equal (context) lines editable |
| `editableInsert` | true | Insert lines editable |
| `intraline` | true | Character-level highlighting within paired lines |
| `intralineOptions` | `maxLineLength: 1000`, `timeBudgetMs: 2` | Per-line-pair limits; longer lines skip intraline diff |
| `showHunkSeparators` | true | `@@ ... @@` line between non-adjacent hunks |
| `readOnly` | false | Forces all excerpts non-editable (controller only) |
| `debounceMs` | 150 | Re-diff debounce delay (controller only) |

`Measurements` gains `gutterMode?: "standard" | "diff"` to select the dual gutter.

## 8. Testing Requirements

Covered in `tests/diff/`:

| File | Covers |
|---|---|
| `diff.test.ts` | Empty and identical inputs, single-line and multi-line changes, inserts, deletes, interleaved changes, changes at file start/end, context merging within `2*context` and separation beyond it |
| `intraline.test.ts` | Column ranges, length and time budgets |
| `multibuffer.test.ts` | Excerpt count/grouping, source buffer and `editable` flags, decoration ranges and styles, total line count |
| `controller.test.ts` | `reDiff()` updates, `notifyChange()` debouncing, subscriber delivery, convergence and divergence, cursor across re-diff, `dispose()` cleanup |
| `unified.test.ts`, `patch.test.ts`, `multi-file.test.ts` | Flat unified view, patch parsing, multi-file collapse |
| `diff-editor-view.test.ts` | Facade wiring |

E2E coverage should assert gutter line numbers, `−`/`+`/blank signs, background colors, absence of excerpt headers in diff mode (currently failing per §6.1), and hit testing plus selection against the 96px gutter.

## 9. Performance Requirements

Diff calculation under 10ms for files below 10K lines with scattered changes; excerpt rebuild under 5ms for typical results; re-render after re-diff within one 16ms frame. No per-line allocations — reuse excerpt objects where possible.

## 10. Deferred Features

Per-hunk folding needs excerpt expand/collapse support (per-file collapsing already exists in `multi-file.ts`). Three-way merge needs a significantly different architecture. Undo is not deferred: the editor's undo stack operates on the new buffer independently of diff state.
