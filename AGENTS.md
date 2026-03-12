# Agents

Instructions for AI agents working on this repository.

## Setup

This project uses **Bun** as its runtime and package manager. Bun is installed
via the workflow setup step, but if you need to install it manually:

```bash
curl -fsSL https://bun.sh/install | bash
export PATH="$HOME/.bun/bin:$PATH"
bun install --frozen-lockfile
```

## Commands

```bash
bun test              # Run all tests (must pass before creating PRs)
bun test --watch      # Watch mode
bun run bench         # Run benchmarks
bun run typecheck     # TypeScript type checking (must pass)
bun run lint          # Biome + GritQL lint (must pass)
bun run build:demo    # Build demo (generates sources.gen.ts)
```

## Code Style

- **No `any`, `unknown`, or `as` type assertions** — banned by Biome. When unavoidable, add a `biome-ignore` comment with an `expect:` explanation:
  ```ts
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction requires cast
  ```
- **No new dependencies** without discussion in an issue first.
- Match existing formatting, naming conventions, and PR scope (one concern per PR).

## Architecture

- `src/multibuffer/` — Data model (rendering-agnostic): buffer, excerpt, multibuffer, anchor, selection
- `src/renderer/` — Rendering abstraction: DOM renderer, measurement, viewport, highlighting
- `src/editor/` — Editor commands: cursor movement, text editing, input handling, undo/redo
- `demo/`, `tests/` (~590 tests), `benchmarks/` — Demo harness, test suite, benchmarks

## Performance

Targets: <1ms keypress-to-model, <1ms viewport calculation, 100+ excerpts. Always measure before/after when proposing performance changes.

## Approach

Types → Tests → Benchmarks → Implementation (TDD).
