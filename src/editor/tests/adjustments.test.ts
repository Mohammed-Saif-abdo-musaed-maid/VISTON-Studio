import { describe, it, expect } from "vitest";
import { runProcess, runAdjustments, type Adjustments } from "../processing/processor";

const W = 8;
const H = 8;

function makeGray(v: number, alpha = 255): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = v;
    data[i * 4 + 1] = v;
    data[i * 4 + 2] = v;
    data[i * 4 + 3] = alpha;
  }
  return data;
}

function adjusted(adj: Adjustments): Uint8ClampedArray {
  return runProcess("adjustments", W, H, makeGray(128), { values: adj });
}

function pixel(data: Uint8ClampedArray, idx: number): [number, number, number, number] {
  return [data[idx * 4], data[idx * 4 + 1], data[idx * 4 + 2], data[idx * 4 + 3]];
}

describe("combined adjustments (runAdjustments)", () => {
  it("empty values keep the image unchanged", () => {
    const src = makeGray(128, 99);
    const out = runAdjustments(W, H, src, {});
    expect(out).not.toBe(src);
    expect(Array.from(out)).toEqual(Array.from(src));
  });

  it("all-zero values keep the image unchanged", () => {
    const out = adjusted({ brightness: 0, contrast: 0, gamma: 1, saturation: 0, exposure: 0, hue: 0, temperature: 0 });
    expect(Array.from(out)).toEqual(Array.from(makeGray(128)));
  });

  it("brightness shifts luminance additively (100 → all clipped, -100 → all clipped)", () => {
    expect(adjusted({ brightness: 100 })[0]).toBe(255);
    expect(adjusted({ brightness: -100 })[0]).toBe(0);
  });

  it("contrast pivots around 128", () => {
    expect(adjusted({ contrast: 100 })[0]).toBe(128);
    expect(adjusted({ contrast: 100, brightness: -100 })[0]).toBe(0);
  });

  it("gamma 0.5 darkens mid-tones (128² curve)", () => {
    expect(adjusted({ gamma: 0.5 })[0]).toBe(64);
  });

  it("saturation preserves gray, changes colors", () => {
    expect(adjusted({ saturation: 100 })[0]).toBe(128);
    const src = makeGray(128);
    src[0] = 200; src[1] = 60; src[2] = 60;
    const out = runAdjustments(W, H, src, { saturation: 100 });
    const [r, g, b] = pixel(out, 0);
    expect(r).toBeGreaterThan(g);
    expect(Math.abs(g - b)).toBeLessThanOrEqual(1);
  });

  it("exposure in EV is multiplicative inside the combined op", () => {
    const src = makeGray(100);
    const plus = runAdjustments(W, H, src, { exposure: 1 });
    expect(plus[0]).toBe(200);
    const minus = runAdjustments(W, H, src, { exposure: -1 });
    expect(minus[0]).toBe(50);
  });

  it("hue rotation changes channel distribution", () => {
    const src = makeGray(128);
    src[0] = 255; src[1] = 0; src[2] = 0;
    const out = runAdjustments(W, H, src, { hue: 90 });
    const [r, g, b] = pixel(out, 0);
    expect(r).toBeLessThan(60);
    expect(g).toBeGreaterThan(80);
    expect(g).toBeLessThan(100);
    expect(b).toBeLessThan(10);
  });

  it("temperature warms reds and cools blues", () => {
    const src = makeGray(128);
    src[0] = 200; src[2] = 50;
    const warm = runAdjustments(W, H, src, { temperature: 100 });
    expect(warm[0]).toBe(255);
    expect(warm[2]).toBeLessThan(50);
    const neutral = runAdjustments(W, H, src, { temperature: 0 });
    expect(neutral[1]).toBe(128);
  });

  it("combined adjustments preserve alpha and dimensions", () => {
    const src = makeGray(128, 40);
    const out = runAdjustments(W, H, src, { brightness: 10, contrast: 20, gamma: 1.5, saturation: 30, exposure: 0.5, hue: 15, temperature: -20 });
    expect(out.length).toBe(W * H * 4);
    for (let i = 0; i < W * H; i++) {
      expect(out[i * 4 + 3]).toBe(40);
      for (let k = 0; k < 3; k++) {
        expect(Number.isFinite(out[i * 4 + k])).toBe(true);
        expect(out[i * 4 + k]).toBeGreaterThanOrEqual(0);
        expect(out[i * 4 + k]).toBeLessThanOrEqual(255);
      }
    }
  });
});