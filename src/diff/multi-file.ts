/**
 * Multi-file diff orchestrator.
 *
 * Composes multiple file diffs into a single coordinated view with:
 * - Per-file headers showing filename and change stats
 * - Collapse/expand per file
 * - Scroll-to-file navigation
 * - Lazy rendering for large file counts
 * - Aggregated statistics
 */

import { createBuffer } from "../buffer/buffer.ts";
import type { Buffer, BufferId } from "../buffer/types.ts";
import type { MultiBufferRow } from "../multibuffer/types.ts";
import type { Decoration } from "../renderer/types.ts";
import type { DiffController, DiffControllerOptions } from "./controller.ts";
import { createDiffController } from "./controller.ts";
import { diff } from "./diff.ts";
import type {
  FileDiffEntry,
  FileDiffState,
  FileDiffStats,
  MultiFileDiff,
  MultiFileDiffOptions,
  MultiFileDiffStats,
} from "./types.ts";

let _multiFileDiffCounter = 0;

/** Reset the internal counter (for test isolation). */
export function resetMultiFileDiffCounter(): void {
  _multiFileDiffCounter = 0;
}

function nextMultiFileBufferId(prefix: string, filename: string): BufferId {
  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for internal buffer ID
  return `mfdiff-${_multiFileDiffCounter++}-${prefix}-${filename}` as BufferId;
}

/**
 * Internal state for a single file within the multi-file diff.
 */
interface InternalFileState {
  readonly entry: FileDiffEntry;
  stats: FileDiffStats;
  collapsed: boolean;
  initialized: boolean;
  isEqual: boolean;
  controller: DiffController | null;
  oldBuffer: Buffer | null;
  newBuffer: Buffer | null;
  element: HTMLElement | null;
  headerElement: HTMLElement | null;
  contentElement: HTMLElement | null;
  /** Direct reference to the collapse icon — avoids querySelector on happy-dom. */
  collapseIconElement: HTMLElement | null;
  /** Direct reference to the stats additions span. */
  statsAdditionsElement: HTMLElement | null;
  /** Direct reference to the stats deletions span. */
  statsDeletionsElement: HTMLElement | null;
}

/**
 * Compute diff statistics for a file without creating full buffers/controller.
 * Used for lazy rendering to show stats before full initialization.
 */
function computeFileDiffStats(
  oldContent: string,
  newContent: string,
  context?: number,
): { stats: FileDiffStats; isEqual: boolean } {
  const result = diff(oldContent, newContent, { context });

  if (result.isEqual) {
    return { stats: { additions: 0, deletions: 0 }, isEqual: true };
  }

  let additions = 0;
  let deletions = 0;

  for (const hunk of result.hunks) {
    for (const line of hunk.lines) {
      if (line.kind === "insert") {
        additions++;
      } else if (line.kind === "delete") {
        deletions++;
      }
    }
  }

  return { stats: { additions, deletions }, isEqual: false };
}

/**
 * Create the DOM structure for a file diff section.
 */
