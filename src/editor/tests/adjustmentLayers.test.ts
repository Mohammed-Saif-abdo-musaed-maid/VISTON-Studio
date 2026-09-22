import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { runProcess } from "../processing/processor";
import { compositeToCanvas } from "../renderer/compositor";
import { EditorDocument, pixelStore } from "../core/document";
import { identityTransform, ImageLayer, AdjustmentLayer, AdjustmentKind, AdjustmentParams } from "../core/types";

const W = 4;
const H = 4;

const CHANNELS = [2, 60, 100, 200];

function makeImage(): Uint8ClampedArray {
  const data = new Uint8ClampedArray(W * H * 4);
  for (let i = 0; i < W * H; i++) {
    data[i * 4] = CHANNELS[i % CHANNELS.length];
    data[i * 4 + 1] = CHANNELS[(i + 1) % CHANNELS.length];
    data[i * 4 + 2] = CHANNELS[(i + 2) % CHANNELS.length];
    data[i * 4 + 3] = (i % 3) * 80 + 15;
  }
  return data;
}

function px(data: Uint8ClampedArray, i = 0): [number, number, number, number] {
  return [data[i * 4], data[i * 4 + 1], data[i * 4 + 2], data[i * 4 + 3]];
}

function assertFiniteClamped(data: Uint8ClampedArray, src: Uint8ClampedArray): void {
  expect(data.length).toBe(src.length);
  for (let i = 0; i < data.length; i++) {
    expect(Number.isFinite(data[i])).toBe(true);
    expect(data[i]).toBeGreaterThanOrEqual(0);
    expect(data[i]).toBeLessThanOrEqual(255);
  }
}

