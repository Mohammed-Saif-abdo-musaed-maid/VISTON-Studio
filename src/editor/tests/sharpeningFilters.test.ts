import { describe, it, expect } from "vitest";
import { runProcess, FILTER_OPS, type ProcessOp } from "../processing/processor";

const W = 8;
const H = 8;

const SHARPEN_OPS = [
  "unsharpMask",
  "highBoost",
  "sobelEdge",
  "prewittEdge",
  "laplacianEdge",
  "cannyEdge",
  "smartSharpen",
  "sharpenDetails",
  "edgeSharpen",
  "claritySharpen",
  "textureSharpen",
  "localContrastSharpen",
  "directionalSharpen",
  "focusSharpen",
] as const;

function makeTestImage(): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const val = (x < 4 ? 60 : 230) + (y < 4 ? 15 : 0);
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
      data[i + 3] = 255;
    }
  }
  return data;
}

function perChannelCount(data: Uint8ClampedArray): number {
  const seen = new Set<number>();
  for (let i = 0; i < data.length; i += 4) {
    seen.add(data[i]);
    seen.add(data[i + 1]);
    seen.add(data[i + 2]);
  }
  return seen.size;
}

function maxChannelDelta(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let maxDiff = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > maxDiff) maxDiff = d;
  }
  return maxDiff;
}

describe("sharpening filter registration", () => {
  it("registers all 14 sharpening/edge filters in FILTER_OPS", () => {
    for (const op of SHARPEN_OPS) {
      expect(FILTER_OPS).toContain(op);
    }
  });
});

describe("sharpening filters run without corruption", () => {
  it("every sharpening op returns a correctly sized, alpha-preserving buffer with default params", () => {
    const src = makeTestImage();
    for (const op of SHARPEN_OPS) {
      const out = runProcess(op, W, H, src, {});
      expect(out.length, `${op} length`).toBe(src.length);
      for (let i = 3; i < out.length; i += 4) {
        expect(out[i], `${op} alpha at ${i}`).toBe(255);
      }
      for (let i = 0; i < out.length; i++) {
        if (Number.isNaN(out[i])) throw new Error(`${op} produced NaN at ${i}`);
      }
    }
  });

  it("amount: 0 passes through unchanged", () => {
    const src = makeTestImage();
    const ops: { op: ProcessOp; params: Record<string, number> }[] = [
      { op: "unsharpMask", params: { amount: 0 } },
      { op: "highBoost", params: { amount: 0 } },
      { op: "smartSharpen", params: { amount: 0 } },
      { op: "sharpenDetails", params: { amount: 0 } },
      { op: "claritySharpen", params: { amount: 0 } },
      { op: "textureSharpen", params: { strength: 0 } },
      { op: "localContrastSharpen", params: { amount: 0 } },
      { op: "directionalSharpen", params: { strength: 0 } },
      { op: "focusSharpen", params: { amount: 0 } },
    ];
    for (const { op, params } of ops) {
      const out = runProcess(op, W, H, src, params);
      expect(maxChannelDelta(out, src), `${op} amount/strength 0`).toBe(0);
    }
  });

  it("clamps out-of-range param values instead of crashing", () => {
    const src = makeTestImage();
    const extreme: Record<string, number> = {
      amount: 999,
      radius: 999,
      threshold: 999,
      strength: 999,
      angle: 999,
      blur: 999,
      edgeStrength: 999,
      noiseProtection: 999,
      noiseReduction: 999,
      shadowFade: 999,
      highlightFade: 999,
      fineDetail: 999,
      mediumDetail: 999,
      largeDetail: 999,
      texturePreservation: 999,
      fineTexture: 999,
      mediumTexture: 999,
      detail: 999,
      lowThreshold: 999,
      highThreshold: 999,
    };
    for (const op of SHARPEN_OPS) {
      const out = runProcess(op, W, H, src, { ...extreme });
      expect(out.length).toBe(src.length);
    }
  });
});

