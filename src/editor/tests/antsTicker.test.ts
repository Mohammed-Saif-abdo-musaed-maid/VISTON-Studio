import { describe, it, expect } from "vitest";
import { createAntsTicker } from "../canvas/antsTicker";

interface Harness {
  ticker: ReturnType<typeof createAntsTicker>;
  frame: (now?: number) => void;
  pendingCount: () => number;
  calls: number[];
  setShouldRun: (v: boolean) => void;
}

function harness(initialShouldRun = true): Harness {
  let seq = 0;
  let shouldRun = initialShouldRun;
  const calls: number[] = [];
  const pending = new Map<number, (now: number) => void>();
  const requestFrame = (cb: (now: number) => void) => {
    const id = ++seq;
    pending.set(id, cb);
    return id;
  };
  const cancelFrame = (id: number) => {
    pending.delete(id);
  };
  const frame = (now = 1000) => {
    const cbs = [...pending.values()];
    pending.clear();
    for (const cb of cbs) cb(now);
  };
  return {
    ticker: createAntsTicker({
      requestFrame,
      cancelFrame,
      shouldRun: () => shouldRun,
      onFrame: (now) => {
        calls.push(now);
      },
    }),
    frame,
    pendingCount: () => pending.size,
    calls,
    setShouldRun: (v) => {
      shouldRun = v;
    },
  };
}

describe("createAntsTicker (marching-ants animation loop)", () => {
  it("starts a single loop; repeated start() never adds a second loop", () => {
    const h = harness();
    h.ticker.start();
    h.ticker.start();
    h.ticker.start();
    expect(h.pendingCount()).toBe(1);
    expect(h.ticker.running).toBe(true);
  });

  it("does not start when shouldRun is false (selection cleared/hidden)", () => {
    const h = harness(false);
    h.ticker.start();
    expect(h.pendingCount()).toBe(0);
    expect(h.ticker.running).toBe(false);
    h.frame(0);
    expect(h.calls.length).toBe(0);
  });

  it("ticks each frame and re-arms exactly one frame while animating", () => {
    const h = harness();
    h.ticker.start();
    h.frame(16);
    h.frame(32);
    h.frame(48);
    expect(h.calls).toEqual([16, 32, 48]);
    expect(h.pendingCount()).toBe(1);
  });

  it("self-stops when the selection disappears mid-flight", () => {
    const h = harness();
    h.ticker.start();
    h.frame(16);
    expect(h.calls).toEqual([16]);
    expect(h.pendingCount()).toBe(1);
    h.setShouldRun(false);
    h.frame(32);
    expect(h.calls).toEqual([16]);
    expect(h.pendingCount()).toBe(0);
    expect(h.ticker.running).toBe(false);
    h.frame(40);
    expect(h.calls).toEqual([16]);
    expect(h.pendingCount()).toBe(0);
  });

  it("stop() cancels the pending frame immediately (engine teardown)", () => {
    const h = harness();
    h.ticker.start();
    expect(h.pendingCount()).toBe(1);
    h.ticker.stop();
    expect(h.pendingCount()).toBe(0);
    expect(h.ticker.running).toBe(false);
    h.frame(16);
    expect(h.calls.length).toBe(0);
  });

  it("restart works after a self-stop (new selection appears)", () => {
    const h = harness();
    h.ticker.start();
    h.frame(16);
    h.setShouldRun(false);
    h.frame(32);
    expect(h.calls).toEqual([16]);
    expect(h.ticker.running).toBe(false);
    h.setShouldRun(true);
    h.ticker.start();
    h.frame(48);
    expect(h.calls).toEqual([16, 48]);
    expect(h.pendingCount()).toBe(1);
  });

  it("destroy() leaves no pending loop and later frames are inert", () => {
    const h = harness();
    h.ticker.start();
    h.frame(16);
    h.ticker.stop();
    h.frame(24);
    h.frame(32);
    expect(h.calls).toEqual([16]);
    expect(h.pendingCount()).toBe(0);
  });
});