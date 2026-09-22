import { describe, it, expect, vi, beforeEach, afterEach, beforeAll, afterAll } from "vitest";
import { EditorEngine } from "../core/engine";
import { runtime } from "../core/runtime";
import { useEditorStore } from "../../state/store";
import { pixelStore, maskStore } from "../core/document";
import { createBlankImageLayer } from "../layers/layerFactory";
import { selectionEngine } from "../selection/selectionEngine";

type Color = [number, number, number, number];

function parseColor(s: string): Color {
  if (!s) return [0, 0, 0, 0];
  const hex = /^#([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(String(s));
  if (hex) {
    return [
      parseInt(hex[1]!.slice(0, 2), 16),
      parseInt(hex[1]!.slice(2, 4), 16),
      parseInt(hex[1]!.slice(4, 6), 16),
      hex[2] ? parseInt(hex[2], 16) : 255,
    ];
  }
  const rgba = /^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+))?\s*\)$/i.exec(String(s));
  if (rgba) {
    return [+rgba[1]!, +rgba[2]!, +rgba[3]!, rgba[4] === undefined ? 255 : Math.round(parseFloat(rgba[4]) * 255)];
  }
  return [255, 255, 255, 255];
}

const W = 32;
const H = 32;

const h = vi.hoisted(() => {
  const makeCtx = (canvas: { _data: Uint8ClampedArray; width: number; height: number }): CanvasRenderingContext2D => {
    let globalAlpha = 1;
    let globalCompositeOperation = "source-over";
    let fillStyle: Color | { stops: [number, Color][]; x0: number; y0: number; r0: number; x1: number; y1: number; r1: number } = [0, 0, 0, 255];
    let lastArc: { x: number; y: number; r: number } | null = null;

    const blend = (i: number, newCol: Color): void => {
      const dst: Color = [canvas._data[i], canvas._data[i + 1], canvas._data[i + 2], canvas._data[i + 3]];
      const sa = (newCol[3] * globalAlpha) / 255;
      if (globalCompositeOperation === "destination-out") {
        canvas._data[i + 3] = Math.max(0, Math.round(dst[3] * (1 - sa)));
        return;
      }
      const da = dst[3] / 255;
      const oa = sa + da * (1 - sa);
      if (oa <= 0) { canvas._data[i] = 0; canvas._data[i + 1] = 0; canvas._data[i + 2] = 0; canvas._data[i + 3] = 0; return; }
      for (let k = 0; k < 3; k++) {
        canvas._data[i + k] = Math.round((newCol[k] * sa + dst[k] * da * (1 - sa)) / oa);
      }
      canvas._data[i + 3] = Math.round(oa * 255);
    };

    const colorAt = (x: number, y: number): Color => {
      if (Array.isArray(fillStyle)) return fillStyle;
      const g = fillStyle;
      const dx = x - g.x0;
      const dy = y - g.y0;
      const dIn = Math.hypot(dx, dy);
      const outer = g.r1 || 1;
      let t = Math.max(0, Math.min(1, dIn / outer));
      const sorted = [...g.stops].sort((a, b) => a[0] - b[0]);
      for (let s = 1; s < sorted.length; s++) {
        const [pa, ca] = sorted[s - 1]!;
        const [pb, cb] = sorted[s]!;
        if (t <= pb) {
          const tt = (t - pa) / (pb - pa || 1);
          return [ca[0] + (cb[0] - ca[0]) * tt, ca[1] + (cb[1] - ca[1]) * tt, ca[2] + (cb[2] - ca[2]) * tt, ca[3] + (cb[3] - ca[3]) * tt];
        }
      }
      return sorted[sorted.length - 1]![1];
    };

    const ctx: Record<string, unknown> = {
      fillStyle: "#000000",
      strokeStyle: "#000000",
      lineWidth: 1,
      filter: "none",
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
      get globalAlpha() { return globalAlpha; },
      set globalAlpha(v: number) { globalAlpha = v; },
      get globalCompositeOperation() { return globalCompositeOperation; },
      set globalCompositeOperation(v: string) { globalCompositeOperation = v; },
      setTransform: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(() => { lastArc = null; }),
      arc: vi.fn((x: number, y: number, r: number) => { lastArc = { x, y, r }; }),
      closePath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      measureText: vi.fn(() => ({ width: 0 })),
      fill: vi.fn(() => {
        if (!lastArc) return;
        const { x, y, r } = lastArc;
        const rr = Math.max(1, r);
        for (let py = Math.floor(y - rr); py <= Math.ceil(y + rr); py++) {
          for (let px = Math.floor(x - rr); px <= Math.ceil(x + rr); px++) {
            if (px < 0 || py < 0 || px >= canvas.width || py >= canvas.height) continue;
            if (Math.hypot(px - x, py - y) > rr) continue;
            blend((py * canvas.width + px) * 4, colorAt(px, py));
          }
        }
        lastArc = null;
      }),
      createRadialGradient: vi.fn((x0: number, y0: number, r0: number, x1: number, y1: number, r1: number) => {
        const g = { x0, y0, r0, r1, stops: [] as [number, Color][] };
        (g as unknown as { addColorStop: (pos: number, c: string) => void }).addColorStop = (pos: number, c: string) => { g.stops.push([pos, parseColor(c)]); };
        return g as unknown as CanvasGradient;
      }),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() } as unknown as CanvasGradient)),
      clearRect: (x: number, y: number, w: number, hh: number) => {
        for (let py = y; py < Math.min(canvas.height, y + hh); py++)
          for (let px = x; px < Math.min(canvas.width, x + w); px++) {
            const i = (py * canvas.width + px) * 4;
            canvas._data[i] = 0; canvas._data[i + 1] = 0; canvas._data[i + 2] = 0; canvas._data[i + 3] = 0;
          }
      },
      fillRect: (x: number, y: number, w: number, hh: number) => {
        const col = Array.isArray(fillStyle) ? fillStyle : [255, 255, 255, 255];
        for (let py = Math.max(0, y); py < Math.min(canvas.height, y + hh); py++)
          for (let px = Math.max(0, x); px < Math.min(canvas.width, x + w); px++) {
            blend((py * canvas.width + px) * 4, col as Color);
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
        width: w, height: hh, data: new Uint8ClampedArray(Math.max(0, w) * Math.max(0, hh) * 4),
      }),
      drawImage: (src: { width: number; height: number; _data?: Uint8ClampedArray }, dx = 0, dy = 0, dw?: number, dh?: number) => {
        const sd = (src as { _data: Uint8ClampedArray })._data ?? new Uint8ClampedArray(src.width * src.height * 4);
        const sw = src.width, sh = src.height;
        const nw = dw ?? sw, nh = dh ?? sh;
        for (let y = 0; y < nh; y++) {
          const sy = Math.min(sh - 1, Math.floor((y / Math.max(1, nh)) * sh));
          for (let x = 0; x < nw; x++) {
            const sx = Math.min(sw - 1, Math.floor((x / Math.max(1, nw)) * sw));
            const ox = Math.floor(dx) + x, oy = Math.floor(dy) + y;
            if (ox < 0 || oy < 0 || ox >= canvas.width || oy >= canvas.height) continue;
            const di = (oy * canvas.width + ox) * 4, si = (sy * sw + sx) * 4;
            canvas._data[di] = sd[si];
            canvas._data[di + 1] = sd[si + 1];
            canvas._data[di + 2] = sd[si + 2];
            canvas._data[di + 3] = sd[si + 3];
          }
        }
      },
    };
    const ctxDef: PropertyDescriptorMap = {
      fillStyle: {
        get: () => "#000000",
        set: (v: string | Color) => { fillStyle = typeof v === "string" ? parseColor(v) : v; },
      },
    };
    Object.defineProperties(ctx as unknown as object, ctxDef);
    return ctx as unknown as CanvasRenderingContext2D;
  };

  const makeCanvas = (w: number, hh: number): HTMLCanvasElement & { _ctx?: CanvasRenderingContext2D; _data: Uint8ClampedArray } => {
    const bw = Math.max(1, Math.round(w)), bh = Math.max(1, Math.round(hh));
    const c = {
      width: bw, height: bh,
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
    getCtx: (c: HTMLCanvasElement & { _ctx?: CanvasRenderingContext2D }): CanvasRenderingContext2D => c._ctx ?? (c.getContext("2d") as CanvasRenderingContext2D),
  };
});

