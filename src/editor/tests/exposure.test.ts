import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { runProcess } from "../processing/processor";
import { processingEngine } from "../processing/processingEngine";
import { compositeToCanvas } from "../renderer/compositor";
import { EditorDocument, pixelStore } from "../core/document";
import { identityTransform, ImageLayer, AdjustmentLayer } from "../core/types";

const W = 4;
const H = 4;

const CHANNEL_VALUES = [2, 60, 100, 200];

function makeImage(): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = CHANNEL_VALUES[i % CHANNEL_VALUES.length];
    data[i * 4 + 1] = CHANNEL_VALUES[(i + 1) % CHANNEL_VALUES.length];
    data[i * 4 + 2] = CHANNEL_VALUES[(i + 2) % CHANNEL_VALUES.length];
    data[i * 4 + 3] = (i % 3) * 80 + 15;
  }
  return data;
}

function runExposure(amount: number): Uint8ClampedArray {
  return runProcess("exposure", W, H, makeImage(), { amount });
}

function expectedValue(v: number, amount: number): number {
  return Math.min(255, Math.max(0, Math.round(v * Math.pow(2, amount))));
}

// ── Minimal software canvas → runs the REAL compositor in Node ──

const h = vi.hoisted(() => {
  const parseColor = (s: string): [number, number, number, number] => {
    if (!s || s === "transparent") return [0, 0, 0, 0];
    const m = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(String(s));
    if (m) {
      return [
        parseInt(m[1]!.slice(0, 2), 16),
        parseInt(m[1]!.slice(2, 4), 16),
        parseInt(m[1]!.slice(4, 6), 16),
        m[2] ? parseInt(m[2], 16) : 255,
      ];
    }
    return [255, 255, 255, 255];
  };

  const makeCtx = (canvas: { _data: Uint8ClampedArray; width: number; height: number }): CanvasRenderingContext2D => {
    let globalAlpha = 1;
    let globalCompositeOperation = "source-over";
    const ctx: Record<string, unknown> = {
      fillStyle: "#000000",
      lineWidth: 1,
      filter: "none",
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
      get globalAlpha() {
        return globalAlpha;
      },
      set globalAlpha(v: number) {
        globalAlpha = v;
      },
      get globalCompositeOperation() {
        return globalCompositeOperation;
      },
      set globalCompositeOperation(v: string) {
        globalCompositeOperation = v;
      },
      setTransform: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      clearRect: (x: number, y: number, w: number, hh: number) => {
        for (let py = y; py < Math.min(canvas.height, y + hh); py++)
          for (let px = x; px < Math.min(canvas.width, x + w); px++) {
            const i = (py * canvas.width + px) * 4;
            canvas._data[i] = 0;
            canvas._data[i + 1] = 0;
            canvas._data[i + 2] = 0;
            canvas._data[i + 3] = 0;
          }
      },
      fillRect: (x: number, y: number, w: number, hh: number) => {
        const [r, g, b, a] = parseColor(ctx.fillStyle as string);
        for (let py = y; py < Math.min(canvas.height, y + hh); py++)
          for (let px = x; px < Math.min(canvas.width, x + w); px++) {
            const i = (py * canvas.width + px) * 4;
            canvas._data[i] = r;
            canvas._data[i + 1] = g;
            canvas._data[i + 2] = b;
            canvas._data[i + 3] = a;
          }
      },
      getImageData: (x: number, y: number, w: number, hh: number) => {
        const data = new Uint8ClampedArray(w * hh * 4);
        for (let py = 0; py < hh; py++)
          for (let px = 0; px < w; px++) {
            const si = (Math.min(canvas.height - 1, y + py) * canvas.width + Math.min(canvas.width - 1, x + px)) * 4;
            const di = (py * w + px) * 4;
            data[di] = canvas._data[si];
            data[di + 1] = canvas._data[si + 1];
            data[di + 2] = canvas._data[si + 2];
            data[di + 3] = canvas._data[si + 3];
          }
        return { width: w, height: hh, data, colorSpace: "srgb" } as ImageData;
      },
      putImageData: (img: ImageData, dx: number, dy: number) => {
        for (let py = 0; py < img.height; py++)
          for (let px = 0; px < img.width; px++) {
            const ox = Math.min(canvas.width - 1, Math.max(0, dx + px));
            const oy = Math.min(canvas.height - 1, Math.max(0, dy + py));
            const di = (oy * canvas.width + ox) * 4;
            const si = (py * img.width + px) * 4;
            canvas._data[di] = img.data[si];
            canvas._data[di + 1] = img.data[si + 1];
            canvas._data[di + 2] = img.data[si + 2];
            canvas._data[di + 3] = img.data[si + 3];
          }
      },
      createImageData: (w: number, hh: number) => ({
        width: w,
        height: hh,
        data: new Uint8ClampedArray(Math.max(0, w) * Math.max(0, hh) * 4),
      }),
      drawImage: (src: { width: number; height: number; _data?: Uint8ClampedArray }, dx = 0, dy = 0, dw?: number, dh?: number) => {
        const sd = (src as { _data: Uint8ClampedArray })._data ?? new Uint8ClampedArray(src.width * src.height * 4);
        const sw = src.width;
        const sh = src.height;
        const nw = dw ?? sw;
        const nh = dh ?? sh;
        for (let y = 0; y < nh; y++) {
          const sy = Math.min(sh - 1, Math.floor((y / Math.max(1, nh)) * sh));
          for (let x = 0; x < nw; x++) {
            const sx = Math.min(sw - 1, Math.floor((x / Math.max(1, nw)) * sw));
            const si = (sy * sw + sx) * 4;
            const ox = Math.floor(dx) + x;
            const oy = Math.floor(dy) + y;
            if (ox < 0 || oy < 0 || ox >= canvas.width || oy >= canvas.height) continue;
            const di = (oy * canvas.width + ox) * 4;
            canvas._data[di] = sd[si];
            canvas._data[di + 1] = sd[si + 1];
            canvas._data[di + 2] = sd[si + 2];
            canvas._data[di + 3] = sd[si + 3];
          }
        }
      },
    };
    return ctx as unknown as CanvasRenderingContext2D;
  };

  const makeCanvas = (w: number, hh: number): HTMLCanvasElement & { _ctx?: CanvasRenderingContext2D; _data: Uint8ClampedArray } => {
    const bw = Math.max(1, Math.round(w));
    const bh = Math.max(1, Math.round(hh));
    const c = {
      width: bw,
      height: bh,
      _data: new Uint8ClampedArray(bw * bh * 4),
      toDataURL: () => "data:image/png;base64,AAAA",
    } as HTMLCanvasElement & { _ctx?: CanvasRenderingContext2D; _data: Uint8ClampedArray };
    const cctx = makeCtx({ _data: c._data, width: c.width, height: c.height });
    c._ctx = cctx;
    (c as unknown as { getContext: (kind: string) => CanvasRenderingContext2D }).getContext = () => cctx;
    return c;
  };

  return {
    makeCanvas,
    getCtx: (c: HTMLCanvasElement & { _ctx?: CanvasRenderingContext2D }): CanvasRenderingContext2D =>
      c._ctx ?? (c.getContext("2d") as CanvasRenderingContext2D),
  };
});

