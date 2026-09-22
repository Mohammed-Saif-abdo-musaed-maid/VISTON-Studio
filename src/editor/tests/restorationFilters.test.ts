import { describe, it, expect } from "vitest";
import { runProcess, FILTER_OPS } from "../processing/processor";

const W = 12;
const H = 10;

function makeSolidImage(r: number, g: number, b: number, a = 255): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < data.length; i += 4) {
    data[i] = r; data[i + 1] = g; data[i + 2] = b; data[i + 3] = a;
  }
  return data;
}

function makeGradientImage(): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      data[i] = x * 20;
      data[i + 1] = y * 20;
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }
  return data;
}

function makeNoisyImage(seedSalt = 40, seedPepper = 40): Uint8ClampedArray {
  // Deterministic hand-built salt & pepper image (no RNG dependency).
  const data = makeGradientImage();
  let s = 0, p = 0;
  for (let i = 0; i < data.length; i += 4) {
    const prime = (i + 7) % 13;
    if (i % seedSalt === 0 && s++ < 30) {
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255;
    } else if (i % seedPepper === 0 && p++ < 30) {
      data[i] = 0; data[i + 1] = 0; data[i + 2] = 0;
    }
    void prime;
  }
  return data;
}

function countChannelChanged(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let n = 0;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) n++;
  return n;
}

function alphaOf(d: Uint8ClampedArray): Uint8ClampedArray {
  const out = new Uint8ClampedArray(d.length / 4);
  for (let i = 0, j = 0; i < d.length; i += 4, j++) out[j] = d[i + 3];
  return out;
}