function createFileDiffElement(
  state: InternalFileState,
  onToggle: (filename: string) => void,
): { root: HTMLElement; header: HTMLElement; content: HTMLElement } {
  const root = document.createElement("div");
  root.className = "multi-file-diff-file";
  root.style.cssText = "margin-bottom: 8px;";
  root.dataset.filename = state.entry.filename;

  // Header
  const header = document.createElement("div");
  header.className = "multi-file-diff-header";
  header.style.cssText =
    "display: flex; align-items: center; padding: 8px 12px; background: var(--editor-header-bg, #3c3836); border: 1px solid var(--editor-header-border, #504945); cursor: pointer; user-select: none;";

  // Collapse indicator
  const collapseIcon = document.createElement("span");
  collapseIcon.className = "multi-file-diff-collapse-icon";
  collapseIcon.style.cssText = "margin-right: 8px; font-family: monospace; width: 12px;";
  collapseIcon.textContent = state.collapsed ? "+" : "−";

  // Filename
  const filenameEl = document.createElement("span");
  filenameEl.className = "multi-file-diff-filename";
  filenameEl.style.cssText = "flex: 1; font-weight: bold; color: var(--editor-header-text, #ebdbb2);";

  if (state.entry.previousFilename) {
    filenameEl.textContent = `${state.entry.previousFilename} → ${state.entry.filename}`;
  } else {
    filenameEl.textContent = state.entry.filename;
  }

  // Stats
  const statsEl = document.createElement("span");
  statsEl.className = "multi-file-diff-stats";
  statsEl.style.cssText = "margin-left: 12px; font-size: 0.9em;";

  const additionsSpan = document.createElement("span");
  additionsSpan.style.cssText = "color: #4ade80; margin-right: 8px;";
  additionsSpan.textContent = `+${state.stats.additions}`;

  const deletionsSpan = document.createElement("span");
  deletionsSpan.style.cssText = "color: #f87171;";
  deletionsSpan.textContent = `−${state.stats.deletions}`;

  statsEl.appendChild(additionsSpan);
  statsEl.appendChild(deletionsSpan);

  header.appendChild(collapseIcon);
  header.appendChild(filenameEl);
  header.appendChild(statsEl);

  // Click handler for toggle
  header.addEventListener("click", () => {
    onToggle(state.entry.filename);
  });

  // Content container
  const content = document.createElement("div");
  content.className = "multi-file-diff-content";
  content.style.cssText = "border: 1px solid var(--editor-header-border, #504945); border-top: none;";

  if (state.collapsed) {
    content.style.display = "none";
  }

  root.appendChild(header);
  root.appendChild(content);

  // Store direct references to avoid querySelector (which fails on happy-dom)
  state.collapseIconElement = collapseIcon;
  state.statsAdditionsElement = additionsSpan;
  state.statsDeletionsElement = deletionsSpan;

  return { root, header, content };
}

/**
 * Update the header UI to reflect current state.
 */
function updateHeaderUI(state: InternalFileState): void {
  if (!state.headerElement) return;

  if (state.collapseIconElement) {
    state.collapseIconElement.textContent = state.collapsed ? "+" : "−";
  }

  if (state.statsAdditionsElement) {
    state.statsAdditionsElement.textContent = `+${state.stats.additions}`;
  }
  if (state.statsDeletionsElement) {
    state.statsDeletionsElement.textContent = `−${state.stats.deletions}`;
  }
}

/**
 * Build a row-indexed decoration lookup from a decoration list.
 * Each row maps to the first decoration whose range covers it, giving O(1) per-row access.
 */
function buildDecorationIndex(decorations: readonly Decoration[]): Map<number, Decoration> {
  const index = new Map<number, Decoration>();
  for (const d of decorations) {
    for (let r = d.range.start.row; r <= d.range.end.row; r++) {
      if (!index.has(r)) {
        index.set(r, d);
      }
    }
  }
  return index;
}

/**
 * Initialize the diff controller and renderer for a file.
 */
