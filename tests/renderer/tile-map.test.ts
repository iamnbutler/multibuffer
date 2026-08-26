/**
 * Tests for tile-based dirty region tracking in tile-map.ts.
 *
 * Covers:
 * - TileManager: tile creation, dirty tracking, viewport management
 * - markDirty: range-based invalidation
 * - markEditDirty: edit-aware invalidation
 * - markSelectionDirty: selection change tracking
 * - Coalescing: multiple invalidations per frame
 */

import { describe, expect, test } from "bun:test";
import {
  createTileManager,
  markEditDirty,
  markSelectionDirty,
  TileManager,
} from "../../src/renderer/tile-map.ts";

describe("TileManager basics", () => {
  test("constructor sets default linesPerTile to 10", () => {
    const tm = new TileManager();
    expect(tm.linesPerTile).toBe(10);
  });

  test("constructor respects custom linesPerTile", () => {
    const tm = new TileManager({ linesPerTile: 20 });
    expect(tm.linesPerTile).toBe(20);
  });

  test("constructor sets totalLines", () => {
    const tm = new TileManager({ totalLines: 500 });
    expect(tm.totalLines).toBe(500);
  });

  test("createTileManager factory function works", () => {
    const tm = createTileManager({ linesPerTile: 15, totalLines: 100 });
    expect(tm.linesPerTile).toBe(15);
    expect(tm.totalLines).toBe(100);
  });

  test("initial viewport is 0-0", () => {
    const tm = new TileManager();
    expect(tm.viewportStartRow).toBe(0);
    expect(tm.viewportEndRow).toBe(0);
  });

  test("setTotalLines updates totalLines", () => {
    const tm = new TileManager();
    tm.setTotalLines(1000);
    expect(tm.totalLines).toBe(1000);
  });
});

describe("TileManager viewport", () => {
  test("setViewport updates viewport bounds", () => {
    const tm = new TileManager({ totalLines: 100 });
    tm.setViewport(10, 50);
    expect(tm.viewportStartRow).toBe(10);
    expect(tm.viewportEndRow).toBe(50);
  });

  test("setViewport marks newly visible tiles dirty on scroll down", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100 });
    tm.setViewport(0, 30); // tiles 0, 10, 20
    tm.clearDirty();

    // Scroll down to show tiles 20, 30, 40
    tm.setViewport(20, 50);

    // Tiles 30 and 40 are newly visible
    expect(tm.isTileDirty(30)).toBe(true);
    expect(tm.isTileDirty(40)).toBe(true);
    // Tile 20 was already visible
    expect(tm.isTileDirty(20)).toBe(false);
    // Tile 0 is no longer visible
    expect(tm.isTileDirty(0)).toBe(false);
  });

  test("setViewport marks newly visible tiles dirty on scroll up", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100 });
    tm.setViewport(30, 60); // tiles 30, 40, 50
    tm.clearDirty();

    // Scroll up to show tiles 10, 20, 30
    tm.setViewport(10, 40);

    // Tiles 10 and 20 are newly visible
    expect(tm.isTileDirty(10)).toBe(true);
    expect(tm.isTileDirty(20)).toBe(true);
    // Tile 30 was already visible
    expect(tm.isTileDirty(30)).toBe(false);
  });

  test("initial setViewport marks all visible tiles dirty", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100 });
    tm.setViewport(0, 30);

    expect(tm.isTileDirty(0)).toBe(true);
    expect(tm.isTileDirty(10)).toBe(true);
    expect(tm.isTileDirty(20)).toBe(true);
    expect(tm.isTileDirty(30)).toBe(false); // not in viewport (endRow is exclusive)
  });
});

describe("TileManager markDirty", () => {
  test("markDirty marks single tile for single row", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100 });
    tm.markDirty(15, 16);

    expect(tm.isTileDirty(10)).toBe(true);
    expect(tm.isTileDirty(0)).toBe(false);
    expect(tm.isTileDirty(20)).toBe(false);
  });

  test("markDirty marks multiple tiles for range spanning tiles", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100 });
    tm.markDirty(5, 25);

    expect(tm.isTileDirty(0)).toBe(true);
    expect(tm.isTileDirty(10)).toBe(true);
    expect(tm.isTileDirty(20)).toBe(true);
    expect(tm.isTileDirty(30)).toBe(false);
  });

  test("markDirty with empty range does nothing", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100 });
    tm.markDirty(15, 15);

    expect(tm.dirtyCount).toBe(0);
  });

  test("markDirty with reversed range does nothing", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100 });
    tm.markDirty(20, 10);

    expect(tm.dirtyCount).toBe(0);
  });

  test("markRowDirty marks single tile", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100 });
    tm.markRowDirty(35);

    expect(tm.isTileDirty(30)).toBe(true);
    expect(tm.dirtyCount).toBe(1);
  });

  test("markAllDirty marks all visible tiles", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100 });
    tm.setViewport(20, 50);
    tm.clearDirty();
    tm.markAllDirty();

    expect(tm.isTileDirty(20)).toBe(true);
    expect(tm.isTileDirty(30)).toBe(true);
    expect(tm.isTileDirty(40)).toBe(true);
    // Tiles outside viewport not marked
    expect(tm.isTileDirty(10)).toBe(false);
    expect(tm.isTileDirty(50)).toBe(false);
  });

  test("markDocumentDirty marks all tiles in document", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 35 });
    tm.markDocumentDirty();

    expect(tm.isTileDirty(0)).toBe(true);
    expect(tm.isTileDirty(10)).toBe(true);
    expect(tm.isTileDirty(20)).toBe(true);
    expect(tm.isTileDirty(30)).toBe(true);
  });
});

