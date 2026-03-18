/**
 * Tile-based dirty region tracking benchmarks.
 *
 * Covers the performance of tile management operations that run on every
 * edit, selection change, and scroll event.
 *
 * Key performance targets (from issue #286):
 * - Single-char edit on 100K-line file: <2ms
 * - Tile dirty check: O(1) via Set lookup
 *
 * These operations are on the critical render path and must be fast to
 * maintain responsive editing in large files.
 */

import {
  createTileManager,
  markEditDirty,
  markSelectionDirty,
  type TileManager,
} from "../src/renderer/tile-map.ts";
import type { BenchmarkSuite } from "./harness.ts";

// Pre-create tile managers for different document sizes
let tm1k: TileManager;
let tm10k: TileManager;
let tm100k: TileManager;
let tm100kVisible: TileManager; // With viewport set

export const tileMapBenchmarks: BenchmarkSuite = {
  name: "Tile-based Dirty Region Tracking",
  benchmarks: [
    // ─── Single-char edit (acceptance criterion) ─────────────────────────────
    {
      name: "single-char edit on 100K-line file (target: <2ms)",
      iterations: 10000,
      targetMs: 2,
      setup: () => {
        tm100k = createTileManager({ linesPerTile: 10, totalLines: 100000 });
        tm100k.setViewport(50000, 50100); // viewport in middle of file
        tm100k.clearDirty();
      },
      fn: () => {
        // Simulate single-char edit at row 50050 (no line count change)
        markEditDirty(tm100k, 50050, 100000, 100000);
        tm100k.getDirtyTiles();
        tm100k.clearDirty();
      },
    },

    // ─── TileManager construction ────────────────────────────────────────────
    {
      name: "TileManager construction - 100K lines",
      iterations: 10000,
      targetMs: 0.1,
      fn: () => {
        createTileManager({ linesPerTile: 10, totalLines: 100000 });
      },
    },

    // ─── markDirty operations ────────────────────────────────────────────────
    {
      name: "markRowDirty - single row",
      iterations: 100000,
      targetMs: 0.01,
      setup: () => {
        tm100k = createTileManager({ linesPerTile: 10, totalLines: 100000 });
      },
      fn: () => {
        tm100k.markRowDirty(50000);
      },
    },
    {
      name: "markDirty - 100-row range (10 tiles)",
      iterations: 50000,
      targetMs: 0.05,
      setup: () => {
        tm100k = createTileManager({ linesPerTile: 10, totalLines: 100000 });
      },
      fn: () => {
        tm100k.markDirty(50000, 50100);
      },
    },
    {
      name: "markDirty - 1000-row range (100 tiles)",
      iterations: 10000,
      targetMs: 0.5,
      setup: () => {
        tm100k = createTileManager({ linesPerTile: 10, totalLines: 100000 });
      },
      fn: () => {
        tm100k.markDirty(50000, 51000);
      },
    },

    // ─── Dirty checking ─────────────────────────────────────────────────────
    {
      name: "isTileDirty - O(1) lookup",
      iterations: 100000,
      targetMs: 0.001,
      setup: () => {
        tm100k = createTileManager({ linesPerTile: 10, totalLines: 100000 });
        tm100k.markDirty(0, 100000); // mark all dirty
      },
      fn: () => {
        tm100k.isTileDirty(50000);
      },
    },
    {
      name: "getDirtyTiles - 100-row viewport, 10 dirty tiles",
      iterations: 10000,
      targetMs: 0.1,
      setup: () => {
        tm100kVisible = createTileManager({ linesPerTile: 10, totalLines: 100000 });
        tm100kVisible.setViewport(50000, 50100);
        tm100kVisible.clearDirty();
        tm100kVisible.markDirty(50000, 50100); // mark all visible dirty
      },
      fn: () => {
        tm100kVisible.getDirtyTiles();
      },
    },
    {
      name: "getVisibleTiles - 100-row viewport",
      iterations: 10000,
      targetMs: 0.1,
      setup: () => {
        tm100kVisible = createTileManager({ linesPerTile: 10, totalLines: 100000 });
        tm100kVisible.setViewport(50000, 50100);
      },
      fn: () => {
        tm100kVisible.getVisibleTiles();
      },
    },

    // ─── Viewport/scroll operations ──────────────────────────────────────────
    {
      name: "setViewport - scroll 100 rows (mark 10 new tiles dirty)",
      iterations: 10000,
      targetMs: 0.1,
      setup: () => {
        tm100k = createTileManager({ linesPerTile: 10, totalLines: 100000 });
        tm100k.setViewport(50000, 50100);
        tm100k.clearDirty();
      },
      fn: () => {
        // Simulate scroll down 100 rows
        tm100k.setViewport(50100, 50200);
        tm100k.clearDirty();
        // Scroll back
        tm100k.setViewport(50000, 50100);
        tm100k.clearDirty();
      },
    },

    // ─── Edit helpers ────────────────────────────────────────────────────────
    {
      name: "markEditDirty - single-line edit (no line change)",
      iterations: 100000,
      targetMs: 0.01,
      setup: () => {
        tm100k = createTileManager({ linesPerTile: 10, totalLines: 100000 });
      },
      fn: () => {
        markEditDirty(tm100k, 50000, 100000, 100000);
      },
    },
    {
      name: "markEditDirty - multi-line insert (adds 100 lines)",
      iterations: 10000,
      targetMs: 1,
      setup: () => {
        tm100k = createTileManager({ linesPerTile: 10, totalLines: 100100 });
      },
      fn: () => {
        markEditDirty(tm100k, 50000, 100000, 100100);
      },
    },

    // ─── Selection helpers ───────────────────────────────────────────────────
    {
      name: "markSelectionDirty - new selection (10 rows)",
      iterations: 50000,
      targetMs: 0.05,
      setup: () => {
        tm100k = createTileManager({ linesPerTile: 10, totalLines: 100000 });
      },
      fn: () => {
        markSelectionDirty(tm100k, undefined, undefined, 50000, 50010);
      },
    },
    {
      name: "markSelectionDirty - selection expansion (10 to 20 rows)",
      iterations: 50000,
      targetMs: 0.05,
      setup: () => {
        tm100k = createTileManager({ linesPerTile: 10, totalLines: 100000 });
      },
      fn: () => {
        markSelectionDirty(tm100k, 50000, 50010, 50000, 50020);
      },
    },

    // ─── Coalescing stress test ──────────────────────────────────────────────
    {
      name: "100 rapid single-row edits (coalescing)",
      iterations: 1000,
      targetMs: 1,
      setup: () => {
        tm100k = createTileManager({ linesPerTile: 10, totalLines: 100000 });
        tm100k.setViewport(50000, 50100);
      },
      fn: () => {
        // Simulate rapid typing - multiple edits per frame
        for (let i = 0; i < 100; i++) {
          tm100k.markRowDirty(50050 + (i % 10)); // hits at most 10 different rows
        }
        tm100k.getDirtyTiles();
        tm100k.clearDirty();
      },
    },

    // ─── Small document comparison ───────────────────────────────────────────
    {
      name: "single-char edit on 1K-line file",
      iterations: 50000,
      targetMs: 0.5,
      setup: () => {
        tm1k = createTileManager({ linesPerTile: 10, totalLines: 1000 });
        tm1k.setViewport(500, 600);
        tm1k.clearDirty();
      },
      fn: () => {
        markEditDirty(tm1k, 550, 1000, 1000);
        tm1k.getDirtyTiles();
        tm1k.clearDirty();
      },
    },
    {
      name: "single-char edit on 10K-line file",
      iterations: 20000,
      targetMs: 1,
      setup: () => {
        tm10k = createTileManager({ linesPerTile: 10, totalLines: 10000 });
        tm10k.setViewport(5000, 5100);
        tm10k.clearDirty();
      },
      fn: () => {
        markEditDirty(tm10k, 5050, 10000, 10000);
        tm10k.getDirtyTiles();
        tm10k.clearDirty();
      },
    },
  ],
};
