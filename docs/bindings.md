# Editor Bindings

Keyboard shortcuts mapped in `src/editor/input-handler.ts`. Mac uses Cmd as the primary modifier; Windows/Linux uses Ctrl (auto-detected via `navigator.platform`).

Bindings marked **not yet implemented** have no corresponding `EditorCommand` or editor logic — they need new command types and/or editor methods before they can be bound.

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
| `Tab` | `insertTab` | Inserts 2 spaces (always) |
| `Backspace` | `deleteBackward` | character |
| `Opt+Backspace` | `deleteBackward` | word |
| `Mod+Backspace` | `deleteBackward` | line (to start) |
| `Delete` | `deleteForward` | character |
| `Opt+Delete` | `deleteForward` | word |
| `Mod+Shift+K` | `deleteLine` | Deletes entire line |

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

### Line operations
- `Opt+Up/Down` — Move line up/down
- `Opt+Shift+Up/Down` — Duplicate line
- `Mod+Enter` — Insert line below
- `Mod+Shift+Enter` — Insert line above
- `Mod+J` — Join lines

### Indentation
- `Tab` (with selection) — Indent selected lines
- `Shift+Tab` — Dedent
- `Mod+]` / `Mod+[` — Indent / dedent
- Auto-indent on Enter

### Comment toggling
- `Mod+/` — Toggle line comment

### Find & replace
- `Mod+F` — Find
- `Mod+H` — Replace
- `Ctrl+G` — Go to line
- `Mod+G` / `F3` — Find next
- `Mod+Shift+G` / `Shift+F3` — Find previous

### Multi-cursor
- `Mod+D` — Select next occurrence
- `Mod+Shift+L` — Select all occurrences
- `Opt+Click` — Add cursor
- `Mod+Opt+Up/Down` — Add cursor above/below

### Bracket pairs
- Auto-close `()`, `[]`, `{}`, `""`, `''`, `` `` ``
- Type-over closing bracket
- `Mod+Shift+\` — Jump to matching bracket

### macOS text system (Emacs-style)
- `Ctrl+A/E` — Beginning/end of line
- `Ctrl+K` — Kill to end of line
- `Ctrl+T` — Transpose characters
- `Ctrl+O` — Open line (insert newline without moving)
- `Ctrl+D/H/B/F/N/P` — Aliases for Delete/Backspace/Left/Right/Down/Up

### Scroll
- `Ctrl+Up/Down` — Scroll without moving cursor

### Selection expansion
- `Mod+L` — Select line (repeat to extend)

### Text transformation
- Uppercase / lowercase / title case (typically behind command palette)

## Architecture Notes

The binding pipeline:

1. `InputHandler._handleKeyDown` receives `KeyboardEvent`
2. `keyEventToCommand()` maps it to an `EditorCommand` (or `undefined` to let browser handle it)
3. If a command is returned, `e.preventDefault()` is called and the command is dispatched
4. Paste bypasses this — handled via the `paste` event to access `clipboardData`
5. Text input bypasses this — handled via the `input` event for IME compatibility
6. The app layer (not the core) handles clipboard reads/writes around `copy`/`cut` commands

Custom bindings are not yet supported. When implemented, the likely approach is a `KeyMap` configuration that replaces `keyEventToCommand()` with a user-provided mapping from key combos to `EditorCommand` values.
