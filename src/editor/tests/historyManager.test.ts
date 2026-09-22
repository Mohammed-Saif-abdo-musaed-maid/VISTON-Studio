import { describe, it, expect } from "vitest";
import { HistoryManager } from "../core/history";

function makeEntry(name: string, bytes: number, log: string[]) {
  return {
    name,
    bytes,
    undo: () => log.push(`undo:${name}`),
    redo: () => log.push(`redo:${name}`),
  };
}

describe("HistoryManager", () => {
  it("records operations and replays undo/redo in the correct order", () => {
    const log: string[] = [];
    const h = new HistoryManager();
    h.push(makeEntry("A", 10, log));
    h.push(makeEntry("B", 10, log));
    expect(h.currentIndex()).toBe(1);
    expect(h.items().map((i) => i.name)).toEqual(["A", "B"]);

    expect(h.undo()).toBe(true);
    expect(log).toEqual(["undo:B"]);
    expect(h.currentIndex()).toBe(0);

    expect(h.redo()).toBe(true);
    expect(log).toEqual(["undo:B", "redo:B"]);
    expect(h.currentIndex()).toBe(1);
  });

  it("drops the redo branch when a new operation is pushed after undo", () => {
    const log: string[] = [];
    const h = new HistoryManager();
    h.push(makeEntry("A", 10, log));
    h.push(makeEntry("B", 10, log));
    h.undo();
    h.push(makeEntry("C", 10, log));
    expect(h.items().map((i) => i.name)).toEqual(["A", "C"]);
    expect(h.currentIndex()).toBe(1);
    expect(h.canRedo()).toBe(false);
  });

  it("jumpTo replays the correct sequence of undo/redo closures", () => {
    const log: string[] = [];
    const h = new HistoryManager();
    h.push(makeEntry("A", 10, log));
    h.push(makeEntry("B", 10, log));
    h.push(makeEntry("C", 10, log));

    expect(h.jumpTo(0)).toBe(true);
    expect(log).toEqual(["undo:C", "undo:B"]);
    expect(h.currentIndex()).toBe(0);

    expect(h.jumpTo(2)).toBe(true);
    expect(log).toEqual(["undo:C", "undo:B", "redo:B", "redo:C"]);
    expect(h.currentIndex()).toBe(2);
  });

  it("bounds the number of retained entries while keeping the current state", () => {
    const log: string[] = [];
    const h = new HistoryManager({ maxEntries: 3 });
    for (const name of ["A", "B", "C", "D"]) h.push(makeEntry(name, 10, log));
    expect(h.items().map((i) => i.name)).toEqual(["B", "C", "D"]);
    expect(h.currentIndex()).toBe(2);
    expect(h.current?.name).toBe("D");
  });

  it("bounds total bytes but always keeps at least the current entry", () => {
    const log: string[] = [];
    const h = new HistoryManager({ maxBytes: 25 });
    h.push(makeEntry("A", 10, log));
    h.push(makeEntry("B", 10, log));
    h.push(makeEntry("C", 10, log));
    expect(h.items().map((i) => i.name)).toEqual(["B", "C"]);

    const tight = new HistoryManager({ maxBytes: 1 });
    tight.push(makeEntry("Only", 100, log));
    expect(tight.items().length).toBe(1);
    expect(tight.current?.name).toBe("Only");
  });

  it("reset clears all entries and state", () => {
    const log: string[] = [];
    const h = new HistoryManager();
    h.push(makeEntry("A", 10, log));
    h.reset();
    expect(h.items()).toEqual([]);
    expect(h.currentIndex()).toBe(-1);
    expect(h.current).toBeNull();
  });
});