describe("restoration filters (processor.runProcess)", () => {
  it("all six restoration ops are registered in FILTER_OPS", () => {
    for (const op of ["noiseGeneration", "arithmeticMean", "geometricMean", "contraHarmonicMean", "alphaTrimmedMean", "wienerFilter"] as const) {
      expect(FILTER_OPS).toContain(op);
    }
  });

  it("noiseGeneration is deterministic for the same seed", () => {
    const src = makeGradientImage();
    const a = runProcess("noiseGeneration", W, H, src, { noiseType: 0, amount: 40, mean: 0, variance: 25, seed: 42 });
    const b = runProcess("noiseGeneration", W, H, src, { noiseType: 0, amount: 40, mean: 0, variance: 25, seed: 42 });
    expect(a).toEqual(b);
  });

  it("noiseGeneration respects the seed (different seeds, different noise)", () => {
    const src = makeGradientImage();
    const a = runProcess("noiseGeneration", W, H, src, { noiseType: 0, amount: 40, variance: 25, seed: 1 });
    const b = runProcess("noiseGeneration", W, H, src, { noiseType: 0, amount: 40, variance: 25, seed: 2 });
    expect(countChannelChanged(a, b)).toBeGreaterThan(0);
  });

  it("Gaussian / Uniform / Salt & Pepper produce distinct outputs", () => {
    const src = makeGradientImage();
    const g = runProcess("noiseGeneration", W, H, src, { noiseType: 0, amount: 40, variance: 30, seed: 7 });
    const u = runProcess("noiseGeneration", W, H, src, { noiseType: 1, amount: 40, variance: 30, seed: 7 });
    const s = runProcess("noiseGeneration", W, H, src, { noiseType: 2, saltProb: 20, pepperProb: 20, seed: 7 });
    expect(countChannelChanged(g, u)).toBeGreaterThan(0);
    expect(countChannelChanged(u, s)).toBeGreaterThan(0);
    expect(countChannelChanged(s, g)).toBeGreaterThan(0);
    // Salt & pepper must yield exactly 0 and 255 impulses.
    let has0 = false, has255 = false;
    for (let i = 0; i < s.length; i += 4) {
      if (s[i] === 0) has0 = true;
      if (s[i] === 255) has255 = true;
    }
    expect(has0).toBe(true);
    expect(has255).toBe(true);
  });

  it("uniform noise is bounded by the variance range", () => {
    const src = makeGradientImage();
    const out = runProcess("noiseGeneration", W, H, src, { noiseType: 1, amount: 100, mean: 0, variance: 20, seed: 5 });
    for (let i = 0; i < out.length; i += 4) {
      for (let c = 0; c < 3; c++) {
        expect(Math.abs(out[i + c] - src[i + c])).toBeLessThanOrEqual(21);
      }
    }
  });

  it("noise generation never modifies the alpha channel", () => {
    const src = makeSolidImage(100, 150, 200, 77);
    const types = [0, 1, 2];
    for (const noiseType of types) {
      const out = runProcess("noiseGeneration", W, H, src, {
        noiseType,
        amount: 80,
        variance: 40,
        saltProb: 30,
        pepperProb: 30,
        mean: 0,
        seed: 3,
      });
      expect(alphaOf(out)).toEqual(alphaOf(src));
    }
  });

  it("arithmeticMean preserves alpha and averages a flat neighborhood", () => {
    const src = makeGradientImage();
    const out = runProcess("arithmeticMean", W, H, src, { kernel: 3 });
    expect(alphaOf(out)).toEqual(alphaOf(src));
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = (y * W + x) * 4;
        // Interior 3x3 window is fully inside the gradient → exact average.
        let sum = 0;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            sum += src[((y + dy) * W + (x + dx)) * 4];
          }
        expect(Math.abs(out[i] - sum / 9)).toBeLessThanOrEqual(1);
      }
    }
  });

  it("geometricMean of a constant patch equals the constant", () => {
    const src = makeSolidImage(180, 90, 40, 255);
    const out = runProcess("geometricMean", W, H, src, { kernel: 3 });
    for (let i = 0; i < out.length; i += 4) {
      expect(out[i]).toBe(180);
      expect(out[i + 1]).toBe(90);
      expect(out[i + 2]).toBe(40);
    }
  });

  it("geometricMean never destroys the alpha channel", () => {
    const src = makeSolidImage(200, 120, 60, 42);
    const out = runProcess("geometricMean", W, H, src, { kernel: 5 });
    expect(alphaOf(out)).toEqual(alphaOf(src));
  });

  it("contraHarmonicMean Q=0 is equivalent to the arithmetic mean", () => {
    const src = makeNoisyImage();
    const q0 = runProcess("contraHarmonicMean", W, H, src, { kernel: 3, q: 0 });
    const arith = runProcess("arithmeticMean", W, H, src, { kernel: 3 });
    let diff = 0;
    for (let i = 0; i < q0.length; i++) diff += Math.abs(q0[i] - arith[i]);
    expect(diff).toBe(0);
  });

  it("contraHarmonicMean Q>0 removes pepper (dark) impulses, Q<0 removes salt (white)", () => {
    const src = makeNoisyImage(3, 100000); // only salt impulses
    const qNeg = runProcess("contraHarmonicMean", W, H, src, { kernel: 3, q: -1 });
    let whiteNegative = 0;
    let whiteSource = 0;
    for (let i = 0; i < src.length; i += 4) {
      if (src[i] === 255) whiteSource++;
      if (qNeg[i] === 255) whiteNegative++;
    }
    expect(whiteSource).toBeGreaterThan(0);
    expect(whiteNegative).toBeLessThan(whiteSource);

    const pepper = makeNoisyImage(100000, 4); // only pepper impulses
    const qPos = runProcess("contraHarmonicMean", W, H, pepper, { kernel: 3, q: 1 });
    let blackSource = 0, blackPos = 0;
    for (let i = 0; i < pepper.length; i += 4) {
      if (pepper[i] === 0) blackSource++;
      if (qPos[i] === 0) blackPos++;
    }
    expect(blackSource).toBeGreaterThan(0);
    expect(blackPos).toBeLessThan(blackSource);
  });

  it("contraHarmonicMean handles the negative-Q zero-guard without NaN", () => {
    const src = makeSolidImage(0, 0, 0, 255); // fully black → v^q underflow
    const out = runProcess("contraHarmonicMean", W, H, src, { kernel: 3, q: -2 });
    for (let i = 0; i < out.length; i++) expect(Number.isFinite(out[i])).toBe(true);
  });

  it("alphaTrimmedMean never lets invalid trim drain the window", () => {
    const src = makeNoisyImage();
    for (const k of [3, 5, 7]) {
      const out = runProcess("alphaTrimmedMean", W, H, src, { kernel: k, trim: 99 });
      for (let i = 0; i < out.length; i++) expect(Number.isFinite(out[i])).toBe(true);
    }
  });

  it("alphaTrimmedMean leaves a constant image unchanged and preserves alpha", () => {
    const src = makeSolidImage(90, 140, 30, 200);
    const out = runProcess("alphaTrimmedMean", W, H, src, { kernel: 5, trim: 4 });
    expect(alphaOf(out)).toEqual(alphaOf(src));
    for (let i = 0; i < out.length; i += 4) {
      expect(out[i]).toBe(90);
      expect(out[i + 1]).toBe(140);
      expect(out[i + 2]).toBe(30);
    }
  });

  it("wienerFilter leaves a flat image untouched", () => {
    const src = makeSolidImage(120, 80, 60, 255);
    const autoOut = runProcess("wienerFilter", W, H, src, { kernel: 3, noiseVarianceMode: 0 });
    const manualOut = runProcess("wienerFilter", W, H, src, { kernel: 3, noiseVarianceMode: 1, noiseVariance: 100 });
    for (let i = 0; i < src.length; i++) {
      expect(autoOut[i]).toBe(src[i]);
      expect(manualOut[i]).toBe(src[i]);
    }
  });

  it("wienerFilter reduces gaussian noise variance", () => {
    const noisy = runProcess("noiseGeneration", W, H, makeSolidImage(128, 128, 128, 255), {
      noiseType: 0, amount: 100, variance: 400, seed: 11,
    });
    const out = runProcess("wienerFilter", W, H, noisy, { kernel: 3, noiseVarianceMode: 0 });
    let srcDiff = 0, diff = 0;
    const base = 128;
    for (let i = 0; i < noisy.length; i += 4) {
      srcDiff += (noisy[i] - base) * (noisy[i] - base);
      diff += (out[i] - base) * (out[i] - base);
    }
    expect(diff).toBeLessThan(srcDiff);
  });

  it("all restoration filters keep the alpha channel when alpha is not 255", () => {
    const src = makeGradientImage();
    for (let i = 3; i < src.length; i += 4) src[i] = 99;
    const ops: Array<{ op: "arithmeticMean" | "geometricMean" | "contraHarmonicMean" | "alphaTrimmedMean" | "wienerFilter"; p: Record<string, number> }> = [
      { op: "arithmeticMean", p: { kernel: 3 } },
      { op: "geometricMean", p: { kernel: 3 } },
      { op: "contraHarmonicMean", p: { kernel: 3, q: 0 } },
      { op: "alphaTrimmedMean", p: { kernel: 3, trim: 1 } },
      { op: "wienerFilter", p: { kernel: 3, noiseVarianceMode: 1, noiseVariance: 10 } },
    ];
    for (const { op, p } of ops) {
      const out = runProcess(op, W, H, src, p);
      expect(alphaOf(out)).toEqual(alphaOf(src));
    }
  });

  it("edges are handled (replicate sampling) — every restoration op runs on any size", () => {
    const big = makeSolidImage(10, 20, 30, 255); // 12×10
    const cases = [
      { w: 1, h: 1 },
      { w: 3, h: 3 },
      { w: 8, h: 5 },
      { w: 40, h: 37 },
    ] as const;
    const total = Math.max(...cases.map((c) => c.w * c.h * 4));
    const src = new Uint8ClampedArray(total);
    for (let i = 0; i < total; i++) src[i] = big[i % big.length];
    for (const dims of cases) {
      for (const op of ["noiseGeneration", "arithmeticMean", "geometricMean", "contraHarmonicMean", "alphaTrimmedMean", "wienerFilter"] as const) {
        const out = runProcess(op, dims.w, dims.h, src.slice(0, dims.w * dims.h * 4), { kernel: 9, q: 2, trim: 2, noiseVarianceMode: 1, noiseVariance: 5 });
        expect(out).toHaveLength(dims.w * dims.h * 4);
      }
    }
  });
});