vi.mock("../../utils/canvas", () => ({
  createCanvas: vi.fn((w: number, ht: number) => h.makeCanvas(w, ht)),
  getContext2d: vi.fn((c: HTMLCanvasElement & { _ctx?: CanvasRenderingContext2D }) => c._ctx ?? (c.getContext("2d") as CanvasRenderingContext2D)),
  decodeImageFileSafe: vi.fn(),
  imageFileToCanvas: vi.fn(),
  dataURLToCanvas: vi.fn(),
}));

vi.mock("../renderer/compositor", () => ({
  compositeToCanvas: vi.fn(() => null),
  renderLayerToCanvas: vi.fn(() => null),
}));

class FakeDOMMatrix {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  translateSelf(x: number, y: number): this { this.e += x; this.f += y; return this; }
  rotateSelf(): this { return this; }
  scaleSelf(sx: number, sy: number): this { this.a *= sx; this.d *= sy; return this; }
  multiply(_o: FakeDOMMatrix): FakeDOMMatrix { return new FakeDOMMatrix(); }
}

beforeAll(() => { vi.stubGlobal("DOMMatrix", FakeDOMMatrix); });
afterAll(() => { vi.unstubAllGlobals(); });

const canvasEngineStub = () =>
  ({
    fitToScreen: vi.fn(), resetCamera: vi.fn(), requestRender: vi.fn(), zoom100: vi.fn(),
    zoomAtVP: vi.fn(), element: vi.fn(), resize: vi.fn(), zoomTo: vi.fn(), docFromVP: vi.fn(), vpFromDoc: vi.fn(),
  }) as unknown as typeof runtime.canvas;