describe("new unified adjustment ops (processor runProcess)", () => {
  it("vibrance amount 0 is identity; pulls the dominant channel further but leaves neutral gray untouched", () => {
    const idle = runProcess("vibrance", W, H, makeImage(), { amount: 0 });
    expect(Array.from(idle)).toEqual(Array.from(makeImage()));

    const gray = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) gray.set([120, 120, 120, 255], i * 4);
    const grayOut = runProcess("vibrance", W, H, gray, { amount: 100 });
    expect(grayOut[0]).toBe(120);

    const muted = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) muted.set([120, 120, 120, 255], i * 4);
    muted[0] = 140; // dominant red over a muted pixel
    const weak = runProcess("vibrance", W, H, muted, { amount: 100 });
    expect(weak[0]).toBeGreaterThan(140);
    expect(weak[1]).toBeLessThan(120);
  });

  it("colorBalance zero is identity; +100 shadows/sum tints pixels by luminance band", () => {
    const src = makeImage();
    const zero = runProcess("colorBalance", W, H, src, { colorBalance: { shadows: 0, midtones: 0, highlights: 0 } });
    expect(Array.from(zero)).toEqual(Array.from(src));

    const out = runProcess("colorBalance", W, H, src, { colorBalance: { shadows: 100, midtones: 100, highlights: 100 } });
    for (let i = 0; i < W * H; i++) {
      // Positive balance pushes toward red.
      expect(out[i * 4]).toBeGreaterThanOrEqual(src[i * 4]);
      expect(out[i * 4 + 2]).toBeLessThanOrEqual(src[i * 4 + 2]);
      expect(out[i * 4 + 3]).toBe(src[i * 4 + 3]);
    }
  });

  it("shadows amount 0 identity; +100 mostly brightens dark pixels, barely touches bright ones", () => {
    const src = makeImage();
    const zero = runProcess("shadows", W, H, src, { amount: 0 });
    expect(Array.from(zero)).toEqual(Array.from(src));
    const dark = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) dark.set([20, 20, 20, 255], i * 4);
    const bright = makeImage();
    bright[1 * 4] = 240; bright[1 * 4 + 1] = 240; bright[1 * 4 + 2] = 240;
    const boosted = runProcess("shadows", W, H, dark, { amount: 100 });
    const brightOut = runProcess("shadows", W, H, bright, { amount: 100 });
    expect(boosted[0]).toBeGreaterThan(20);
    expect(brightOut[4]).toBeGreaterThan(240 * 0.99 - 1);
  });

  it("highlights amount 0 identity; +100 mostly darkens bright pixels, barely touches dark ones", () => {
    const src = makeImage();
    const zero = runProcess("highlights", W, H, src, { amount: 0 });
    expect(Array.from(zero)).toEqual(Array.from(src));
    const bright = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) bright.set([240, 240, 240, 255], i * 4);
    const dark = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) dark.set([20, 20, 20, 255], i * 4);
    const out = runProcess("highlights", W, H, bright, { amount: 100 });
    const darkOut = runProcess("highlights", W, H, dark, { amount: 100 });
    expect(out[0]).toBe(14);
    expect(darkOut[0]).toBe(18);
    expect(20 - darkOut[0]).toBeLessThan(240 - out[0]);
  });

  it("levels identity on defaults; black clamps low end, white clamps high end", () => {
    const src = makeImage();
    const none = runProcess("levels", W, H, src, { levels: { black: 0, mid: 1, white: 255 } });
    expect(Array.from(none)).toEqual(Array.from(src));

    const low = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) low.set([60, 100, 200, 255], i * 4);
    const black = runProcess("levels", W, H, low, { levels: { black: 100, mid: 1, white: 255 } });
    expect(black[0]).toBe(0);
    expect(black[1]).toBe(0);
    expect(black[2]).toBe(Math.round(((200 - 100) / 155) * 255));
    const white = runProcess("levels", W, H, low, { levels: { black: 0, mid: 1, white: 120 } });
    expect(white[2]).toBe(255);
    expect(white[0]).toBe(Math.round((60 / 120) * 255));
  });

  it("curves identity passes through; a shaped curve drives values exactly", () => {
    const src = makeImage();
    const none = runProcess("curves", W, H, src, { curves: [[0, 0], [128, 128], [255, 255]] });
    expect(Array.from(none)).toEqual(Array.from(src));

    // Invert curve.
    const inv = runProcess("curves", W, H, src, { curves: [[0, 255], [128, 128], [255, 0]] });
    expect(Math.abs(inv[0] - (255 - src[0]))).toBeLessThanOrEqual(1);
    expect(Math.abs(inv[4] - (255 - src[4]))).toBeLessThanOrEqual(1);
    expect(inv[15 * 4 + 3]).toBe(src[15 * 4 + 3]);
  });

  it("equalize spreads a stacked histogram", () => {
    const flat = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) flat.set([90, 90, 90, 255], i * 4);
    const out = runProcess("equalize", W, H, flat, {});
    // Constant input has nothing to differentiate; must stay finite and not NaN.
    assertFiniteClamped(out, flat);
    expect(out[3]).toBe(255);

    const split = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H / 2; i++) split.set([30, 30, 30, 255], i * 4);
    for (let i = W * H / 2; i < W * H; i++) split.set([200, 200, 200, 255], i * 4);
    const eq = runProcess("equalize", W, H, split, {});
    // The two halves get pulled apart by equalization.
    expect(eq[0]).toBeLessThan(30);
    expect(eq[(W * H - 1) * 4]).toBeGreaterThan(200);
  });

  it("tint amount 0 identity; +100 pushes toward magenta, -100 toward green", () => {
    const src = makeImage();
    const zero = runProcess("tint", W, H, src, { amount: 0 });
    expect(Array.from(zero)).toEqual(Array.from(src));
    const plus = runProcess("tint", W, H, src, { amount: 100 });
    const minus = runProcess("tint", W, H, src, { amount: -100 });
    for (let i = 0; i < W * H; i++) {
      expect(plus[i * 4]).toBeGreaterThanOrEqual(src[i * 4]);
      expect(plus[i * 4 + 1]).toBeLessThanOrEqual(src[i * 4 + 1]);
      expect(plus[i * 4 + 2]).toBeGreaterThanOrEqual(src[i * 4 + 2]);
      expect(minus[i * 4 + 1]).toBeGreaterThanOrEqual(src[i * 4 + 1]);
    }
  });

  it("blackWhite reduces a colored pixel to equal gray channels using the given weights", () => {
    const src = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) src.set([200, 60, 60, 255], i * 4);
    const out = runProcess("blackWhite", W, H, src, { blackWhite: { red: 1, green: 0, blue: 0 } });
    const [r, g, b] = px(out);
    expect(r).toBe(200);
    expect(g).toBe(200);
    expect(b).toBe(200);
    const all = runProcess("blackWhite", W, H, src, { blackWhite: { red: 1, green: 1, blue: 1 } });
    expect(all[0]).toBe(all[1]);
    expect(all[0]).toBe(Math.round((200 + 60 + 60) / 3));
  });

  it("channelMixer identity passes through; a row swap moves channels", () => {
    const src = makeImage();
    const id = runProcess("channelMixer", W, H, src, {
      channelMixer: { red: { r: 1, g: 0, b: 0 }, green: { r: 0, g: 1, b: 0 }, blue: { r: 0, g: 0, b: 1 } },
    });
    expect(Array.from(id)).toEqual(Array.from(src));

    const redRowGoesToGreen = runProcess("channelMixer", W, H, src, {
      channelMixer: { red: { r: 0, g: 1, b: 0 }, green: { r: 1, g: 0, b: 0 }, blue: { r: 0, g: 0, b: 1 } },
    });
    expect(redRowGoesToGreen[1]).toBe(src[0]);
  });

  it("selectiveColor zeros identity; reds -100 strips red from red pixels", () => {
    const src = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) src.set([200, 40, 40, 255], i * 4);
    const zero = runProcess("selectiveColor", W, H, src, {
      selectiveColor: { reds: 0, yellows: 0, greens: 0, cyans: 0, blues: 0, magentas: 0, whites: 0, neutrals: 0, blacks: 0 },
    });
    expect(Array.from(zero)).toEqual(Array.from(src));
    const out = runProcess("selectiveColor", W, H, src, {
      selectiveColor: { reds: -100, yellows: 0, greens: 0, cyans: 0, blues: 0, magentas: 0, whites: 0, neutrals: 0, blacks: 0 },
    });
    expect(out[0]).toBe(104);
    expect(out[0]).toBeLessThan(110);
    expect(out[1]).toBe(out[2]);
    expect(out[1]).toBe(136);
  });

  it("gradientMap 0/128/255 neutral stops are identity on gray; two-stop map uses luminance", () => {
    const gray = new Uint8ClampedArray(W * H * 4);
    for (let i = 0; i < W * H; i++) gray.set([128, 128, 128, 255], i * 4);
    const neutral = runProcess("gradientMap", W, H, gray, {
      gradientMap: { stops: [{ pos: 0, color: "#000000" }, { pos: 0.5, color: "#7f7f7f" }, { pos: 1, color: "#ffffff" }] },
    });
    for (let i = 0; i < W * H; i++) {
      expect(Math.abs(neutral[i * 4] - 127)).toBeLessThanOrEqual(1);
      expect(Math.abs(neutral[i * 4 + 1] - 127)).toBeLessThanOrEqual(1);
      expect(Math.abs(neutral[i * 4 + 2] - 127)).toBeLessThanOrEqual(1);
    }

    const src = makeImage();
    const mapped = runProcess("gradientMap", W, H, src, {
      gradientMap: { stops: [{ pos: 0, color: "#000000" }, { pos: 1, color: "#ffffff" }] },
    });
    for (let i = 0; i < W * H; i++) {
      // Two-stop black→white map turns every pixel neutral.
      expect(mapped[i * 4]).toBe(mapped[i * 4 + 1]);
      expect(mapped[i * 4 + 1]).toBe(mapped[i * 4 + 2]);
    }
  });

  it("colorLookup identity passes through; grayscale/invert/sepia behave", () => {
    const src = makeImage();
    const id = runProcess("colorLookup", W, H, src, { colorLookup: { lut: "identity" } });
    expect(Array.from(id)).toEqual(Array.from(src));

    const gray = runProcess("colorLookup", W, H, src, { colorLookup: { lut: "grayscale" } });
    const inv = runProcess("colorLookup", W, H, src, { colorLookup: { lut: "invert" } });
    for (let i = 0; i < W * H; i++) {
      expect(gray[i * 4]).toBe(gray[i * 4 + 1]);
      expect(gray[i * 4 + 1]).toBe(gray[i * 4 + 2]);
      expect(inv[i * 4]).toBe(255 - src[i * 4]);
      expect(inv[i * 4 + 3]).toBe(src[i * 4 + 3]);
    }
  });

  it("every new op preserves alpha and never produces NaN or out-of-range bytes at extreme values", () => {
    const src = makeImage();
    const cases: [ProcessOpForTest, ProcessParams][][] = [
      [["vibrance", { amount: 300 }]],
      [["colorBalance", { colorBalance: { shadows: 600, midtones: -600, highlights: 600 } }]],
      [["shadows", { amount: 300 }]],
      [["highlights", { amount: 300 }]],
      [["levels", { levels: { black: 0, mid: 9.9, white: 255 } }]],
      [["curves", { curves: [[0, 255], [255, 0]] }]],
      [["equalize", {}]],
      [["tint", { amount: 100 }]],
      [["blackWhite", { blackWhite: { red: 9, green: -9, blue: 9 } }]],
      [["channelMixer", { channelMixer: { red: { r: -5, g: 5, b: 0 }, green: { r: 0, g: -5, b: 5 }, blue: { r: 5, g: 0, b: -5 } } }]],
      [["selectiveColor", { selectiveColor: { reds: 300, yellows: -300, greens: 300, cyans: -300, blues: 300, magentas: -300, whites: 300, neutrals: -300, blacks: 300 } }]],
      [["gradientMap", { gradientMap: { stops: [{ pos: 0, color: "#ff0000" }, { pos: 1, color: "#00ff00" }] } }]],
      [["colorLookup", { colorLookup: { lut: "sepia" } }]],
    ];
    for (const [[op, p]] of cases) {
      const out = runProcess(op as ProcessOp, W, H, src, p as ProcessParams);
      assertFiniteClamped(out, src);
      for (let i = 0; i < W * H; i++) expect(out[i * 4 + 3]).toBe(src[i * 4 + 3]);
    }
  });
});

