# Multibuffer

A lightweight, high-performance text editor component for TypeScript/Bun.

## Architecture

```
src/
  multibuffer/           # Data model (rendering-agnostic)
    types.ts             # Core type definitions
    buffer.ts            # Single file's text storage
    excerpt.ts           # Range within a buffer
    multibuffer.ts       # Collection of excerpts
    anchor.ts            # Stable positions that survive edits
    selection.ts         # Anchor-based selections

  multibuffer_renderer/  # Rendering abstraction
    types.ts             # Renderer interface
    measurement.ts       # Line height, character width (fixed)
    viewport.ts          # Visible range calculations
```

## Key Constraints

- **Fixed-height lines** - All lines have identical height for O(1) position calculations
- **Vanilla TypeScript** - No framework dependencies in core
- **Rendering-agnostic** - DOM/Canvas/WebGPU decision deferred to renderer implementations
- **Instance-friendly** - Minimal per-instance memory footprint

## Performance Targets

- Keypress to model update: <1ms
- Viewport calculation: <1ms
- Support 100+ excerpts in single multibuffer

## Development

```bash
bun test          # Run tests
bun test --watch  # Watch mode
bun run bench     # Run benchmarks
bun run typecheck # Type checking
```

## Task Tracking

Using spool for task management. Stream: `multibuffer-v0`

```bash
spool stream show mm3l5j8s-1f7o  # View all tasks
spool list --stream mm3l5j8s-1f7o  # List open tasks
```

## Approach

Types → Tests → Benchmarks → Implementation (TDD)

Write tests and benchmarks BEFORE implementation code.
