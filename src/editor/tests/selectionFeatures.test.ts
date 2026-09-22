import { describe, it, expect, beforeEach } from "vitest";
import { SelectionEngine } from "../selection/selectionEngine";

function makeImageData(w: number, h: number, fill: (x: number, y: number) => [number, number, number, number]): ImageData {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const [r, g, b, a] = fill(x, y);
      const i = (y * w + x) * 4;
      data[i] = r;
      data[i + 1] = g;
      data[i + 2] = b;
      data[i + 3] = a;
    }
  }
  return { width: w, height: h, data, colorSpace: "srgb" } as ImageData;
}

const W = 20;
const H = 20;

describe("selectionEngine professional selection features", () => {
  let sel: SelectionEngine;

  beforeEach(() => {
    sel = new SelectionEngine();
    sel.resize(W, H);
    sel.clear();
  });

  function count(mask: Uint8ClampedArray | null): number {
    if (!mask) return 0;
    let n = 0;
    for (let i = 0; i < mask.length; i++) if (mask[i] > 0) n++;
    return n;
  }

  it("selectSimilar picks matching pixels across the whole image (non-contiguous)", () => {
    const img = makeImageData(W, H, (x, y) => (x < 3 ? [255, 0, 0, 255] : [0, 255, 0, 255]));
    sel.selectSimilar(img, 16, 1, 1, "replace");
    const mask = sel.getMask(W, H)!;
    expect(count(mask)).toBe(3 * H);
    expect(mask[0]).toBe(1);
    expect(mask[5 * W + 5]).toBe(0);
  });

  it("selectSimilar composes with add mode", () => {
    const red = makeImageData(W, H, (x) => (x < 3 ? [255, 0, 0, 255] : [0, 255, 0, 255]));
    const green = makeImageData(W, H, (x) => (x >= 3 ? [255, 0, 0, 255] : [0, 128, 0, 255]));
    sel.selectSimilar(red, 16, 1, 1, "replace");
    sel.selectSimilar(green, 16, 10, 1, "add");
    expect(count(sel.getMask(W, H)!)).toBe(W * H);
  });

  it("selectSimilar subtract removes previously selected pixels", () => {
    const img = makeImageData(W, H, (x) => (x < 3 ? [255, 0, 0, 255] : [0, 255, 0, 255]));
    sel.selectSimilar(img, 16, 1, 1, "replace");
    sel.selectSimilar(img, 16, 1, 1, "subtract");
    expect(count(sel.getMask(W, H)!)).toBe(0);
  });

  it("border reduces a rectangular selection to its edge ring", () => {
    sel.setRect("rect", 4, 4, 12, 12, "replace");
    const before = count(sel.getMask(W, H)!);
    expect(before).toBe(12 * 12);
    sel.border(2);
    const after = sel.getMask(W, H)!;
    expect(count(after)).toBeLessThan(before);
    expect(count(after)).toBeGreaterThan(0);
    expect(after[4 * W + 6]).toBe(1);
    expect(after[4 * W + 4]).toBe(1);
    expect(after[4 * W + 15]).toBe(1);
    expect(after[10 * W + 10]).toBe(0);
  });

  it("smooth removes a stray single pixel", () => {
    sel.setRect("rect", 0, 0, 10, 10, "replace");
    const mask = sel.getMask(W, H)!;
    const stray = 7 * W + 14;
    mask[stray] = 1;
    sel.setMask(mask);
    sel.smooth(1);
    expect(sel.getMask(W, H)![stray]).toBe(0);
    expect(sel.hasSelection).toBe(true);
  });

  it("smooth keeps the bulk interior of a solid selection", () => {
    sel.setRect("rect", 4, 4, 10, 10, "replace");
    const mask = sel.getMask(W, H)!;
    const interior = 8 * W + 8;
    sel.smooth(2);
    expect(sel.getMask(W, H)![interior]).toBe(255);
    expect(count(sel.getMask(W, H)!)).toBeGreaterThan(40);
  });

  it("expand and contract change the region footprint (notify-safe)", () => {
    sel.setRect("rect", 5, 5, 10, 10, "replace");
    const before = count(sel.getMask(W, H)!);
    sel.expand(2);
    const expanded = count(sel.getMask(W, H)!);
    expect(expanded).toBeGreaterThan(before);
    sel.contract(2);
    const contracted = count(sel.getMask(W, H)!);
    expect(contracted).toBeLessThan(expanded);
    expect(contracted).toBeGreaterThan(0);
  });

  it("feather produces partial (0..255) edge values", () => {
    sel.setRect("rect", 5, 5, 10, 10, "replace");
    sel.feather(2);
    const mask = sel.getMask(W, H)!;
    let partial = false;
    for (let i = 0; i < mask.length; i++) {
      if (mask[i] > 0 && mask[i] < 255) partial = true;
    }
    expect(partial).toBe(true);
  });

  it("every mutation notifies subscribers", () => {
    let calls = 0;
    const unsub = sel.subscribe(() => calls++);
    sel.setRect("rect", 2, 2, 6, 6, "replace");
    const mask = sel.getMask(W, H)!;
    sel.border(1);
    sel.smooth(1);
    sel.expand(1);
    sel.contract(1);
    sel.selectSimilar(makeImageData(W, H, () => [1, 1, 1, 255]), 8, 1, 1, "replace");
    sel.clear();
    unsub();
    expect(calls).toBe(8);
  });
});