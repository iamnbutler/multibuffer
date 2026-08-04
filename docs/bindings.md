# Editor Bindings

Keyboard shortcuts mapped in `src/editor/input-handler.ts`. Below, `Mod` is Cmd on Mac and Ctrl on Windows/Linux, and `Opt` is Option / Alt; the platform is auto-detected via `navigator.platform`. Consumers can add or override bindings — including multi-key chords — via the `keymap` option on `InputHandler`; consumer bindings win over the defaults.

## Navigation

Add `Shift+` to any navigation binding to extend the selection instead of moving.

| Binding | Command | Granularity |
|---------|---------|-------------|
| `Left` / `Right` | `moveCursor` | character |
| `Opt+Left` / `Opt+Right` | `moveCursor` | word |
| `Mod+Left` / `Home` | `moveCursor left` | line (start) |
| `Mod+Right` / `End` | `moveCursor right` | line (end) |
| `Up` / `Down` | `moveCursor` | character (1 row) |
| `Mod+Up` / `Mod+Home` | `moveCursor up` | buffer (start) |
| `Mod+Down` / `Mod+End` | `moveCursor down` | buffer (end) |
| `PageUp` / `PageDown` | `moveCursor` | page |

## Editing

| Binding | Command | Notes |
|---------|---------|-------|
| _(text input)_ | `insertText` | Via `input` event (IME-compatible) |
| `Enter` | `insertNewline` | Plain newline — does not inherit indentation |
| `Tab` | `insertTab` | Inserts 2 spaces (see Indentation for the selection case) |
| `Backspace` / `Delete` | `deleteBackward` / `deleteForward` | character |
| `Opt+Backspace` / `Opt+Delete` | `deleteBackward` / `deleteForward` | word |
| `Mod+Backspace` | `deleteBackward` | line (to start) |
| `Mod+Shift+K` | `deleteLine` | |

## Indentation

Both commands act on every line touched by the selection — or the cursor line if collapsed — as a single undo step.

| Binding | Command | Notes |
|---------|---------|-------|
| `Tab` _(with selection)_ / `Mod+]` | `indentLines` | Prepends 2 spaces per line |
| `Shift+Tab` / `Mod+[` | `dedentLines` | Removes up to 2 leading spaces per line |

## Line Operations

| Binding | Command | Notes |
|---------|---------|-------|
| `Opt+Up` / `Opt+Down` | `moveLine up` / `down` | Swap with the line above / below |
| `Opt+Shift+Up` / `Opt+Shift+Down` | `duplicateLine up` / `down` | Copy above / below the cursor |
| `Mod+Enter` | `insertLineBelow` | Blank line below, inherits current indent |
| `Mod+Shift+Enter` | `insertLineAbove` | Blank line above, inherits current indent |

## Selection

Double-click word selection is Unicode-aware.

| Binding | Command |
|---------|---------|
| `Mod+A` | `selectAll` |
| _Click_ | `setCursor` |
| _Click+Drag_ | `extendSelectionTo` |
| _Double-click_ | `selectWordAt` |
| _Triple-click_ | `selectLineAt` |

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
| `Mod+Shift+Z` / `Mod+Y` | `redo` |

## Implemented, No Default Binding

These features work but ship unbound — wire them up through the `keymap` option.

| Feature | API | Suggested bindings |
|---------|-----|--------------------|
| Find & replace | `SearchController` (`src/editor/search.ts`): `find`, `next`, `prev`, `replaceActive`, `replaceAll` | `Mod+F`, `Mod+G`/`F3`, `Mod+Shift+G`/`Shift+F3`, `Mod+H`, `Mod+Shift+H` |
| Multi-cursor | `addCursor`, `addCursorAbove`, `addCursorBelow`, `clearExtraCursors` commands | `Opt+Click`, `Mod+Opt+Up`/`Mod+Opt+Down`, `Escape` |

## Not Yet Implemented

| Feature | Planned bindings |
|---------|------------------|
| Auto-indent on `Enter` | — |
| Comment toggling | `Mod+/` |
| Select next / all occurrences | `Mod+D`, `Mod+Shift+L` |
| Bracket pairs | Auto-close brackets/quotes; `Mod+Shift+\` jump to match |
| macOS text system | `Ctrl+A` (line start), `Ctrl+E` (line end), `Ctrl+K` (kill to EOL), `Ctrl+Y` (yank), `Ctrl+O` (open line), `Ctrl+T` (transpose) |
| Scroll without moving cursor | `Mod+Opt+Up` / `Mod+Opt+Down` |
| Text transformation | `Mod+Shift+U` (uppercase), `Mod+Shift+L` (lowercase) |
| Selection expansion by word/line | `Mod+Shift+Arrow` |
