import type { BaselineSnapshot, InventoryItem } from "../types";

export function diffItems(
  previous: BaselineSnapshot | undefined,
  current: InventoryItem[],
): { added: InventoryItem[]; changed: InventoryItem[]; removed: InventoryItem[] } {
  const prev = previous?.items || {};
  const added: InventoryItem[] = [];
  const changed: InventoryItem[] = [];
  const currentKeys = new Set<string>();
  for (const item of current) {
    currentKeys.add(item.key);
    const old = prev[item.key];
    if (!old) {
      added.push(item);
    } else if (old.hash !== item.hash) {
      changed.push(item);
    }
  }
  const removed: InventoryItem[] = [];
  for (const [key, item] of Object.entries(prev)) {
    if (!currentKeys.has(key)) {
      removed.push(item);
    }
  }
  return { added, changed, removed };
}