vi.mock("../../utils/canvas", () => ({
  createCanvas: vi.fn((w: number, ht: number) => h.makeCanvas(w, ht)),
  getContext2d: vi.fn((c: HTMLCanvasElement & { _ctx?: CanvasRenderingContext2D }) =>
    c._ctx ?? (c.getContext("2d") as CanvasRenderingContext2D)),
  decodeImageFileSafe: vi.fn(),
  imageFileToCanvas: vi.fn(),
  dataURLToCanvas: vi.fn(),
}));

// Node has no DOMMatrix; the compositor builds identity matrices for a doc
// whose layers sit at the origin (no transforms), which is all this test needs.
class FakeDOMMatrix {
  a = 1;
  b = 0;
  c = 0;
  d = 1;
  e = 0;
  f = 0;
  constructor(values?: number[]) {
    if (values) {
      this.a = values[0] ?? 1;
      this.b = values[1] ?? 0;
      this.c = values[2] ?? 0;
      this.d = values[3] ?? 1;
      this.e = values[4] ?? 0;
      this.f = values[5] ?? 0;
    }
  }
  translateSelf(x: number, y: number): this {
    this.e += x;
    this.f += y;
    return this;
  }
  rotateSelf(_rx: number, _ry: number, rz: number): this {
    if (rz !== 0) {
      const cos = Math.cos(rz);
      const sin = Math.sin(rz);
      const na = this.a * cos + this.c * sin;
      const nb = this.b * cos + this.d * sin;
      const nc = this.c * cos - this.a * sin;
      const nd = this.d * cos - this.b * sin;
      this.a = na;
      this.b = nb;
      this.c = nc;
      this.d = nd;
    }
    return this;
  }
  scaleSelf(sx: number, sy: number): this {
    this.a *= sx;
    this.d *= sy;
    return this;
  }
  multiply(other: FakeDOMMatrix): FakeDOMMatrix {
    return new FakeDOMMatrix([
      this.a * other.a + this.c * other.b,
      this.b * other.a + this.d * other.b,
      this.a * other.c + this.c * other.d,
      this.b * other.c + this.d * other.d,
      this.a * other.e + this.c * other.f + this.e,
      this.b * other.e + this.d * other.f + this.f,
    ]);
  }
}

