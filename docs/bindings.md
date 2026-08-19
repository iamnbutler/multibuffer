# Editor Bindings

Keyboard shortcuts mapped in `src/editor/input-handler.ts`. Mac uses Cmd as the primary modifier; Windows/Linux uses Ctrl (auto-detected via `navigator.platform`). Below, `Mod` is Cmd/Ctrl and `Opt` is Option/Alt.

## Navigation

Arrow and paging keys emit `moveCursor`; the modifier picks the granularity. Add `Shift+` to any row to emit `extendSelection` at the same granularity instead of moving.

| Binding | Moves to |
|---------|----------|
| `Left` / `Right` | previous / next character |
| `Opt+Left` / `Opt+Right` | previous / next word |
| `Mod+Left` / `Home` | line start |
| `Mod+Right` / `End` | line end |
| `Up` / `Down` | one row up / down |
| `Mod+Up` / `Mod+Home` | buffer start |
| `Mod+Down` / `Mod+End` | buffer end |
| `PageUp` / `PageDown` | one page up / down |

## Editing

| Binding | Command | Notes |
|---------|---------|-------|
| _(text input)_ | `insertText` | Via `input` event (IME-compatible) |
| `Enter` | `insertNewline` | Plain newline — does not auto-indent |
| `Tab` | `insertTab` | Inserts 2 spaces; indents the lines instead when a selection is active |
| `Backspace` / `Opt+Backspace` / `Mod+Backspace` | `deleteBackward` | character / word / to line start |
| `Delete` / `Opt+Delete` | `deleteForward` | character / word (no line granularity) |
| `Mod+Shift+K` | `deleteLine` | |
| `Mod+]` | `indentLines` | |
| `Shift+Tab` / `Mod+[` | `dedentLines` | |

## Line Operations

| Binding | Command | Notes |
|---------|---------|-------|
| `Opt+Up` / `Opt+Down` | `moveLine` | Swap with the line above / below |
| `Opt+Shift+Up` / `Opt+Shift+Down` | `duplicateLine` | Duplicate above / below the cursor |
| `Mod+Enter` / `Mod+Shift+Enter` | `insertLineBelow` / `insertLineAbove` | Blank line below / above; cursor moves there and inherits the current line's indent |

## Selection

| Binding | Command |
|---------|---------|
| `Mod+A` | `selectAll` |
| _Click_ / _Click+Drag_ | `setCursor` / `extendSelectionTo` |
| _Double-click_ / _Triple-click_ | `selectWordAt` (Unicode-aware) / `selectLineAt` |

## Clipboard

| Binding | Command | Notes |
|---------|---------|-------|
| `Mod+C` | `copy` | Core is a no-op; the app writes `getSelectedText()` to the clipboard |
| `Mod+X` | `cut` | With a selection: cuts it. Without: cuts the entire line |
| `Mod+V` | `paste` | Handled via the paste event, not keydown |

## Undo / Redo

| Binding | Command |
|---------|---------|
| `Mod+Z` | `undo` |
| `Mod+Shift+Z` / `Mod+Y` | `redo` |

## Implemented, No Default Binding

These features ship but no built-in key triggers them — wire them up with a custom keymap (below).

| Feature | API | Conventional binding |
|---------|-----|----------------------|
| Find & replace | `SearchController` from `multibuffer/editor` — `find`, `next`, `prev`, `goTo`, `replaceActive`, `replaceAll` | `Mod+F`, `Mod+G`, `Mod+H` |
| Multi-cursor | `addCursor`, `addCursorAbove`, `addCursorBelow`, `clearExtraCursors` commands | `Mod+D`, `Mod+Opt+Up`/`Down`, `Escape` |
| Jump to matching bracket | `editor.bracketMatch` and the `bracketMatch` event; requires `bracketMatching: true` in `EditorOptions` (defaults to `false`) | `Mod+Shift+\` |

## Not Yet Implemented

| Feature | Conventional binding |
|---------|----------------------|
| Auto-indent on `Enter` | — |
| Auto-close brackets and quotes | — |
| Comment toggling | `Mod+/` |
| Case transformation | `Mod+Shift+U` (upper) / `Mod+Shift+L` (lower) |
| Scroll without moving the cursor | `Mod+Opt+Up` / `Mod+Opt+Down` |
| macOS text system: line start/end, kill to EOL, yank, open line, transpose | `Ctrl+A`, `Ctrl+E`, `Ctrl+K`, `Ctrl+Y`, `Ctrl+O`, `Ctrl+T` |

Conventional bindings above are what other editors use, not commitments, and some collide: `Mod+Opt+Up`/`Down` is listed for both multi-cursor and scrolling, so a keymap can only claim one.

## Custom Bindings

`InputHandler` takes a `keymap`, consulted before the built-in defaults, so consumer bindings win and anything unmatched falls through.

```ts
new InputHandler(onCommand, {
  keymap: {
    "Mod+F": { type: "custom", action: "find" },
    "Mod+Z": null, // disable a default
    "Mod+K Mod+C": { type: "custom", action: "toggleComment" }, // chord
  },
});
```

Keys normalize to `[Mod+][Alt+][Shift+]<key>`, with single letters uppercased (`Mod+S`, not `Mod+s`) and special keys using their `KeyboardEvent.key` name. A `null` binding disables the key. Chords are space-separated and reset if the second key does not arrive within 1500 ms.
