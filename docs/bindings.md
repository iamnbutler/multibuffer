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

### Indentation
- `Tab` with selection — Indent selected lines
- `Shift+Tab` — Dedent line(s)
- `Mod+]` — Indent line(s)
- `Mod+[` — Dedent line(s)
- Auto-indent on Enter

### Comment toggling
- `Mod+/` — Toggle line comment

### Find & replace
- `Mod+F` — Find
- `Mod+G` / `F3` — Find next
- `Mod+Shift+G` / `Shift+F3` — Find previous
- `Mod+H` — Replace
- `Mod+Shift+H` — Replace all

### Multi-cursor
- `Mod+D` — Add selection for next occurrence
- `Mod+Shift+L` — Select all occurrences
- `Mod+Opt+Up/Down` — Add cursor above/below
- `Opt+Click` — Add cursor at click location
- `Escape` — Collapse to single cursor

### Bracket pairs
- Auto-close brackets/quotes
- `Mod+Shift+\` — Jump to matching bracket

### macOS text system
- `Ctrl+A` — Move to line start
- `Ctrl+E` — Move to line end
- `Ctrl+K` — Kill to end of line
- `Ctrl+Y` — Yank (paste kill buffer)
- `Ctrl+O` — Open line (insert newline after cursor)
- `Ctrl+T` — Transpose characters

### Scroll commands
- `Mod+Opt+Up/Down` — Scroll viewport without moving cursor

### Text transformation
- `Mod+Shift+U` — Transform to uppercase
- `Mod+Shift+L` — Transform to lowercase

### Selection expansion
- `Mod+Shift+Arrow` — Extend selection by word/line