beforeAll(() => {
  vi.stubGlobal("DOMMatrix", FakeDOMMatrix);
});

afterAll(() => {
  vi.unstubAllGlobals();
});

function compositeWithExposure(amount: number): Uint8ClampedArray {
  pixelStore.clear();
  const imgCanvas = h.makeCanvas(W, H);
  h.getCtx(imgCanvas).putImageData(new ImageData(new Uint8ClampedArray(makeImage()), W, H), 0, 0);
  pixelStore.set("px-img", imgCanvas);

  const imgLayer: ImageLayer = {
    id: "img",
    name: "Image",
    type: "image",
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: identityTransform(0, 0, W, H),
    parentId: null,
    clipTo: null,
    mask: null,
    imageId: "px-img",
  };
  const adjLayer: AdjustmentLayer = {
    id: "adj",
    name: "Exposure",
    type: "adjustment",
    adjustment: "exposure",
    amount,
    params: null,
    visible: true,
    locked: false,
    opacity: 1,
    blendMode: "normal",
    transform: identityTransform(0, 0, 0, 0),
    parentId: null,
    clipTo: null,
    mask: null,
  };
  const doc = new EditorDocument(W, H, [imgLayer, adjLayer]);
  const canvas = compositeToCanvas(doc, { pixels: pixelStore });
  return h.getCtx(canvas).getImageData(0, 0, W, H).data.slice();
}

describe("exposure processing", () => {
  it("amount 0 returns the source unchanged", () => {
    const src = makeImage();
    const out = runProcess("exposure", W, H, src, { amount: 0 });
    expect(Array.from(out)).toEqual(Array.from(src));
    expect(out).not.toBe(src);
  });

  it("positive exposure multiplies channels by 2^amount (multiplicative, not additive)", () => {
    const out = runExposure(1);
    for (let i = 0; i < W * H; i++) {
      expect(out[i * 4]).toBe(expectedValue(CHANNEL_VALUES[i % 4], 1));
      expect(out[i * 4 + 1]).toBe(expectedValue(CHANNEL_VALUES[(i + 1) % 4], 1));
      expect(out[i * 4 + 2]).toBe(expectedValue(CHANNEL_VALUES[(i + 2) % 4], 1));
    }
    expect(out[0]).toBe(4);
    expect(out[8]).toBe(200);
  });

  it("a dim pixel stays dim under strong positive exposure (additive bug would crush it)", () => {
    const out = runExposure(5);
    expect(out[0]).toBe(64);
    expect(out[4]).toBe(255);
    expect(out[4]).toBe(expectedValue(60, 5));
  });

  it("negative exposure divides channels by 2^amount", () => {
    const out = runExposure(-1);
    for (let i = 0; i < W * H; i++) {
      expect(out[i * 4]).toBe(expectedValue(CHANNEL_VALUES[i % 4], -1));
      expect(out[i * 4 + 1]).toBe(expectedValue(CHANNEL_VALUES[(i + 1) % 4], -1));
      expect(out[i * 4 + 2]).toBe(expectedValue(CHANNEL_VALUES[(i + 2) % 4], -1));
    }
    expect(out[8]).toBe(50);
    expect(out[12]).toBe(100);
  });

  it("alpha is always preserved", () => {
    const src = makeImage();
    const out = runProcess("exposure", W, H, src, { amount: 2.5 });
    for (let i = 0; i < W * H; i++) {
      expect(out[i * 4 + 3]).toBe(src[i * 4 + 3]);
    }
  });

  it("output has the same size as the input", () => {
    expect(runExposure(1.75).length).toBe(W * H * 4);
    expect(runExposure(-1.75).length).toBe(W * H * 4);
  });

  it("extreme positive exposure never produces NaN or out-of-range bytes", () => {
    const out = runExposure(20);
    for (let i = 0; i < out.length; i++) {
      expect(Number.isFinite(out[i])).toBe(true);
      expect(out[i]).toBeGreaterThanOrEqual(0);
      expect(out[i]).toBeLessThanOrEqual(255);
    }
  });

  it("extreme negative exposure never produces NaN or out-of-range bytes", () => {
    const out = runExposure(-20);
    for (let i = 0; i < out.length; i++) {
      expect(Number.isFinite(out[i])).toBe(true);
      expect(out[i]).toBeGreaterThanOrEqual(0);
      expect(out[i]).toBeLessThanOrEqual(255);
    }
  });

  it("half-stop (-0.5) scales by sqrt(2)", () => {
    const out = runExposure(-0.5);
    expect(out[0]).toBe(Math.round(2 / Math.SQRT2));
    expect(out[8]).toBe(Math.round(100 / Math.SQRT2));
  });
});

