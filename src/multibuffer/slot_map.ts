/**
 * A generational arena / slot map for TypeScript.
 *
 * Inspired by Rust's `slotmap` crate. Provides:
 * - O(1) insert, remove, and lookup
 * - Generational keys that detect stale references
 * - Slot reuse without key collisions
 *
 * Keys are { index, generation } pairs. When a slot is freed and reused,
 * the generation increments, so old keys pointing to that slot return undefined.
 */

/**
 * A generational key into a SlotMap.
 * Two numbers packed together: index (which slot) and generation (which occupant).
 */
export interface SlotKey {
  readonly index: number;
  readonly generation: number;
}

interface Slot<V> {
  generation: number;
  value: V | undefined;
  occupied: boolean;
}

/**
 * A generational arena that maps keys to values.
 *
 * When a value is removed, its slot is recycled. The generation increments,
 * so any old keys pointing to that slot will fail the generation check
 * and return undefined. No bookkeeping needed.
 */
export class SlotMap<V> {
  private slots: Slot<V>[] = [];
  private freeList: number[] = [];
  private _size = 0;

  get size(): number {
    return this._size;
  }

  private slotAt(index: number): Slot<V> | undefined {
    return this.slots[index];
  }

  /**
   * Insert a value and return its key.
   */
  insert(value: V): SlotKey {
    let index: number;
    let generation: number;

    const freeIndex = this.freeList.pop();
    if (freeIndex !== undefined) {
      index = freeIndex;
      const slot = this.slotAt(index);
      if (slot) {
        slot.value = value;
        slot.occupied = true;
        generation = slot.generation;
      } else {
        generation = 0;
      }
    } else {
      index = this.slots.length;
      generation = 0;
      this.slots.push({ generation, value, occupied: true });
    }

    this._size++;
    return { index, generation };
  }

  /**
   * Get the value for a key, or undefined if the key is stale/invalid.
   */
  get(key: SlotKey): V | undefined {
    const slot = this.slotAt(key.index);
    if (slot?.occupied && slot.generation === key.generation) {
      return slot.value;
    }
    return undefined;
  }

  /**
   * Check if a key is still valid (points to a live value).
   */
  has(key: SlotKey): boolean {
    const slot = this.slotAt(key.index);
    return slot?.occupied === true && slot.generation === key.generation;
  }

  /**
   * Update the value at a key. Returns true if the key was valid and the value was set.
   */
  set(key: SlotKey, value: V): boolean {
    const slot = this.slotAt(key.index);
    if (slot?.occupied && slot.generation === key.generation) {
      slot.value = value;
      return true;
    }
    return false;
  }

  /**
   * Remove the value at a key. Returns the value if it was present.
   * The slot is freed for reuse with an incremented generation.
   */
  remove(key: SlotKey): V | undefined {
    const slot = this.slotAt(key.index);
    if (!slot?.occupied || slot.generation !== key.generation) {
      return undefined;
    }

    const value = slot.value;
    slot.value = undefined;
    slot.occupied = false;
    slot.generation++;
    this.freeList.push(key.index);
    this._size--;
    return value;
  }

  /**
   * Iterate over all live (key, value) pairs.
   */
  *entries(): IterableIterator<[SlotKey, V]> {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slotAt(i);
      if (slot?.occupied && slot.value !== undefined) {
        yield [{ index: i, generation: slot.generation }, slot.value];
      }
    }
  }

  /**
   * Iterate over all live values.
   */
  *values(): IterableIterator<V> {
    for (const slot of this.slots) {
      if (slot.occupied && slot.value !== undefined) {
        yield slot.value;
      }
    }
  }

  /**
   * Iterate over all live keys.
   */
  *keys(): IterableIterator<SlotKey> {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slotAt(i);
      if (slot?.occupied) {
        yield { index: i, generation: slot.generation };
      }
    }
  }

  /**
   * Remove all entries.
   */
  clear(): void {
    for (let i = 0; i < this.slots.length; i++) {
      const slot = this.slotAt(i);
      if (slot?.occupied) {
        slot.value = undefined;
        slot.occupied = false;
        slot.generation++;
        this.freeList.push(i);
      }
    }
    this._size = 0;
  }
}

// =============================================================================
// Key Utilities
// =============================================================================

/**
 * Compare two SlotKeys for equality.
 */
export function keysEqual(a: SlotKey, b: SlotKey): boolean {
  return a.index === b.index && a.generation === b.generation;
}

/**
 * Compare two SlotKeys for ordering (by index, then generation).
 */
export function keysCompare(a: SlotKey, b: SlotKey): number {
  if (a.index !== b.index) return a.index - b.index;
  return a.generation - b.generation;
}
