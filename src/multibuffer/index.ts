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
export { keysCompare, keysEqual, type SlotKey, SlotMap } from "./slot_map.ts";
export * from "./types.ts";

// Implementation exports will go here as they're created
// export { createBuffer } from "./buffer.ts";
// export { createExcerpt } from "./excerpt.ts";
// export { createMultiBuffer } from "./multibuffer.ts";
