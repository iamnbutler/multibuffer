// Re-export all types

export {
  adjustOffset,
  anchorsEqual,
  compareAnchors,
  createAnchorRange,
  createSelection,
  resolveAnchorRange,
  reverseSelection,
} from "./anchor.ts";
// Implementation exports
export { createBuffer } from "./buffer.ts";
export { createMultiBuffer } from "./multibuffer.ts";
export { keysCompare, keysEqual, type SlotKey, SlotMap } from "./slot_map.ts";
export * from "./types.ts";
