export { createDomRenderer, DomRenderer } from "./dom.ts";
export type { SyntaxHighlighter, Token } from "./highlighter.ts";
export { buildHighlightedSpans, Highlighter } from "./highlighter.ts";
export {
  buildHighlightedSpans as buildHighlightedSpansWithInjection,
  InjectionHighlighter,
} from "./injection-highlighter.ts";
export {
  calculateContentHeight,
  calculateVisibleRows,
  createViewport,
  rowToY,
  xToColumn,
  yToRow,
  yToVisualRow,
} from "./measurement.ts";
export { colorForNodeType, GRUVBOX_THEME, THEME_CSS_VARIABLES } from "./theme.ts";
export * from "./types.ts";
export { charColToVisualCol, visualColToCharCol, visualWidth, WrapMap, wrapLine } from "./wrap-map.ts";