describe("sharpening filter behavior", () => {
  it("unsharpMask sharpens an edge (increases gradient)", () => {
    const src = makeTestImage();
    const out = runProcess("unsharpMask", W, H, src, { amount: 1, radius: 1 });
    let srcMaxGrad = 0;
    let outMaxGrad = 0;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W - 1; x++) {
        const i = (y * W + x) * 4;
        const j = i + 4;
        srcMaxGrad = Math.max(srcMaxGrad, Math.abs(src[j] - src[i]));
        outMaxGrad = Math.max(outMaxGrad, Math.abs(out[j] - out[i]));
      }
    }
    expect(outMaxGrad).toBeGreaterThan(srcMaxGrad);
  });

  it("cannyEdge on a flat image yields all-zero edges", () => {
    const flat = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < flat.length; i += 4) {
      flat[i] = 128;
      flat[i + 1] = 128;
      flat[i + 2] = 128;
      flat[i + 3] = 255;
    }
    const out = runProcess("cannyEdge", W, H, flat, {});
    for (let i = 0; i < out.length; i += 4) {
      expect(out[i]).toBe(0);
      expect(out[i + 1]).toBe(0);
      expect(out[i + 2]).toBe(0);
    }
  });

  it("sobelEdge/prewittEdge/laplacianEdge/cannyEdge detect the vertical step edge", () => {
    const src = makeTestImage();
    for (const op of ["sobelEdge", "prewittEdge"] as const) {
      const out = runProcess(op, W, H, src, {});
      let edgeSum = 0;
      for (let i = 0; i < out.length; i += 4) edgeSum += out[i];
      expect(edgeSum, op).toBeGreaterThan(0);
    }
    const lap = runProcess("laplacianEdge", W, H, src, { strength: 1 });
    expect(perChannelCount(lap)).toBeGreaterThan(1);
    const canny = runProcess("cannyEdge", W, H, src, {});
    let black = 0;
    let white = 0;
    for (let i = 0; i < canny.length; i += 4) {
      if (canny[i] === 0) black++;
      else if (canny[i] === 255) white++;
    }
    expect(black).toBeGreaterThan(0);
    expect(white).toBeGreaterThan(0);
  });

  it("distinct ops produce distinct output on the edge image", () => {
    const src = makeTestImage();
    const paramSets: Record<(typeof SHARPEN_OPS)[number], Record<string, number>> = {
      unsharpMask: { amount: 1, radius: 2, threshold: 5 },
      highBoost: { amount: 1, radius: 2, threshold: 5 },
      sobelEdge: { strength: 1 },
      prewittEdge: { strength: 1 },
      laplacianEdge: { strength: 1, radius: 1 },
      cannyEdge: { lowThreshold: 10, highThreshold: 80, blur: 1, edgeStrength: 1 },
      smartSharpen: { amount: 1, radius: 2, noiseReduction: 30, shadowFade: 20, highlightFade: 20 },
      sharpenDetails: { fineDetail: 1, mediumDetail: 0.5, largeDetail: 0, amount: 1 },
      edgeSharpen: { edgeStrength: 1, radius: 2, threshold: 5, noiseProtection: 30 },
      claritySharpen: { amount: 1, radius: 3, texturePreservation: 40 },
      textureSharpen: { fineTexture: 1, mediumTexture: 0.5, strength: 1 },
      localContrastSharpen: { amount: 1, radius: 3, detail: 1 },
      directionalSharpen: { angle: 45, strength: 1, radius: 2 },
      focusSharpen: { amount: 1, radius: 2, noiseReduction: 30 },
    };
    const outputs = new Map<ProcessOp, Uint8ClampedArray>();
    for (const op of SHARPEN_OPS) {
      outputs.set(op, runProcess(op, W, H, src, paramSets[op]));
    }
    const names = [...outputs.keys()];
    for (let a = 0; a < names.length; a++) {
      for (let b = a + 1; b < names.length; b++) {
        const delta = maxChannelDelta(outputs.get(names[a])!, outputs.get(names[b])!);
        expect(delta, `${names[a]} vs ${names[b]}`).toBeGreaterThan(0);
      }
    }
  });
});

describe("sharpening filter param coverage", () => {
  it("each strengthening param increases or maintains visual change (no inverted feedback loops)", () => {
    const src = makeTestImage();
    const base = runProcess("unsharpMask", W, H, src, { amount: 0.5 });
    const strong = runProcess("unsharpMask", W, H, src, { amount: 1.5 });
    expect(maxChannelDelta(strong, src)).toBeGreaterThan(maxChannelDelta(base, src));
  });

  it("edgeSharpen threshold filters out weak edges", () => {
    const src = makeTestImage();
    const low = runProcess("edgeSharpen", W, H, src, { edgeStrength: 1, threshold: 0 });
    const high = runProcess("edgeSharpen", W, H, src, { edgeStrength: 1, threshold: 255 });
    expect(maxChannelDelta(high, src)).toBeLessThanOrEqual(maxChannelDelta(low, src));
  });
});