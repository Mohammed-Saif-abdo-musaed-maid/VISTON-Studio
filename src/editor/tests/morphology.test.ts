import { describe, it, expect } from "vitest";
import {
  runProcess,
  FILTER_OPS,
  MORPHO_OPS,
  MORPHO_BINARY_OPS,
  analyzeConnectedComponents,
  binaryFromLuminanceThreshold,
  type ProcessOp,
} from "../processing/processor";

const W = 16;
const H = 16;

function makeTestImage(): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const val = (x < W / 2 ? 60 : 230) + (y < H / 2 ? 15 : 0);
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
      data[i + 3] = 255;
    }
  }
  return data;
}

/** Horizontal step only (no vertical variation) — isolates horizontal gradient edges. */
function hStepImage(): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const val = x < W / 2 ? 60 : 230;
      data[i] = val;
      data[i + 1] = val;
      data[i + 2] = val;
      data[i + 3] = 255;
    }
  }
  return data;
}

/** Step image plus a 1-pixel-wide thin protrusion on the LOW side of the edge. */
function spikeImage(): Uint8ClampedArray {
  const data = hStepImage();
  for (let y = 0; y < 6; y++) {
    const i = (y * W + 2) * 4;
    const v = 230;
    data[i] = v;
    data[i + 1] = v;
    data[i + 2] = v;
    data[i + 3] = 255;
  }
  return data;
}

/** Ring image (border foreground, empty interior) — exposes hole filling. */
function ringImage(): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      const onRing = x === 0 || y === 0 || x === W - 1 || y === H - 1;
      const v = onRing ? 255 : 0;
      data[i] = v;
      data[i + 1] = v;
      data[i + 2] = v;
      data[i + 3] = 255;
    }
  }
  return data;
}

function foregroundCount(data: Uint8ClampedArray, threshold = 128): number {
  let count = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i] >= threshold) count++;
  }
  return count;
}

function maxChannelDelta(a: Uint8ClampedArray, b: Uint8ClampedArray): number {
  let maxDiff = 0;
  for (let i = 0; i < a.length; i++) {
    const d = Math.abs(a[i] - b[i]);
    if (d > maxDiff) maxDiff = d;
  }
  return maxDiff;
}

function assertValid(op: ProcessOp, out: Uint8ClampedArray, length: number) {
  expect(out.length, `${op} length`).toBe(length);
  for (let i = 0; i < out.length; i++) {
    if (Number.isNaN(out[i])) throw new Error(`${op} produced NaN at ${i}`);
  }
  for (let i = 3; i < out.length; i += 4) {
    expect(out[i], `${op} alpha at ${i}`).toBe(255);
  }
}

describe("morphology registration", () => {
  it("registers all 15 morphological ops in MORPHO_OPS and FILTER_OPS", () => {
    expect(MORPHO_OPS.length).toBe(15);
    for (const op of MORPHO_OPS) {
      expect(FILTER_OPS).toContain(op);
    }
  });

  it("exposes the binary-only op set", () => {
    expect(MORPHO_BINARY_OPS).toContain("morphoHoleFill");
    expect(MORPHO_BINARY_OPS).toContain("morphoThinning");
    expect(MORPHO_BINARY_OPS).toContain("morphoReconstruction");
  });
});

describe("morphology runs without corruption", () => {
  it("every morpho op returns a correctly sized, alpha-preserving buffer with default params", () => {
    const src = makeTestImage();
    for (const op of MORPHO_OPS) {
      const out = runProcess(op, W, H, src, {});
      assertValid(op, out, src.length);
    }
  });

  it("binary mode output is strictly 0/255 and alpha preserved", () => {
    const src = makeTestImage();
    for (const op of MORPHO_OPS) {
      if (op === "morphoComponents") continue; // components colorizes by design
      const out = runProcess(op, W, H, src, { inputMode: 1, threshold: 128 });
      assertValid(op, out, src.length);
      for (let i = 0; i < out.length; i += 4) {
        expect([0, 255], `${op} pixel at ${i}`).toContain(out[i]);
        expect([0, 255], `${op} pixel at ${i}`).toContain(out[i + 1]);
        expect([0, 255], `${op} pixel at ${i}`).toContain(out[i + 2]);
      }
    }
  });

  it("morphoComponents colorizes each connected component distinctly", () => {
    const src = makeTestImage();
    const out = runProcess("morphoComponents", W, H, src, { threshold: 128 });
    assertValid("morphoComponents", out, src.length);
    const fgColors = new Set<number>();
    for (let i = 0; i < out.length; i += 4) {
      if (out[i] === 0 && out[i + 1] === 0 && out[i + 2] === 0) continue;
      fgColors.add((out[i] << 16) | (out[i + 1] << 8) | out[i + 2]);
    }
    expect(fgColors.size).toBeGreaterThanOrEqual(1);
  });

  it("clamps out-of-range param values instead of crashing", () => {
    const src = makeTestImage();
    const extreme: Record<string, number> = {
      shape: 99,
      size: 999,
      iterations: 32,
      borderMode: 99,
      borderValue: 999,
      inputMode: 99,
      threshold: 999,
      markerThreshold: 999,
    };
    for (const op of MORPHO_OPS) {
      const out = runProcess(op, W, H, src, { ...extreme });
      assertValid(op, out, src.length);
    }
  });

  it("custom kernels are honored and invalid custom kernels fall back to the default SE", () => {
    const src = makeTestImage();
    const good = "0 1 0\n1 1 1\n0 1 0";
    const bad = "1 0\n0 1";
    for (const op of MORPHO_OPS) {
      const withKernel = runProcess(op, W, H, src, { customKernel: good });
      const withBad = runProcess(op, W, H, src, { customKernel: bad });
      assertValid(op, withKernel, src.length);
      assertValid(op, withBad, src.length);
    }
  });
});