describe("TileManager isRowDirty", () => {
  test("isRowDirty returns true for dirty tile", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100 });
    tm.markRowDirty(25);

    // All rows in tile 20-30 should be dirty
    expect(tm.isRowDirty(20)).toBe(true);
    expect(tm.isRowDirty(25)).toBe(true);
    expect(tm.isRowDirty(29)).toBe(true);
    expect(tm.isRowDirty(19)).toBe(false);
    expect(tm.isRowDirty(30)).toBe(false);
  });
});

describe("TileManager getDirtyTiles", () => {
  test("getDirtyTiles returns only dirty tiles in viewport", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100 });
    tm.setViewport(20, 60);
    tm.clearDirty();

    tm.markRowDirty(25);  // tile 20
    tm.markRowDirty(45);  // tile 40
    tm.markRowDirty(95);  // tile 90 (outside viewport)

    const dirty = tm.getDirtyTiles();
    expect(dirty.length).toBe(2);
    expect(dirty[0]?.startRow).toBe(20);
    expect(dirty[0]?.endRow).toBe(30);
    expect(dirty[0]?.dirty).toBe(true);
    expect(dirty[1]?.startRow).toBe(40);
    expect(dirty[1]?.endRow).toBe(50);
    expect(dirty[1]?.dirty).toBe(true);
  });

  test("getDirtyTiles returns empty array when no dirty tiles", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100 });
    tm.setViewport(20, 50);
    tm.clearDirty();

    const dirty = tm.getDirtyTiles();
    expect(dirty.length).toBe(0);
  });

  test("getDirtyTiles clips endRow to totalLines", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 35 });
    tm.setViewport(30, 40);
    tm.clearDirty();
    tm.markRowDirty(32);

    const dirty = tm.getDirtyTiles();
    expect(dirty.length).toBe(1);
    expect(dirty[0]?.startRow).toBe(30);
    expect(dirty[0]?.endRow).toBe(35); // clipped to totalLines
  });
});

describe("TileManager getVisibleTiles", () => {
  test("getVisibleTiles returns all tiles in viewport with dirty state", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100 });
    tm.setViewport(20, 50);
    tm.clearDirty();
    tm.markRowDirty(25);

    const tiles = tm.getVisibleTiles();
    expect(tiles.length).toBe(3);

    expect(tiles[0]?.startRow).toBe(20);
    expect(tiles[0]?.dirty).toBe(true);

    expect(tiles[1]?.startRow).toBe(30);
    expect(tiles[1]?.dirty).toBe(false);

    expect(tiles[2]?.startRow).toBe(40);
    expect(tiles[2]?.dirty).toBe(false);
  });

  test("getVisibleTiles handles empty viewport", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100 });
    // Don't set viewport, stays at 0-0
    const tiles = tm.getVisibleTiles();
    expect(tiles.length).toBe(1); // Just tile 0
  });
});

describe("TileManager clearDirty", () => {
  test("clearDirty clears all dirty flags", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100 });
    tm.markDirty(0, 50);
    expect(tm.dirtyCount).toBe(5);

    tm.clearDirty();
    expect(tm.dirtyCount).toBe(0);
  });

  test("clearTileDirty clears single tile", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100 });
    tm.markDirty(0, 30);
    expect(tm.dirtyCount).toBe(3);

    tm.clearTileDirty(10);
    expect(tm.dirtyCount).toBe(2);
    expect(tm.isTileDirty(0)).toBe(true);
    expect(tm.isTileDirty(10)).toBe(false);
    expect(tm.isTileDirty(20)).toBe(true);
  });

  test("clearDirty resets frameInvalidationCount", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100 });
    tm.markRowDirty(5);
    tm.markRowDirty(15);
    expect(tm.frameInvalidationCount).toBe(2);

    tm.clearDirty();
    expect(tm.frameInvalidationCount).toBe(0);
  });
});

