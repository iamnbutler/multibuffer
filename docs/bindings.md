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
| `Mod+Left` | `moveCursor left` | line (start) |
| `Home` | `moveCursor left` | line (start) |
| `Mod+Home` | `moveCursor left` | buffer (start) |
| `Right` | `moveCursor right` | character |
| `Opt+Right` | `moveCursor right` | word |
| `Mod+Right` | `moveCursor right` | line (end) |
| `End` | `moveCursor right` | line (end) |
| `Mod+End` | `moveCursor right` | buffer (end) |
| `Up` | `moveCursor up` | character (1 row) |
| `Mod+Up` | `moveCursor up` | buffer (start) |
| `PageUp` | `moveCursor up` | page |
| `Down` | `moveCursor down` | character (1 row) |
| `Mod+Down` | `moveCursor down` | buffer (end) |
| `PageDown` | `moveCursor down` | page |

All navigation bindings support `Shift+` to extend the selection instead of moving.

## Editing

| Binding | Command | Notes |
|---------|---------|-------|
| _(text input)_ | `insertText` | Via `input` event (IME-compatible) |
| `Enter` | `insertNewline` | |
| `Tab` | `insertTab` | Inserts 2 spaces |
| `Backspace` | `deleteBackward` | character |
| `Opt+Backspace` | `deleteBackward` | word |
| `Mod+Backspace` | `deleteBackward` | line (to start) |
| `Delete` | `deleteForward` | character |
| `Opt+Delete` | `deleteForward` | word |
| `Mod+Shift+K` | `deleteLine` | Deletes entire line |

## Line Operations

| Binding | Command | Notes |
|---------|---------|-------|
| `Opt+Up` | `moveLine up` | Swap line with line above |
| `Opt+Down` | `moveLine down` | Swap line with line below |
| `Opt+Shift+Up` | `duplicateLine up` | Duplicate line above cursor |
| `Opt+Shift+Down` | `duplicateLine down` | Duplicate line below cursor |
| `Mod+Enter` | `insertLineBelow` | Insert blank line below, move cursor there |
| `Mod+Shift+Enter` | `insertLineAbove` | Insert blank line above, move cursor there |

## Selection

| Binding | Command | Notes |
|---------|---------|-------|
| `Mod+A` | `selectAll` | |
| _Click_ | `setCursor` | Places cursor |
| _Click+Drag_ | `extendSelectionTo` | Drag selection |
| _Double-click_ | `selectWordAt` | Unicode-aware word selection |
| _Triple-click_ | `selectLineAt` | Selects entire line |

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

## Not Yet Implemented

**Indentation** — `Tab` with selection (indent), `Shift+Tab` / `Mod+[` (dedent), `Mod+]` (indent), auto-indent on Enter.

**Comment toggling** — `Mod+/` toggle line comment.

**Find & replace** — `Mod+F` (find), `Mod+G`/`F3` (next), `Mod+Shift+G`/`Shift+F3` (previous), `Mod+H` (replace), `Mod+Shift+H` (replace all).

**Multi-cursor** — `Mod+D` (next occurrence), `Mod+Shift+L` (all occurrences), `Mod+Opt+Up/Down` (add cursor above/below), `Opt+Click` (add cursor at click), `Escape` (collapse to single cursor).

**Bracket pairs** — Auto-close brackets/quotes; `Mod+Shift+\` jump to matching bracket.

**macOS text system** — `Ctrl+A` (line start), `Ctrl+E` (line end), `Ctrl+K` (kill to EOL), `Ctrl+Y` (yank), `Ctrl+O` (open line), `Ctrl+T` (transpose).

**Scroll** — `Mod+Opt+Up/Down` scroll viewport without moving cursor.

**Text transformation** — `Mod+Shift+U` (uppercase), `Mod+Shift+L` (lowercase).

**Selection expansion** — `Mod+Shift+Arrow` extend selection by word/line.