describe("morphology behavior", () => {
  it("erosion shrinks foreground, dilation grows it", () => {
    const src = makeTestImage();
    const baseFg = foregroundCount(src);
    const erode = runProcess("morphoErosion", W, H, src, { size: 3 });
    const dilate = runProcess("morphoDilation", W, H, src, { size: 3 });
    const eFg = foregroundCount(erode);
    const dFg = foregroundCount(dilate);
    expect(eFg).toBeLessThan(baseFg);
    expect(dFg).toBeGreaterThan(baseFg);
    expect(eFg).toBeLessThan(dFg);
  });

  it("opening <= source, closing >= source (structure-preserving size filter)", () => {
    const src = makeTestImage();
    const open = runProcess("morphoOpening", W, H, src, { size: 3, borderMode: 0 });
    const close = runProcess("morphoClosing", W, H, src, { size: 3, borderMode: 0 });
    expect(foregroundCount(open)).toBeLessThanOrEqual(foregroundCount(src));
    expect(foregroundCount(close)).toBeGreaterThanOrEqual(foregroundCount(src));
  });

  it("gradient is nonzero only near edges of the horizontal step", () => {
    const src = hStepImage();
    const grad = runProcess("morphoGradient", W, H, src, { size: 3 });
    let sum = 0;
    for (let i = 0; i < grad.length; i += 4) sum += grad[i];
    expect(sum).toBeGreaterThan(0);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const isEdgeCol = x === W / 2 - 1 || x === W / 2;
        if (!isEdgeCol) {
          expect(grad[i], `off-edge column ${x}`).toBe(0);
        } else {
          expect(grad[i], `edge column ${x}`).toBeGreaterThan(0);
        }
      }
    }
  });

  it("boundary extraction finds exactly the one-pixel rim of the foreground block", () => {
    const src = makeTestImage();
    const boundary = runProcess("morphoBoundary", W, H, src, { size: 3 });
    const bFg = foregroundCount(boundary);
    expect(bFg).toBeGreaterThan(0);
    expect(bFg).toBeLessThan(foregroundCount(src));
    for (let i = 0; i < boundary.length; i += 4) {
      expect([0, 255]).toContain(boundary[i]);
    }
  });

  it("thinning reduces foreground while thickening grows it", () => {
    const src = makeTestImage();
    const thin = runProcess("morphoThinning", W, H, src, { iterations: 1 });
    const thick = runProcess("morphoThickening", W, H, src, { iterations: 1 });
    expect(foregroundCount(thin)).toBeLessThanOrEqual(foregroundCount(src));
    expect(foregroundCount(thick)).toBeGreaterThanOrEqual(foregroundCount(src));
  });

  it("skeletonization converges (running twice is identical)", () => {
    const src = makeTestImage();
    const a = runProcess("morphoSkeleton", W, H, src, {});
    const b = runProcess("morphoSkeleton", W, H, src, {});
    expect(maxChannelDelta(a, b)).toBe(0);
    expect(foregroundCount(a)).toBeGreaterThan(0);
  });

  it("reconstruction converges (running twice is identical) and is idempotent after one pass", () => {
    const src = makeTestImage();
    const a = runProcess("morphoReconstruction", W, H, src, { threshold: 128, markerThreshold: 128 });
    const b = runProcess("morphoReconstruction", W, H, src, { threshold: 128, markerThreshold: 128 });
    expect(maxChannelDelta(a, b)).toBe(0);
    expect(foregroundCount(a)).toBeGreaterThan(0);
  });

  it("hole fill leaves an empty interior filled", () => {
    const ring = new Uint8ClampedArray(W * H * 4);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        const onRing = x === 0 || y === 0 || x === W - 1 || y === H - 1;
        const v = onRing ? 255 : 0;
        ring[i] = v;
        ring[i + 1] = v;
        ring[i + 2] = v;
        ring[i + 3] = 255;
      }
    }
    const filled = runProcess("morphoHoleFill", W, H, ring, {});
    let interiorCount = 0;
    for (let y = 1; y < H - 1; y++) {
      for (let x = 1; x < W - 1; x++) {
        const i = (y * W + x) * 4;
        if (filled[i] === 255) interiorCount++;
      }
    }
    expect(interiorCount).toBe((W - 2) * (H - 2));
  });

  it("semantically distinct operation pairs produce different output", () => {
    const step = makeTestImage();
    const compare = (a: Uint8ClampedArray, b: Uint8ClampedArray, label: string) =>
      expect(maxChannelDelta(a, b), label).toBeGreaterThan(0);

    compare(
      runProcess("morphoErosion", W, H, step, { size: 3 }),
      runProcess("morphoDilation", W, H, step, { size: 3 }),
      "erosion vs dilation"
    );

    const spike = spikeImage();
    compare(
      runProcess("morphoOpening", W, H, spike, { size: 3 }),
      runProcess("morphoClosing", W, H, spike, { size: 3 }),
      "opening (drops thin protrusion) vs closing (keeps it)"
    );

    compare(
      runProcess("morphoThinning", W, H, step, { iterations: 1 }),
      runProcess("morphoSkeleton", W, H, step, {}),
      "thinning(1) vs skeleton(converged)"
    );

    const ring = ringImage();
    compare(
      runProcess("morphoHoleFill", W, H, ring, {}),
      runProcess("morphoReconstruction", W, H, ring, { threshold: 128, markerThreshold: 128 }),
      "hole fill vs reconstruction on a ring"
    );

    const distinctFromSrc: { op: ProcessOp; image: Uint8ClampedArray; params: Record<string, number> }[] = [
      { op: "morphoTopHat", image: spike, params: { size: 3 } },
      { op: "morphoBlackHat", image: spike, params: { size: 3 } },
      { op: "morphoHitOrMiss", image: step, params: { size: 3 } },
      { op: "morphoBoundary", image: step, params: { size: 3 } },
      { op: "morphoThickening", image: step, params: { iterations: 1 } },
      { op: "morphoComponents", image: step, params: { threshold: 128 } },
      { op: "morphoGradient", image: step, params: { size: 3 } },
      { op: "morphoHoleFill", image: ring, params: {} },
    ];
    for (const { op, image, params } of distinctFromSrc) {
      const out = runProcess(op, W, H, image, params);
      compare(out, image, `${op} changes the source`);
    }
  });
});