describe("TileManager coalescing", () => {
  test("multiple markDirty calls for same tile count as separate invalidations", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100 });

    tm.markRowDirty(5);
    tm.markRowDirty(7);
    tm.markRowDirty(8);

    // All 3 invalidations counted (for debugging/metrics)
    expect(tm.frameInvalidationCount).toBe(3);
    // But only 1 tile is dirty (coalesced into single tile)
    expect(tm.dirtyCount).toBe(1);
  });

  test("markDirty spanning multiple tiles counts each tile", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100 });

    tm.markDirty(5, 35);

    // Rows 5-34 span tiles 0, 10, 20, 30 → 4 tiles
    expect(tm.frameInvalidationCount).toBe(4);
    expect(tm.dirtyCount).toBe(4);
  });
});

describe("markEditDirty helper", () => {
  test("single-line edit marks only that row's tile", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100 });

    markEditDirty(tm, 25, 100, 100); // no line count change

    expect(tm.isTileDirty(20)).toBe(true);
    expect(tm.isTileDirty(30)).toBe(false);
    expect(tm.dirtyCount).toBe(1);
  });

  test("edit that adds lines marks from edit point to end", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 105 });

    // Adding 5 lines shifts everything after row 25 down
    markEditDirty(tm, 25, 100, 105);

    // Should mark from row 25 to end
    expect(tm.isTileDirty(10)).toBe(false);
    expect(tm.isTileDirty(20)).toBe(true);
    expect(tm.isTileDirty(30)).toBe(true);
    expect(tm.isTileDirty(100)).toBe(true);
  });

  test("edit that removes lines marks from edit point to end", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 95 });

    // Removing 5 lines shifts everything after row 25 up
    markEditDirty(tm, 25, 100, 95);

    // Should mark from row 25 to end
    expect(tm.isTileDirty(10)).toBe(false);
    expect(tm.isTileDirty(20)).toBe(true);
    expect(tm.isTileDirty(90)).toBe(true);
  });
});

describe("markSelectionDirty helper", () => {
  test("new selection marks the selected range", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100 });

    markSelectionDirty(tm, undefined, undefined, 15, 35);

    expect(tm.isTileDirty(10)).toBe(true);
    expect(tm.isTileDirty(20)).toBe(true);
    expect(tm.isTileDirty(30)).toBe(true);
    expect(tm.isTileDirty(0)).toBe(false);
    expect(tm.isTileDirty(40)).toBe(false);
  });

  test("selection expansion marks only newly selected rows", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100 });

    // Old selection: rows 20-30 inclusive, new selection: rows 20-50 inclusive
    markSelectionDirty(tm, 20, 30, 20, 50);

    // Only rows 31-50 are newly selected (inclusive on both ends)
    expect(tm.isTileDirty(20)).toBe(false); // was selected, still selected
    expect(tm.isTileDirty(30)).toBe(true);  // row 31 newly selected
    expect(tm.isTileDirty(40)).toBe(true);  // row 41 newly selected
    expect(tm.isTileDirty(50)).toBe(true);  // row 50 is inclusive end, newly selected
  });

  test("selection contraction marks deselected rows", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100 });

    // Old selection: 20-50, new selection: 20-30
    markSelectionDirty(tm, 20, 50, 20, 30);

    // Rows 31-50 are no longer selected
    expect(tm.isTileDirty(20)).toBe(false); // still selected
    expect(tm.isTileDirty(30)).toBe(true);  // row 31 deselected
    expect(tm.isTileDirty(40)).toBe(true);  // row 41 deselected
  });

  test("selection move marks both old and new ranges", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100 });

    // Old selection: 10-20, new selection: 40-50 (completely different)
    markSelectionDirty(tm, 10, 20, 40, 50);

    // Old range deselected
    expect(tm.isTileDirty(10)).toBe(true);
    // New range selected
    expect(tm.isTileDirty(40)).toBe(true);
    // In between not affected
    expect(tm.isTileDirty(30)).toBe(false);
  });

  test("selection unchanged does not mark anything", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100 });

    markSelectionDirty(tm, 20, 30, 20, 30);

    expect(tm.dirtyCount).toBe(0);
  });

  test("reversed selection is normalized", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100 });

    // Selection with end before start (cursor before anchor)
    markSelectionDirty(tm, undefined, undefined, 30, 10);

    // Should mark 10-30 regardless of order
    expect(tm.isTileDirty(10)).toBe(true);
    expect(tm.isTileDirty(20)).toBe(true);
    expect(tm.isTileDirty(30)).toBe(true);
  });
});

