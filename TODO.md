## Todo

**editing-v0**

- [ ] Bug: setCursor allows cursor past end of line
- [ ] Auto-scroll viewport to follow cursor
- [ ] Wire paste event in InputHandler
- [ ] Re-parse buffer after edit for syntax highlighting
- [ ] Add browser integration tests for scroll+render interaction
- [ ] Implement undo/redo system
- [ ] Add cursor blink animation

**multibuffer-v0**

- [ ] Syntax highlighting breaks when characters are inserted
- [ ] Line operations: move, duplicate, insert above/below
- [ ] Indentation: indent/dedent selections, auto-indent on newline
- [ ] Find & Replace: Cmd+F, Cmd+H, find next/prev, go to line
- [ ] Comment toggling: Cmd+/ to toggle line comments
- [ ] Multi-cursor editing: Cmd+D, Cmd+Shift+L, Opt+Click
- [ ] Bracket pair handling: auto-close, match navigation, surround
- [ ] macOS text system bindings: Ctrl+A/E/K/T/O (Emacs-style)
- [ ] Scroll commands: scroll viewport without moving cursor
- [ ] Text transformation: uppercase, lowercase, title case
- [ ] Selection expansion: Cmd+L select line, expand/shrink selection

**excerpt-management**

- [ ] Test multi-excerpt edits spanning boundaries

**edge-cases-gotchas**

- [ ] PERF: Cursor state reuse for batch anchor resolution

**viewport-rendering**

- [ ] Implement decoration range mapping
