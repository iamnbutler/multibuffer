export { createDomRenderer, DomRenderer } from "./dom.ts";
export type { MultiLanguageHighlighterOptions, SyntaxHighlighter, Token, TreeEdit } from "./highlighter.ts";
export { buildHighlightedSpans, Highlighter, MultiLanguageHighlighter } from "./highlighter.ts";
export {
  buildHighlightedSpans as buildHighlightedSpansWithInjection,
  InjectionHighlighter,
} from "./injection-highlighter.ts";
export type { LanguageConfig, LanguageId } from "./languages.ts";
export { DEFAULT_GRAMMAR_URLS, detectLanguage, getGrammarName, isLanguageSupported } from "./languages.ts";
export {
  calculateContentHeight,
  calculateVisibleRows,
  createViewport,
  rowToY,
  xToColumn,
  yToRow,
  yToVisualRow,
} from "./measurement.ts";
export {
  colorForNodeType,
  GRUVBOX_DARK_THEME,
  GRUVBOX_THEME,
  LIGHT_THEME,
  THEME_CSS_VARIABLES,
  themeToVars,
} from "./theme.ts";
export * from "./types.ts";
export type { WrapMapOptions } from "./wrap-map.ts";
export { charColToVisualCol, visualColToCharCol, visualWidth, WrapMap, wrapLine } from "./wrap-map.ts";