function maskAlpha(engine: EditorEngine, id: string): Uint8ClampedArray {
  const l = engine.doc()!.getLayer(id)! as { mask: { id: string } };
  const c = maskStore.get(l.mask.id)!;
  return h.getCtx(c).getImageData(0, 0, c.width, c.height).data.slice();
}

function layerMasked(engine: EditorEngine, id: string): { id: string; enabled: boolean; linked: boolean } | null {
  const l = engine.doc()!.getLayer(id) as { mask: { id: string; enabled: boolean; linked: boolean } | null };
  return l.mask;
}

describe("layer masks: create, paint, invert, feather, levels, link, selection", () => {
  let engine: EditorEngine;

  beforeEach(async () => {
    engine = new EditorEngine();
    runtime.engine = engine;
    runtime.canvas = canvasEngineStub();
    await engine.createNewDocument({ width: W, height: H, background: "#ffffff", name: "M" });
  });

  afterEach(() => {
    runtime.engine = null as unknown as EditorEngine;
    runtime.canvas = null as unknown as typeof runtime.canvas;
    selectionEngine.toggleVisibility(false);
  });

  function addImage(): string {
    const img = createBlankImageLayer("I", W, H, "transparent");
    engine.addLayer(img, "Add image");
    return img.id;
  }

  it("addMaskToLayer creates a fully white, linked, enabled mask", () => {
    const id = addImage();
    engine.addMaskToLayer(id);
    const m = layerMasked(engine, id);
    expect(m).not.toBeNull();
    expect(m!.enabled).toBe(true);
    expect(m!.linked).toBe(true);
    const a = maskAlpha(engine, id);
    expect(a.length).toBe(W * H * 4);
    for (let i = 3; i < a.length; i += 4) expect(a[i]).toBe(255);
  });

  it("brush restores alpha where the eraser removed it (radial dabs)", () => {
    const id = addImage();
    engine.addMaskToLayer(id);
    const center = (10 * W + 10) * 4 + 3;
    expect(maskAlpha(engine, id)[center]).toBe(255);
    engine.beginMaskPaint(id);
    engine.paintMaskDab(id, 10, 10, 6, true, 0, 1); // eraser: alpha down
    expect(maskAlpha(engine, id)[center]).toBe(0);
    engine.paintMaskDab(id, 10, 10, 6, false, 0, 1); // brush: alpha restored
    expect(maskAlpha(engine, id)[center]).toBe(255);
    engine.endMaskPaint(id);
  });

  it("a mask paint stroke is one undoable history entry that restores the pre-stroke alpha", () => {
    const id = addImage();
    engine.addMaskToLayer(id);
    const base = engine.history.items().length;
    const beforeAlpha = maskAlpha(engine, id);

    engine.beginMaskPaint(id);
    engine.paintMaskDab(id, 12, 12, 8, true, 1, 1); // erase a hard dab
    const painted = maskAlpha(engine, id);
    const c0 = (12 * W + 12) * 4 + 3;
    expect(painted[c0]).toBe(0);
    engine.endMaskPaint(id);
    expect(engine.history.items().length).toBe(base + 1);
    expect(engine.history.items()[base]?.name).toBe("Paint Mask");

    engine.undo();
    const undone = maskAlpha(engine, id);
    expect(Array.from(undone)).toEqual(Array.from(beforeAlpha));
    engine.redo();
    const redone = maskAlpha(engine, id);
    expect(redone[c0]).toBe(0);
  });

  it("invertMaskLayer flips alpha and is undoable", () => {
    const id = addImage();
    engine.addMaskToLayer(id);
    engine.invertMaskLayer(id);
    const a = maskAlpha(engine, id);
    expect(a[3]).toBe(0);
    engine.undo();
    const back = maskAlpha(engine, id);
    expect(back[3]).toBe(255);
    engine.redo();
    expect(maskAlpha(engine, id)![3]).toBe(0);
  });

  it("blurMaskLayer softens a hard edge and no-ops at radius 0", () => {
    const id = addImage();
    engine.addMaskToLayer(id);
    const m = layerMasked(engine, id)!;
    // Build a hard left/right split: black on the left half, white on the right.
    const c = h.makeCanvas(W, H);
    const ctx = h.getCtx(c);
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const i = (y * W + x) * 4;
        img.data[i + 3] = x < 16 ? 0 : 255;
      }
    }
    ctx.putImageData(img, 0, 0);
    maskStore.set(m.id, c);

    const pre = maskAlpha(engine, id);
    // Along the boundary column 15/16 there is a full jump.
    const midBefore = (8 * W + 16) * 4 + 3;
    expect(pre[midBefore]).toBe(255);
    expect(pre[midBefore - 4]).toBe(0);

    engine.blurMaskLayer(id, 3);
    const blurred = maskAlpha(engine, id);
    // Intermediate alpha appears near the boundary.
    let partial = 0;
    for (let x = 10; x < 22; x++) {
      const v = blurred[(8 * W + x) * 4 + 3]!;
      if (v > 0 && v < 255) partial++;
    }
    expect(partial).toBeGreaterThan(0);
    // Far left stays 0, far right stays 255.
    expect(blurred[(8 * W + 2) * 4 + 3]).toBe(0);
    expect(blurred[(8 * W + 30) * 4 + 3]).toBe(255);

    engine.blurMaskLayer(id, 0);
    const afterNoop = maskAlpha(engine, id);
    expect(Array.from(afterNoop)).toEqual(Array.from(blurred));
  });

  it("levelsMaskLayer clips black end and is undoable; defaults are identity", () => {
    const id = addImage();
    engine.addMaskToLayer(id);
    const m = layerMasked(engine, id)!;
    const c = h.makeCanvas(W, H);
    const ctx = h.getCtx(c);
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      img.data[i + 3] = (x * 8) % 256;
    }
    ctx.putImageData(img, 0, 0);
    maskStore.set(m.id, c);

    engine.levelsMaskLayer(id, { black: 100, mid: 1, white: 255 });
    const a = maskAlpha(engine, id);
    expect(a[3]).toBe(0); // value 0 clipped
    expect(a[(0 * W + 12) * 4 + 3]).toBe(0); // 96 <= 100 clipped
    expect(a[(0 * W + 20) * 4 + 3]).toBeGreaterThan(0); // >100 survives
    engine.undo();
    const back = maskAlpha(engine, id);
    expect(back[3]).toBe(0);
    expect(back[(0 * W + 20) * 4 + 3]).toBe(160);
  });

  it("setMaskLinked toggles linkage and is undoable", () => {
    const id = addImage();
    engine.addMaskToLayer(id);
    engine.setMaskLinked(id, false);
    expect(layerMasked(engine, id)!.linked).toBe(false);
    engine.undo();
    expect(layerMasked(engine, id)!.linked).toBe(true);
    engine.redo();
    expect(layerMasked(engine, id)!.linked).toBe(false);
  });

  it("maskFromSelection + selectionFromMask round-trip a rectangular selection", () => {
    const id = addImage();
    // Selection covers the whole doc (1-px values: 255 = fully selected).
    selectionEngine.resize(W, H);
    selectionEngine.makeAll();
    engine.maskFromSelection(id);
    const m = layerMasked(engine, id)!;
    const a = maskAlpha(engine, id);
    expect(a[3]).toBe(255);
    expect(m.linked).toBe(true);

    // Hose down the visible part: black-out half the mask, then export to selection.
    const c = h.makeCanvas(W, H);
    const ctx = h.getCtx(c);
    const img = ctx.createImageData(W, H);
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      img.data[i + 3] = x < 16 ? 120 : 30;
    }
    ctx.putImageData(img, 0, 0);
    maskStore.set(m.id, c);
    engine.selectionFromMask(id);
    const sel = selectionEngine.getMask();
    expect(sel).not.toBeNull();
    expect(sel![0]).toBe(120);
    expect(sel![(0 * W + 16)]).toBe(30);
  });
});