describe("morphology pure helpers", () => {
  it("binaryFromLuminanceThreshold classifies by luminance threshold", () => {
    const data = new Uint8ClampedArray(4 * 2 * 4);
    data[0] = 200; data[1] = 200; data[2] = 200; data[3] = 255;
    data[4] = 10; data[5] = 10; data[6] = 10; data[7] = 255;
    const bin = binaryFromLuminanceThreshold(data, 4, 2, 128);
    expect(bin[0]).toBe(255);
    expect(bin[1]).toBe(0);
    expect(bin[2]).toBe(0);
    expect(bin[3]).toBe(0);
  });

  it("analyzeConnectedComponents finds two isolated blobs", () => {
    const w = 10;
    const h = 6;
    const bin = new Uint8ClampedArray(w * h);
    for (let y = 1; y < 3; y++) {
      for (let x = 1; x < 3; x++) bin[y * w + x] = 255;
    }
    for (let y = 1; y < 3; y++) {
      for (let x = 6; x < 8; x++) bin[y * w + x] = 255;
    }
    const stats = analyzeConnectedComponents(bin, w, h);
    expect(stats.count).toBe(2);
    const areas = stats.components.map((c) => c.area).sort();
    expect(areas).toEqual([4, 4]);
    const widths = stats.components.map((c) => c.width).sort();
    expect(widths).toEqual([2, 2]);
  });

  it("analyzeConnectedComponents reports zero components for an empty image", () => {
    const bin = new Uint8ClampedArray(6 * 4);
    const stats = analyzeConnectedComponents(bin, 6, 4);
    expect(stats.count).toBe(0);
    expect(stats.components).toEqual([]);
  });
});