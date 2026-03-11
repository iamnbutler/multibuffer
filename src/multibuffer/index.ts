// Re-export all types (includes buffer types via re-export)


// Implementation exports
export { createBuffer } from "../buffer/buffer.ts";
// adjustOffset is re-exported from buffer for backward compatibility
export { adjustOffset } from "../buffer/offset.ts";
// Anchor utilities
export {
  anchorsEqual,
  compareAnchors,
  createAnchorRange,
  createSelection,
  resolveAnchorRange,
  reverseSelection,
} from "./anchor.ts";
export { createMultiBuffer } from "./multibuffer.ts";
export { keysCompare, keysEqual, type SlotKey, SlotMap } from "./slot_map.ts";
export * from "./types.ts";