describe("TileManager edge cases", () => {
  test("handles tile size of 1", () => {
    const tm = new TileManager({ linesPerTile: 1, totalLines: 10 });
    tm.setViewport(0, 5);
    tm.clearDirty();
    tm.markRowDirty(3);

    expect(tm.isTileDirty(2)).toBe(false);
    expect(tm.isTileDirty(3)).toBe(true);
    expect(tm.isTileDirty(4)).toBe(false);
  });

  test("handles very large tile size", () => {
    const tm = new TileManager({ linesPerTile: 1000, totalLines: 5000 });
    tm.setViewport(500, 1500);

    // Viewport 500-1500 spans tile 0 (rows 0-1000) and tile 1000 (rows 1000-2000)
    const tiles = tm.getVisibleTiles();
    expect(tiles.length).toBe(2);
    expect(tiles[0]?.startRow).toBe(0);
    expect(tiles[0]?.endRow).toBe(1000);
    expect(tiles[1]?.startRow).toBe(1000);
    expect(tiles[1]?.endRow).toBe(2000);
  });

  test("handles empty document", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 0 });
    tm.setViewport(0, 0);

    const tiles = tm.getVisibleTiles();
    expect(tiles.length).toBe(1);
    expect(tiles[0]?.startRow).toBe(0);
    expect(tiles[0]?.endRow).toBe(0);
  });

  test("handles row at exact tile boundary", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100 });

    tm.markRowDirty(10); // First row of tile 10
    expect(tm.isTileDirty(0)).toBe(false);
    expect(tm.isTileDirty(10)).toBe(true);

    tm.clearDirty();

    tm.markRowDirty(19); // Last row of tile 10
    expect(tm.isTileDirty(10)).toBe(true);
    expect(tm.isTileDirty(20)).toBe(false);
  });

  test("handles markDirty at document boundaries", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 35 });

    // Mark from row 0
    tm.markDirty(0, 5);
    expect(tm.isTileDirty(0)).toBe(true);

    tm.clearDirty();

    // Mark to end of document
    tm.markDirty(30, 35);
    expect(tm.isTileDirty(30)).toBe(true);
  });

  test("viewport at end of document", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 35 });
    tm.setViewport(25, 35);
    tm.clearDirty();

    const tiles = tm.getVisibleTiles();
    expect(tiles.length).toBe(2); // tiles 20 and 30
    expect(tiles[1]?.endRow).toBe(35); // clipped to totalLines
  });

  test("viewport taller than the document does not invert tile ranges", () => {
    // A 5-line file in a 40-row editor: tiles 10, 20 and 30 lie entirely past
    // the end of the document. Clipping endRow to totalLines must not push it
    // below startRow — endRow is exclusive, so endRow < startRow is not a
    // representable range.
    const tm = new TileManager({ linesPerTile: 10, totalLines: 5 });
    tm.setViewport(0, 40);

    for (const tile of tm.getVisibleTiles()) {
      expect(tile.endRow).toBeGreaterThanOrEqual(tile.startRow);
    }
    for (const tile of tm.getDirtyTiles()) {
      expect(tile.endRow).toBeGreaterThanOrEqual(tile.startRow);
    }

    // Tiles within the document keep their clipped extent.
    expect(tm.getVisibleTiles()[0]).toEqual({ startRow: 0, endRow: 5, dirty: true });
  });

  test("no configuration emits a tile whose exclusive endRow precedes its startRow", () => {
    for (const linesPerTile of [1, 10, 25]) {
      for (const totalLines of [0, 1, 5, 35, 100]) {
        for (const startRow of [0, 5, 30, 90]) {
          for (const height of [0, 1, 33, 120]) {
            const tm = new TileManager({ linesPerTile, totalLines });
            tm.setViewport(startRow, startRow + height);

            for (const tile of [...tm.getVisibleTiles(), ...tm.getDirtyTiles()]) {
              expect(tile.endRow).toBeGreaterThanOrEqual(tile.startRow);
            }
          }
        }
      }
    }
  });
});

describe("TileManager performance characteristics", () => {
  test("dirty tracking uses Set for O(1) operations", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100000 });

    // Mark many tiles dirty
    const start = performance.now();
    for (let i = 0; i < 1000; i++) {
      tm.markRowDirty(i * 100);
    }
    const markTime = performance.now() - start;

    // Should be very fast (Set.add is O(1))
    expect(markTime).toBeLessThan(10);

    // Check dirty should also be fast
    const checkStart = performance.now();
    for (let i = 0; i < 1000; i++) {
      tm.isTileDirty(i * 100);
    }
    const checkTime = performance.now() - checkStart;
    expect(checkTime).toBeLessThan(10);
  });

  test("single-char edit on large file only marks one tile", () => {
    const tm = new TileManager({ linesPerTile: 10, totalLines: 100000 });
    tm.setViewport(50000, 50100);
    tm.clearDirty();

    // Single character edit in middle of large file
    markEditDirty(tm, 50050, 100000, 100000);

    expect(tm.dirtyCount).toBe(1);
    expect(tm.isTileDirty(50050)).toBe(true);
  });
});
