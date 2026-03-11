/**
 * Lightweight DOM renderer for unified diff views.
 *
 * Renders a scrollable list of diff lines with:
 * - Color-coded backgrounds (red for deletes, green for inserts)
 * - Dual gutter showing old/new line numbers
 * - File headers with change statistics
 */

import type { UnifiedDiff, UnifiedDiffLine } from "../src/diff/unified.ts";

/** Gruvbox-inspired diff colors */
const COLORS = {
  deleteBg: "rgba(204, 36, 29, 0.15)",
  deleteGutter: "rgba(204, 36, 29, 0.25)",
  deleteText: "#fb4934",
  deleteSign: "#cc241d",
  insertBg: "rgba(152, 151, 26, 0.15)",
  insertGutter: "rgba(152, 151, 26, 0.25)",
  insertText: "#b8bb26",
  insertSign: "#98971a",
  equalText: "#ebdbb2",
  gutterText: "#665c54",
  headerBg: "#3c3836",
  headerBorder: "#504945",
  headerText: "#a89984",
  statInsert: "#b8bb26",
  statDelete: "#fb4934",
} as const;

interface DiffFileEntry {
  readonly label: string;
  readonly diff: UnifiedDiff;
}

/**
 * Mount a unified diff view into a container element.
 * Returns an unmount function.
 */
export function mountDiffView(
  container: HTMLElement,
  files: readonly DiffFileEntry[],
): () => void {
  const scrollContainer = document.createElement("div");
  scrollContainer.style.cssText =
    "position:relative;overflow-y:auto;height:100%;width:100%;overscroll-behavior:none;";

  const content = document.createElement("div");
  content.style.cssText = "padding:0;";

  for (const file of files) {
    content.appendChild(renderFileHeader(file.label, file.diff));
    content.appendChild(renderDiffLines(file.diff.lines));
  }

  scrollContainer.appendChild(content);
  container.appendChild(scrollContainer);

  return () => {
    container.removeChild(scrollContainer);
  };
}

function renderFileHeader(label: string, diff: UnifiedDiff): HTMLElement {
  const header = document.createElement("div");
  header.style.cssText = [
    `background:${COLORS.headerBg}`,
    `border-bottom:1px solid ${COLORS.headerBorder}`,
    "padding:8px 12px",
    "display:flex",
    "align-items:center",
    "gap:12px",
    "position:sticky",
    "top:0",
    "z-index:10",
  ].join(";");

  const pathEl = document.createElement("span");
  pathEl.textContent = label;
  pathEl.style.cssText = `color:${COLORS.headerText};font-weight:bold;font-size:0.9em;flex:1;`;

  const statsEl = document.createElement("span");
  statsEl.style.cssText = "font-size:0.85em;display:flex;gap:8px;";

  if (diff.isEqual) {
    const eq = document.createElement("span");
    eq.textContent = "No changes";
    eq.style.color = COLORS.gutterText;
    statsEl.appendChild(eq);
  } else {
    if (diff.stats.inserts > 0) {
      const ins = document.createElement("span");
      ins.textContent = `+${diff.stats.inserts}`;
      ins.style.color = COLORS.statInsert;
      statsEl.appendChild(ins);
    }
    if (diff.stats.deletes > 0) {
      const del = document.createElement("span");
      del.textContent = `\u2212${diff.stats.deletes}`;
      del.style.color = COLORS.statDelete;
      statsEl.appendChild(del);
    }
  }

  header.appendChild(pathEl);
  header.appendChild(statsEl);
  return header;
}

function renderDiffLines(lines: readonly UnifiedDiffLine[]): HTMLElement {
  const wrapper = document.createElement("div");
  wrapper.style.cssText = "margin-bottom:16px;";

  // Track separate old/new line counters for accurate dual-gutter display.
  // Each line kind advances its respective counter(s).
  let oldLineNum = 0;
  let newLineNum = 0;

  // Seed counters from first line of each kind
  for (const line of lines) {
    if (line.kind === "delete" || line.kind === "equal") {
      oldLineNum = line.sourceRow;
      break;
    }
  }
  for (const line of lines) {
    if (line.kind === "insert" || line.kind === "equal") {
      newLineNum = line.sourceRow;
      break;
    }
  }

  for (const line of lines) {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;height:20px;line-height:20px;white-space:pre;";

    const oldGutter = document.createElement("span");
    oldGutter.style.cssText =
      `display:inline-block;width:40px;text-align:right;padding-right:4px;color:${COLORS.gutterText};user-select:none;flex-shrink:0;font-size:0.9em;`;

    const newGutter = document.createElement("span");
    newGutter.style.cssText =
      `display:inline-block;width:40px;text-align:right;padding-right:4px;color:${COLORS.gutterText};user-select:none;flex-shrink:0;font-size:0.9em;`;

    const sign = document.createElement("span");
    sign.style.cssText =
      "display:inline-block;width:16px;text-align:center;user-select:none;flex-shrink:0;";

    const text = document.createElement("span");
    text.style.cssText = "flex:1;overflow:hidden;padding-left:4px;";
    text.textContent = line.text;

    switch (line.kind) {
      case "delete":
        row.style.background = COLORS.deleteBg;
        oldGutter.style.background = COLORS.deleteGutter;
        oldGutter.textContent = String(oldLineNum + 1);
        newGutter.textContent = "";
        newGutter.style.background = COLORS.deleteGutter;
        sign.textContent = "\u2212";
        sign.style.color = COLORS.deleteSign;
        sign.style.background = COLORS.deleteBg;
        text.style.color = COLORS.deleteText;
        oldLineNum++;
        break;
      case "insert":
        row.style.background = COLORS.insertBg;
        oldGutter.textContent = "";
        oldGutter.style.background = COLORS.insertGutter;
        newGutter.style.background = COLORS.insertGutter;
        newGutter.textContent = String(newLineNum + 1);
        sign.textContent = "+";
        sign.style.color = COLORS.insertSign;
        sign.style.background = COLORS.insertBg;
        text.style.color = COLORS.insertText;
        newLineNum++;
        break;
      case "equal":
        oldGutter.textContent = String(oldLineNum + 1);
        newGutter.textContent = String(newLineNum + 1);
        sign.textContent = " ";
        text.style.color = COLORS.equalText;
        oldLineNum++;
        newLineNum++;
        break;
    }

    row.appendChild(oldGutter);
    row.appendChild(newGutter);
    row.appendChild(sign);
    row.appendChild(text);
    wrapper.appendChild(row);
  }

  return wrapper;
}
