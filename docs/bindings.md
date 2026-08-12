# Editor Bindings

Keyboard shortcuts mapped in `src/editor/input-handler.ts`. Mac uses Cmd as the primary modifier; Windows/Linux uses Ctrl (auto-detected via `navigator.platform`).

## Notation

| Symbol | Meaning |
|--------|---------|
| `Mod` | Cmd (Mac) / Ctrl (Win/Linux) |
| `Opt` | Option (Mac) / Alt (Win/Linux) |

## Navigation

| Binding | Command | Granularity |
|---------|---------|-------------|
| `Left` | `moveCursor left` | character |
| `Opt+Left` | `moveCursor left` | word |
| `Mod+Left`, `Home` | `moveCursor left` | line (start) |
| `Mod+Home` | `moveCursor left` | buffer (start) |
| `Right` | `moveCursor right` | character |
| `Opt+Right` | `moveCursor right` | word |
| `Mod+Right`, `End` | `moveCursor right` | line (end) |
| `Mod+End` | `moveCursor right` | buffer (end) |
| `Up` | `moveCursor up` | character (1 row) |
| `Mod+Up` | `moveCursor up` | buffer (start) |
| `PageUp` | `moveCursor up` | page |
| `Down` | `moveCursor down` | character (1 row) |
| `Mod+Down` | `moveCursor down` | buffer (end) |
| `PageDown` | `moveCursor down` | page |

All navigation bindings support `Shift+` to extend the selection instead of moving, at the same granularity — so `Opt+Shift+Left` extends by word and `Mod+Shift+Left` extends to the line start.

## Editing

| Binding | Command | Notes |
|---------|---------|-------|
| _(text input)_ | `insertText` | Via `input` event (IME-compatible) |
| `Enter` | `insertNewline` | |
| `Tab` | `insertTab` | Inserts 2 spaces; with a selection, indents the selected lines |
| `Backspace` | `deleteBackward` | character |
| `Opt+Backspace` | `deleteBackward` | word |
| `Mod+Backspace` | `deleteBackward` | line (to start) |
| `Delete` | `deleteForward` | character |
| `Opt+Delete` | `deleteForward` | word |
| `Mod+Shift+K` | `deleteLine` | |

## Line Operations

| Binding | Command | Notes |
|---------|---------|-------|
| `Opt+Up` / `Opt+Down` | `moveLine` | Swap with the adjacent line |
| `Opt+Shift+Up` / `Opt+Shift+Down` | `duplicateLine` | Copy the line above / below |
| `Mod+Enter` / `Mod+Shift+Enter` | `insertLineBelow` / `insertLineAbove` | New line below / above, inheriting indent; cursor moves there |
| `Mod+]` | `indentLines` | Add 2 spaces to the affected lines |
| `Shift+Tab`, `Mod+[` | `dedentLines` | Remove up to 2 leading spaces |

## Selection

| Binding | Command | Notes |
|---------|---------|-------|
| `Mod+A` | `selectAll` | |
| _Click_ | `setCursor` | |
| _Click+Drag_ | `extendSelectionTo` | |
| _Double-click_ | `selectWordAt` | Unicode-aware word boundaries |
| _Triple-click_ | `selectLineAt` | |

## Clipboard

| Binding | Command | Notes |
|---------|---------|-------|
| `Mod+C` | `copy` | Core is no-op; app writes `getSelectedText()` to clipboard |
| `Mod+X` | `cut` | With selection: cuts selected text. Without: cuts entire line |
| `Mod+V` | `paste` | Handled via paste event, not keydown |

## Undo / Redo

| Binding | Command |
|---------|---------|
| `Mod+Z` | `undo` |
| `Mod+Shift+Z` | `redo` |
| `Mod+Y` | `redo` |

## Custom Bindings

`new InputHandler(onCommand, { keymap })` merges a keymap over the defaults above; consumer bindings win. Keys normalize to `[Mod+][Alt+][Shift+]<key>`, with single letters uppercased and special keys using their `KeyboardEvent.key` name. Bind to `null` to disable a key, or join two keys with a space for a chord (abandoned after 1.5s).

```ts
const keymap: Keymap = {
  "Mod+S": { type: "custom", action: "save" },
  "Mod+Z": null, // disable undo
  "Mod+K Mod+C": { type: "custom", action: "comment" },
};
```

## Implemented, No Default Binding

Built and tested, but no key is wired to them — reach them via `keymap` or your own UI.

| Feature | API | Suggested binding |
|---------|-----|-------------------|
| Find & replace | `SearchController` — `find`, `next`, `prev`, `goTo`, `findNearest`, `replaceActive`, `replaceAll` | `Mod+F`, `Mod+G` / `Mod+Shift+G`, `Mod+H` |
| Multi-cursor | `addCursor`, `addCursorAbove`, `addCursorBelow`, `clearExtraCursors` commands | `Mod+Opt+Up`/`Down`, `Opt+Click` |
| Jump to matching bracket | `editor.bracketMatch` getter, plus a `bracketMatch` event on cursor moves and edits | `Mod+Shift+\` |
| Collapse selection | `collapseSelection` command (`to: "start" \| "end"`) | `Escape` |

## Not Yet Implemented

| Feature | Planned bindings |
|---------|------------------|
| Auto-indent on `Enter` | `insertNewline` inserts a bare `\n`; only `insertLineBelow` / `insertLineAbove` inherit indentation |
| Comment toggling | `Mod+/` |
| Auto-close brackets and quotes | _(no binding — fires on typing `(`, `[`, `"`)_ |
| macOS text system | `Ctrl+A` / `Ctrl+E` (line start/end), `Ctrl+K` (kill to EOL), `Ctrl+Y` (yank), `Ctrl+O` (open line), `Ctrl+T` (transpose) |
| Scroll without moving the cursor | `Mod+Opt+Up` / `Mod+Opt+Down` |
| Text transformation | `Mod+Shift+U` (uppercase), `Mod+Shift+L` (lowercase) |