function initializeFileDiff(
  state: InternalFileState,
  options: { context?: number },
): void {
  if (state.initialized || !state.contentElement) return;

  // Create buffers
  const oldBuffer = createBuffer(
    nextMultiFileBufferId("old", state.entry.filename),
    state.entry.oldContent,
  );
  const newBuffer = createBuffer(
    nextMultiFileBufferId("new", state.entry.filename),
    state.entry.newContent,
  );

  state.oldBuffer = oldBuffer;
  state.newBuffer = newBuffer;

  // Create diff controller
  const controllerOptions: DiffControllerOptions = {
    context: options.context,
    editableEqual: false,
  };

  const controller = createDiffController(oldBuffer, newBuffer, controllerOptions);
  state.controller = controller;

  const diffView = document.createElement("div");
  diffView.className = "multi-file-diff-view";
  diffView.style.cssText =
    "font-family: monospace; font-size: 13px; line-height: 20px; background: var(--editor-bg, #282828); overflow: auto;";

  // Render the diff using the controller's multiBuffer snapshot
  const snap = controller.multiBuffer.snapshot();
  const lineCount = snap.lineCount;

  // biome-ignore lint/plugin/no-type-assertion: expect: branded type construction for MultiBufferRow
  const lines = snap.lines(0 as MultiBufferRow, lineCount as MultiBufferRow);

  // Pre-build O(1) row-to-decoration index (avoids O(n*d) inner-loop scan)
  const decorationIndex = buildDecorationIndex(controller.decorations);

  for (let i = 0; i < lines.length; i++) {
    const lineEl = document.createElement("div");
    lineEl.style.cssText = "padding: 0 12px; white-space: pre;";

    const decoration = decorationIndex.get(i);

    if (decoration?.style) {
      lineEl.style.backgroundColor = decoration.style.backgroundColor ?? "";
      const sign = decoration.style.gutterSign ?? " ";
      lineEl.textContent = `${sign} ${lines[i]}`;
      if (decoration.style.gutterSignColor) {
        lineEl.style.color = decoration.style.gutterSignColor;
      }
    } else {
      lineEl.textContent = `  ${lines[i]}`;
    }

    diffView.appendChild(lineEl);
  }

  state.contentElement.appendChild(diffView);
  state.initialized = true;
}

/**
 * Create a multi-file diff view.
 */
