import { useState } from "react";

/**
 * Generic undo/redo stack that tracks a single piece of React state.
 *
 * @param value    The current value to snapshot on `commit`.
 * @param setValue The state setter used to restore previous / future values.
 * @param maxDepth Maximum undo steps to keep (default 49).
 */
export function useUndoRedo<T>(value: T, setValue: (v: T) => void, maxDepth = 49) {
  const [past, setPast] = useState<T[]>([]);
  const [futureStack, setFutureStack] = useState<T[]>([]);

  /** Snapshot the current value before mutating it. */
  const commit = () => {
    setPast((p) => [...p.slice(-maxDepth), value]);
    setFutureStack([]);
  };

  const undo = () => {
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    setValue(prev);
    setFutureStack((f) => [value, ...f]);
    setPast((p) => p.slice(0, -1));
  };

  const redo = () => {
    if (futureStack.length === 0) return;
    const next = futureStack[0];
    setValue(next);
    setPast((p) => [...p, value]);
    setFutureStack((f) => f.slice(1));
  };

  return {
    commit,
    undo,
    redo,
    canUndo: past.length > 0,
    canRedo: futureStack.length > 0,
  };
}
