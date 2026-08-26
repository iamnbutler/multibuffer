# Editor Bindings

Default keyboard shortcuts, mapped in `src/editor/input-handler.ts`. `Mod` is Cmd on Mac and Ctrl on Windows/Linux (auto-detected via `navigator.platform`); `Opt` is Option / Alt. Keys pressed with both Ctrl and Meta are ignored so system shortcuts pass through.

## Navigation

Every binding below issues `moveCursor`; adding `Shift+` issues `extendSelection` with the same direction and granularity.

| Binding | Granularity |
|---------|-------------|
| `Left` / `Right` | character |
| `Opt+Left` / `Opt+Right` | word |
| `Mod+Left` / `Mod+Right`, `Home` / `End` | line start / end |
| `Mod+Up` / `Mod+Down`, `Mod+Home` / `Mod+End` | buffer start / end |
| `Up` / `Down` | one row |
| `PageUp` / `PageDown` | page |

## Editing

| Binding | Command | Notes |
|---------|---------|-------|
| _(text input)_ | `insertText` | Via `input` event (IME-compatible) |
| `Enter` | `insertNewline` | Plain newline — no auto-indent |
| `Mod+Enter` / `Mod+Shift+Enter` | `insertLineBelow` / `insertLineAbove` | Blank line below / above, inheriting the current line's leading spaces |
| `Tab` | `insertTab` | Inserts 2 spaces; indents the selected lines instead when a selection is active |
| `Mod+]` | `indentLines` | |
| `Shift+Tab` / `Mod+[` | `dedentLines` | |
| `Backspace` | `deleteBackward` | character; `Opt+` word, `Mod+` line (to start) |
| `Delete` | `deleteForward` | character; `Opt+` word (no `Mod+` variant) |
| `Mod+Shift+K` | `deleteLine` | |
| `Opt+Up` / `Opt+Down` | `moveLine` | Swap with the line above / below |
| `Opt+Shift+Up` / `Opt+Shift+Down` | `duplicateLine` | Copy above / below |

## Selection

| Binding | Command |
|---------|---------|
| `Mod+A` | `selectAll` |
| _Click_ / _Click+Drag_ | `setCursor` / `extendSelectionTo` |
| _Double-click_ | `selectWordAt` (Unicode-aware) |
| _Triple-click_ | `selectLineAt` |

## Clipboard

| Binding | Command | Notes |
|---------|---------|-------|
| `Mod+C` | `copy` | Core is a no-op; the app writes `getSelectedText()` to the clipboard |
| `Mod+X` | `cut` | Cuts the selection, or the entire line when there is none |
| `Mod+V` | `paste` | Handled via the `paste` event, not keydown |

## Undo / Redo

| Binding | Command |
|---------|---------|
| `Mod+Z` | `undo` |
| `Mod+Shift+Z` / `Mod+Y` | `redo` |

## Custom Bindings

Pass a `keymap` to `InputHandler`. It is consulted before the built-in bindings above, so a consumer entry wins; anything unmatched falls through to the defaults. Keys use the `[Mod+][Alt+][Shift+]<key>` format with single letters uppercased (`Mod+S`, `Shift+ArrowUp`). A binding of `null` disables the key, and space-separated chords (`Mod+K Mod+C`) time out after 1500ms. Use the `custom` command to dispatch consumer-defined actions.

## Implemented, No Default Binding

These features exist but must be driven by the consumer.

| Feature | API |
|---------|-----|
| Find & replace | `SearchController` (`src/editor/search.ts`) — `find`, `next`, `prev`, `replaceActive`, `replaceAll` |
| Multi-cursor | `addCursor`, `addCursorAbove`, `addCursorBelow`, `clearExtraCursors` commands |
| Jump to matching bracket | `editor.bracketMatch` — opt-in, requires `bracketMatching: true` (defaults to `false`) |
| Collapse selection | `collapseSelection` command |

## Not Implemented

Auto-indent on Enter; auto-close brackets and quotes; comment toggling (`Mod+/`); text transformation (`Mod+Shift+U` / `Mod+Shift+L`); scrolling the viewport without moving the cursor; the macOS text-system keys (`Ctrl+A`/`E`/`K`/`Y`/`O`/`T`).

Note that the two conventional bindings for multi-cursor and viewport scrolling collide on `Mod+Opt+Up/Down`; only one can take that chord if both are added.