export function createMultiFileDiff(options: MultiFileDiffOptions): MultiFileDiff {
  const lazyRender = options.lazyRender ?? true;
  const context = options.context;

  // Internal state for each file
  const fileStates: InternalFileState[] = [];
  // O(1) filename-to-state lookup (avoids O(n) scan on every public method call)
  const fileStatesByName = new Map<string, InternalFileState>();

  // Compute initial stats for all files
  let totalAdditions = 0;
  let totalDeletions = 0;

  for (const entry of options.files) {
    const { stats, isEqual } = computeFileDiffStats(
      entry.oldContent,
      entry.newContent,
      context,
    );

    totalAdditions += stats.additions;
    totalDeletions += stats.deletions;

    const state: InternalFileState = {
      entry,
      stats,
      collapsed: false,
      initialized: false,
      isEqual,
      controller: null,
      oldBuffer: null,
      newBuffer: null,
      element: null,
      headerElement: null,
      contentElement: null,
      collapseIconElement: null,
      statsAdditionsElement: null,
      statsDeletionsElement: null,
    };
    fileStates.push(state);
    fileStatesByName.set(entry.filename, state);
  }

  const _stats: MultiFileDiffStats = {
    totalAdditions,
    totalDeletions,
    fileCount: options.files.length,
  };

  let _disposed = false;

  // Handle toggle from header click
  function handleToggle(filename: string): void {
    if (_disposed) return;

    const state = fileStatesByName.get(filename);
    if (!state) return;

    state.collapsed = !state.collapsed;

    if (state.contentElement) {
      state.contentElement.style.display = state.collapsed ? "none" : "";
    }

    updateHeaderUI(state);

    // Initialize if expanding and not yet initialized
    if (!state.collapsed && !state.initialized) {
      initializeFileDiff(state, { context });
    }

    options.onFileToggle?.(filename, state.collapsed);
  }

  // Create DOM elements for each file
  function mountFiles(): void {
    const container = options.container;

    for (const state of fileStates) {
      const { root, header, content } = createFileDiffElement(state, handleToggle);

      state.element = root;
      state.headerElement = header;
      state.contentElement = content;

      container.appendChild(root);
    }
  }

  // Initialize files (either all or lazily)
  function initializeFiles(): void {
    if (lazyRender) {
      // With lazy rendering, initialize files that would be visible
      // For simplicity, initialize the first file if any
      const firstState = fileStates[0];
      if (firstState && !firstState.collapsed) {
        initializeFileDiff(firstState, { context });
      }
    } else {
      // Initialize all files immediately
      for (const state of fileStates) {
        if (!state.collapsed) {
          initializeFileDiff(state, { context });
        }
      }
    }
  }

  // Mount if we're in a browser environment
  if (typeof document !== "undefined" && typeof options.container.appendChild === "function") {
    mountFiles();
    initializeFiles();
  }

  // Build public file state view
  function getFiles(): readonly FileDiffState[] {
    return fileStates.map((s) => ({
      filename: s.entry.filename,
      previousFilename: s.entry.previousFilename,
      stats: s.stats,
      collapsed: s.collapsed,
      initialized: s.initialized,
      isEqual: s.isEqual,
    }));
  }

  function collapseFile(filename: string): void {
    if (_disposed) return;

    const state = fileStatesByName.get(filename);
    if (!state || state.collapsed) return;

    state.collapsed = true;
    if (state.contentElement) {
      state.contentElement.style.display = "none";
    }
    updateHeaderUI(state);
    options.onFileToggle?.(filename, true);
  }

  function expandFile(filename: string): void {
    if (_disposed) return;

    const state = fileStatesByName.get(filename);
    if (!state || !state.collapsed) return;

    state.collapsed = false;
    if (state.contentElement) {
      state.contentElement.style.display = "";
    }
    updateHeaderUI(state);

    if (!state.initialized) {
      initializeFileDiff(state, { context });
    }

    options.onFileToggle?.(filename, false);
  }

  return {
    get stats() {
      return _stats;
    },

    get files() {
      return getFiles();
    },

    scrollToFile(filename: string): void {
      if (_disposed) return;

      const state = fileStatesByName.get(filename);
      if (!state) return;

      // Expand if collapsed
      if (state.collapsed) {
        state.collapsed = false;
        if (state.contentElement) {
          state.contentElement.style.display = "";
        }
        updateHeaderUI(state);

        if (!state.initialized) {
          initializeFileDiff(state, { context });
        }

        options.onFileToggle?.(filename, false);
      }

      // Scroll to element if it exists
      if (state.element?.scrollIntoView) {
        state.element.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    },

    collapseFile,
    expandFile,

    toggleFile(filename: string): void {
      if (_disposed) return;

      const state = fileStatesByName.get(filename);
      if (!state) return;

      if (state.collapsed) {
        expandFile(filename);
      } else {
        collapseFile(filename);
      }
    },

    collapseAll(): void {
      if (_disposed) return;

      for (const state of fileStates) {
        if (!state.collapsed) {
          state.collapsed = true;
          if (state.contentElement) {
            state.contentElement.style.display = "none";
          }
          updateHeaderUI(state);
        }
      }
      // Single batch notification instead of N individual callbacks
      for (const state of fileStates) {
        if (state.collapsed) {
          options.onFileToggle?.(state.entry.filename, true);
        }
      }
    },

    expandAll(): void {
      if (_disposed) return;

      for (const state of fileStates) {
        if (state.collapsed) {
          state.collapsed = false;
          if (state.contentElement) {
            state.contentElement.style.display = "";
          }
          updateHeaderUI(state);

          if (!state.initialized) {
            initializeFileDiff(state, { context });
          }
        }
      }
      // Single batch notification instead of N individual callbacks
      for (const state of fileStates) {
        if (!state.collapsed) {
          options.onFileToggle?.(state.entry.filename, false);
        }
      }
    },

    dispose(): void {
      if (_disposed) return;
      _disposed = true;

      // Dispose all controllers
      for (const state of fileStates) {
        state.controller?.dispose();
        state.controller = null;
        state.oldBuffer = null;
        state.newBuffer = null;

        // Remove DOM elements
        if (state.element?.parentNode) {
          state.element.parentNode.removeChild(state.element);
        }
        state.element = null;
        state.headerElement = null;
        state.contentElement = null;
      }
      fileStatesByName.clear();
    },
  };
}