type ProcessOpForTest =
  | "vibrance" | "colorBalance" | "shadows" | "highlights" | "levels" | "curves" | "equalize"
  | "tint" | "blackWhite" | "channelMixer" | "selectiveColor" | "gradientMap" | "colorLookup";

import type { ProcessOp, ProcessParams } from "../processing/processor";

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
        for (let py = 0; py < Math.min(canvas.height, y + hh); py++)
          for (let px = Math.max(0, x); px < Math.min(canvas.width, x + w); px++) {
            const i = (py * canvas.width + px) * 4;
            canvas._data[i] = 0;
            canvas._data[i + 1] = 0;
            canvas._data[i + 2] = 0;
            canvas._data[i + 3] = 0;
          }
      },
      fillRect: (x: number, y: number, w: number, hh: number) => {
        const [r, g, b, a] = parseColor(ctx.fillStyle as string);
        for (let py = Math.max(0, y); py < Math.min(canvas.height, y + hh); py++)
          for (let px = Math.max(0, x); px < Math.min(canvas.width, x + w); px++) {
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
            data[di] = canvas._data[si] ?? 0;
            data[di + 1] = canvas._data[si + 1] ?? 0;
            data[di + 2] = canvas._data[si + 2] ?? 0;
            data[di + 3] = canvas._data[si + 3] ?? 0;
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

function compositeWithAdjustment(adjustment: AdjustmentKind, params: AdjustmentParams | null, amount: number): Uint8ClampedArray {
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
    name: "Adj",
    type: "adjustment",
    adjustment,
    amount,
    params,
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

function processorParamsFor(adjustment: AdjustmentKind, params: AdjustmentParams | null, amount: number): ProcessParams {
  switch (adjustment) {
    case "tint": return { tint: params?.tint ?? amount };
    case "blackWhite": return { blackWhite: params?.blackWhite ?? { red: 1, green: 1, blue: 1 } };
    case "channelMixer": return { channelMixer: params?.channelMixer ?? { red: { r: 1, g: 0, b: 0 }, green: { r: 0, g: 1, b: 0 }, blue: { r: 0, g: 0, b: 1 } } };
    case "selectiveColor": return { selectiveColor: params?.selectiveColor ?? { reds: 0, yellows: 0, greens: 0, cyans: 0, blues: 0, magentas: 0, whites: 0, neutrals: 0, blacks: 0 } };
    case "gradientMap": return { gradientMap: params?.gradientMap ?? { stops: [] } };
    case "colorLookup": return { colorLookup: params?.colorLookup ?? { lut: "identity" } };
    default: return {};
  }
}

describe("new adjustment ops: compositor adjustment-layer path matches the processor (parity by construction)", () => {
  const cases: { kind: AdjustmentKind; params: AdjustmentParams | null; amount: number }[] = [
    { kind: "tint", params: null, amount: 60 },
    { kind: "tint", params: null, amount: -30 },
    { kind: "blackWhite", params: { blackWhite: { red: 1, green: 0.3, blue: 0.1 } }, amount: 1 },
    { kind: "channelMixer", params: { channelMixer: { red: { r: 0.5, g: 0.5, b: 0 }, green: { r: 0, g: 1, b: 0 }, blue: { r: 0, g: 0, b: 1 } } }, amount: 1 },
    { kind: "selectiveColor", params: { selectiveColor: { reds: -50, yellows: 30, greens: 0, cyans: 0, blues: 0, magentas: 0, whites: 0, neutrals: 0, blacks: 0 } }, amount: 1 },
    { kind: "gradientMap", params: { gradientMap: { stops: [{ pos: 0, color: "#000000" }, { pos: 1, color: "#ff0080" }] } }, amount: 1 },
    { kind: "colorLookup", params: { colorLookup: { lut: "sepia" } }, amount: 1 },
    { kind: "colorLookup", params: { colorLookup: { lut: "invert" } }, amount: 1 },
  ];

  for (const c of cases) {
    it(`${c.kind} composited output equals runProcess within 1 unit`, () => {
      const composite = compositeWithAdjustment(c.kind, c.params, c.amount);
      const expected = runProcess(c.kind, W, H, makeImage(), { ...processorParamsFor(c.kind, c.params, c.amount) });
      for (let i = 0; i < composite.length; i++) {
        if (i % 4 === 3) expect(composite[i]).toBe(expected[i]);
        else expect(Math.abs(composite[i] - expected[i])).toBeLessThanOrEqual(1);
      }
    });
  }

  it("zero-amount tint leaves the composite untouched", () => {
    const composite = compositeWithAdjustment("tint", null, 0);
    expect(Array.from(composite)).toEqual(Array.from(makeImage()));
  });
});