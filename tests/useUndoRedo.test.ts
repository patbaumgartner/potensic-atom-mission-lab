// @vitest-environment jsdom
/* eslint-disable no-useless-assignment -- current is read inside closures/assertions */
import { describe, expect, it, vi } from "vitest";
// useUndoRedo is a pure-state hook; we test the exported behaviour via its
// return values driven by direct state manipulation simulations.
// We instantiate it via a tiny React state simulator to keep it DOM-free.

import { useUndoRedo } from "../src/hooks/useUndoRedo";
import { renderHook, act } from "@testing-library/react";

describe("useUndoRedo", () => {
  it("commit + undo restores the previous value", () => {
    let current = "a";
    const setValue = (v: string) => {
      current = v;
    };
    const { result, rerender } = renderHook(({ val }) => useUndoRedo(val, setValue), {
      initialProps: { val: "a" },
    });

    act(() => result.current.commit());
    current = "b";
    rerender({ val: "b" });

    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);

    act(() => result.current.undo());
    expect(current).toBe("a");
  });

  it("redo restores a value that was undone", () => {
    let current = "a";
    const setValue = (v: string) => {
      current = v;
    };
    const { result, rerender } = renderHook(({ val }) => useUndoRedo(val, setValue), {
      initialProps: { val: "a" },
    });

    act(() => result.current.commit());
    current = "b";
    rerender({ val: "b" });
    act(() => result.current.undo());
    rerender({ val: current });

    expect(result.current.canRedo).toBe(true);
    act(() => result.current.redo());
    expect(current).toBe("b");
  });

  it("canUndo and canRedo are false initially", () => {
    const { result } = renderHook(() => useUndoRedo("x", () => {}));
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("commit clears the redo stack", () => {
    let current = "a";
    const setValue = (v: string) => {
      current = v;
    };
    const { result, rerender } = renderHook(({ val }) => useUndoRedo(val, setValue), {
      initialProps: { val: "a" },
    });

    act(() => result.current.commit());
    current = "b";
    rerender({ val: "b" });
    act(() => result.current.undo());
    rerender({ val: current });

    // Now commit a new value — redo stack should be cleared
    act(() => result.current.commit());
    current = "c";
    rerender({ val: "c" });

    expect(result.current.canRedo).toBe(false);
  });

  it("undo does nothing when history is empty", () => {
    const setValue = vi.fn();
    const { result } = renderHook(() => useUndoRedo("x", setValue));
    act(() => result.current.undo());
    expect(setValue).not.toHaveBeenCalled();
  });

  it("redo does nothing when future stack is empty", () => {
    const setValue = vi.fn();
    const { result } = renderHook(() => useUndoRedo("x", setValue));
    act(() => result.current.redo());
    expect(setValue).not.toHaveBeenCalled();
  });
});