describe("exposure: one unified multiplicative 2^EV factor in every path", () => {
  it("the runtime execution path (worker or inline fallback) is byte-identical to runProcess", async () => {
    const src = makeImage();
    const direct = runProcess("exposure", W, H, src, { amount: 1.5 });
    const viaEngine = await processingEngine.run("exposure", W, H, src, { amount: 1.5 });
    expect(viaEngine.width).toBe(W);
    expect(viaEngine.height).toBe(H);
    expect(Array.from(viaEngine.data)).toEqual(Array.from(direct));
  });

  it("the compositor exposure adjustment layer applies the same 2^EV factor", () => {
    for (const amount of [0.5, 1, -1, 1.5]) {
      const out = compositeWithExposure(amount);
      const expected = runExposure(amount);
      for (let i = 0; i < out.length; i++) {
        if (i % 4 === 3) {
          // Alpha is never modified by exposure in either path.
          expect(out[i]).toBe(expected[i]);
        } else {
          // Identical lookup math; the compositor stores bytes in a
          // Uint8ClampedArray (round-ties-to-even) while the processor uses
          // Math.round, so allow a 1-unit rounding difference.
          expect(Math.abs(out[i] - expected[i])).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it("the compositor keeps dim pixels dim under positive exposure (additive brightness would crush them)", () => {
    const out = compositeWithExposure(1.5);
    expect(out[0]).toBe(expectedValue(2, 1.5));
    expect(out[0]).toBeLessThan(16);
    expect(out[3 * 4]).toBe(255);
  });

  it("exposure amount 0 leaves the composite untouched", () => {
    const out = compositeWithExposure(0);
    expect(Array.from(out)).toEqual(Array.from(makeImage()));
  });
});

describe("exposure: extreme values stay finite, clamped and never touch alpha", () => {
  for (const amount of [100, 200]) {
    it(`+${amount} EV clamps every channel to 255 and preserves alpha`, () => {
      const src = makeImage();
      const out = runProcess("exposure", W, H, src, { amount });
      for (let i = 0; i < out.length; i++) {
        expect(Number.isFinite(out[i])).toBe(true);
        expect(out[i]).toBeGreaterThanOrEqual(0);
        expect(out[i]).toBeLessThanOrEqual(255);
      }
      for (let i = 0; i < W * H; i++) {
        expect(out[i * 4]).toBe(255);
        expect(out[i * 4 + 1]).toBe(255);
        expect(out[i * 4 + 2]).toBe(255);
        expect(out[i * 4 + 3]).toBe(src[i * 4 + 3]);
      }
    });
  }

  for (const amount of [-100, -200]) {
    it(`${amount} EV drives every non-zero channel to near-black and preserves alpha`, () => {
      const src = makeImage();
      const out = runProcess("exposure", W, H, src, { amount });
      for (let i = 0; i < out.length; i++) {
        expect(Number.isFinite(out[i])).toBe(true);
        expect(out[i]).toBeGreaterThanOrEqual(0);
        expect(out[i]).toBeLessThanOrEqual(255);
      }
      for (let i = 0; i < W * H; i++) {
        expect(out[i * 4]).toBe(0);
        expect(out[i * 4 + 1]).toBe(0);
        expect(out[i * 4 + 2]).toBe(0);
        expect(out[i * 4 + 3]).toBe(src[i * 4 + 3]);
      }
    });
  }
});