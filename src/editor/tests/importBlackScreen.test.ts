import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EditorEngine } from "../core/engine";
import { runtime } from "../core/runtime";
import { useEditorStore } from "../../state/store";
import { pixelStore } from "../core/document";
import { MAX_DECODED_IMAGE_AREA } from "../../utils/canvas";

/**
 * "IMPORT → black screen" regression coverage.
 *
 * The full File → Decode → Document → Layer → Composite → First Render chain
 * is exercised with the REAL `decodeImageFileSafe`, the REAL layer factory,
 * the REAL `EditorEngine` and the REAL compositor (no module mocking), over an
 * in-memory pixel-backed canvas that records actual RGBA writes — so a
 * regressed pipeline cannot silently pass: the assertions check that the
 * imported image's pixels actually land on the composite and on the visible
 * viewport surface after the first rendered frame.
 */

// ── tiny RGBA color helpers ──────────────────────────────────────────────

type RGBA = Uint8ClampedArray;

function parseHex(color: string): [number, number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (!m) return [0, 0, 0, 255];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
}

// ── in-memory pixel canvas + context ─────────────────────────────────────

interface Drawable {
  width: number;
  height: number;
  data: RGBA;
}

function makeData(w: number, h: number): RGBA {
  return new Uint8ClampedArray(Math.max(0, Math.floor(w)) * Math.max(0, Math.floor(h)) * 4);
}

function clampIndex(x: number, y: number, w: number, h: number): number {
  const px = Math.min(Math.max(0, Math.floor(x)), w - 1);
  const py = Math.min(Math.max(0, Math.floor(y)), h - 1);
  return (py * w + px) * 4;
}

class PixelCtx {
  canvas: PixelCanvas;
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  imageSmoothingEnabled = true;
  imageSmoothingQuality = "low";
  filter = "none";
  fillStyle = "#000000";
  strokeStyle = "#000000";
  lineWidth = 1;
  font = "10px sans-serif";
  textAlign = "start";
  textBaseline = "alphabetic";

  private a = 1; private b = 0; private c = 0; private d = 1; private e = 0; private f = 0;
  private stack: Array<[number, number, number, number, number, number]> = [];

  constructor(canvas: PixelCanvas) {
    this.canvas = canvas;
  }

  setTransform(a: number, b: number, c: number, d: number, e: number, f: number): void {
    this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f;
  }

  save(): void { this.stack.push([this.a, this.b, this.c, this.d, this.e, this.f]); }
  restore(): void {
    const [a, b, c, d, e, f] = this.stack.pop() ?? [1, 0, 0, 1, 0, 0];
    this.a = a; this.b = b; this.c = c; this.d = d; this.e = e; this.f = f;
  }
  translate(x: number, y: number): void { this.e += x * this.a + y * this.c; this.f += y * this.d + x * this.b; }
  scale(sx: number, sy: number): void { this.a *= sx; this.b *= sy; this.c *= sx; this.d *= sy; }
  rotate(_phi: number): void { /* rotation is not exercised by the flows under test */ }

  private isAxisAligned(): boolean {
    return Math.abs(this.b) < 1e-9 && Math.abs(this.c) < 1e-9 && this.a > 0 && this.d > 0;
  }

  private map2(x: number, y: number): [number, number] {
    if (!this.isAxisAligned()) return [x, y];
    return [x * this.a + this.e, y * this.d + this.f];
  }

  private blendAt(dst: RGBA, i: number, r: number, g: number, b: number, alpha: number): void {
    const sa = alpha * this.globalAlpha;
    if (sa >= 1) { dst[i] = r; dst[i + 1] = g; dst[i + 2] = b; dst[i + 3] = 255; return; }
    const da = dst[i + 3] / 255;
    const outA = sa + da * (1 - sa);
    if (outA <= 0) { dst[i] = 0; dst[i + 1] = 0; dst[i + 2] = 0; dst[i + 3] = 0; return; }
    dst[i] = (r * sa + dst[i] * da * (1 - sa)) / outA;
    dst[i + 1] = (g * sa + dst[i + 1] * da * (1 - sa)) / outA;
    dst[i + 2] = (b * sa + dst[i + 2] * da * (1 - sa)) / outA;
    dst[i + 3] = outA * 255;
  }

  clearRect(x: number, y: number, w: number, h: number): void {
    const [x0, y0] = this.map2(x, y);
    const [x1, y1] = this.map2(x + w, y + h);
    const data = this.canvas.data;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const { globalAlpha: ga } = this;
    for (let yy = Math.max(0, Math.floor(y0)); yy < Math.min(ch, Math.ceil(y1)); yy++) {
      for (let xx = Math.max(0, Math.floor(x0)); xx < Math.min(cw, Math.ceil(x1)); xx++) {
        const i = (yy * cw + xx) * 4;
        if (ga >= 1) { data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 0; }
      }
    }
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const [r, g, b, a] = parseHex(this.fillStyle);
    const [x0, y0] = this.map2(x, y);
    const [x1, y1] = this.map2(x + w, y + h);
    const data = this.canvas.data;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    for (let yy = Math.max(0, Math.floor(y0)); yy < Math.min(ch, Math.ceil(y1)); yy++) {
      for (let xx = Math.max(0, Math.floor(x0)); xx < Math.min(cw, Math.ceil(x1)); xx++) {
        const i = (yy * cw + xx) * 4;
        this.blendAt(data, i, r, g, b, a / 255);
      }
    }
  }

  drawImage(src: Drawable | ImageStub, ...args: number[]): void {
    let sx = 0;
    let sy = 0;
    let sw = src.width;
    let sh = src.height;
    let dx: number;
    let dy: number;
    let dw: number;
    let dh: number;
    if (args.length >= 9) {
      // drawImage(img, sx, sy, sw, sh, dx, dy, dw, dh)
      sx = args[0]; sy = args[1]; sw = args[2]; sh = args[3];
      dx = args[4]; dy = args[5]; dw = args[6]; dh = args[7];
    } else if (args.length >= 4) {
      // drawImage(img, dx, dy, dWidth, dHeight)
      dx = args[0]; dy = args[1]; dw = args[2]; dh = args[3];
    } else {
      // drawImage(img, dx, dy)
      dx = args[0] ?? 0; dy = args[1] ?? 0; dw = src.width; dh = src.height;
    }
    this.canvas.drawImageCalls.push({ src: src as Drawable, dx, dy, dw, dh });
    this.blit(src, sx, sy, sw, sh, dx, dy, dw, dh);
  }

  private blit(src: Drawable | ImageStub, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void {
    if (sw <= 0 || sh <= 0 || dw <= 0 || dh <= 0 || !src.data || !this.isAxisAligned()) return;
    const [x0, y0] = this.map2(dx, dy);
    const [x1, y1] = this.map2(dx + dw, dy + dh);
    const data = this.canvas.data;
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    const sdata = src.data;
    const scw = src.width;
    const sch = src.height;
    const xStart = Math.max(0, Math.floor(x0));
    const xEnd = Math.min(cw, Math.ceil(x1));
    const yStart = Math.max(0, Math.floor(y0));
    const yEnd = Math.min(ch, Math.ceil(y1));
    for (let yy = yStart; yy < yEnd; yy++) {
      const ty = (yy - y0) / (y1 - y0 || 1);
      for (let xx = xStart; xx < xEnd; xx++) {
        const tx = (xx - x0) / (x1 - x0 || 1);
        const si = clampIndex(sx + tx * sw, sy + ty * sh, scw, sch);
        const di = (yy * cw + xx) * 4;
        this.blendAt(data, di, sdata[si], sdata[si + 1], sdata[si + 2], (sdata[si + 3] ?? 255) / 255);
      }
    }
  }

  getImageData(x: number, y: number, w: number, h: number): ImageData {
    const out = makeData(w, h);
    const cw = this.canvas.width;
    for (let yy = 0; yy < Math.floor(h); yy++) {
      for (let xx = 0; xx < Math.floor(w); xx++) {
        const si = clampIndex(x + xx, y + yy, cw, Math.max(1, this.canvas.height)) * 4;
        const di = (yy * Math.floor(w) + xx) * 4;
        out[di] = this.canvas.data[si];
        out[di + 1] = this.canvas.data[si + 1];
        out[di + 2] = this.canvas.data[si + 2];
        out[di + 3] = this.canvas.data[si + 3];
      }
    }
    return { width: Math.floor(w), height: Math.floor(h), data: out } as unknown as ImageData;
  }

  putImageData(imageData: { width: number; height: number; data: RGBA }, x: number, y: number): void {
    const cw = this.canvas.width;
    const ch = this.canvas.height;
    for (let yy = 0; yy < imageData.height; yy++) {
      for (let xx = 0; xx < imageData.width; xx++) {
        const dx0 = x + xx;
        const dy0 = y + yy;
        if (dx0 < 0 || dy0 < 0 || dx0 >= cw || dy0 >= ch) continue;
        const di = (dy0 * cw + dx0) * 4;
        const si = (yy * imageData.width + xx) * 4;
        this.canvas.data[di] = imageData.data[si];
        this.canvas.data[di + 1] = imageData.data[si + 1];
        this.canvas.data[di + 2] = imageData.data[si + 2];
        this.canvas.data[di + 3] = imageData.data[si + 3];
      }
    }
  }

  createImageData(w: number, h: number): ImageData {
    return { width: w, height: h, data: makeData(w, h) } as unknown as ImageData;
  }

  // Painting primitives not exercised by these flows (kept as no-ops so the
  // canvas engine's overlay passes never throw).
  beginPath(): void {}
  rect(): void {}
  clip(): void {}
  stroke(): void {}
  strokeRect(): void {}
  fill(): void {}
  fillText(): void {}
  arc(): void {}
  moveTo(): void {}
  lineTo(): void {}
  closePath(): void {}
  ellipse(): void {}
  setLineDash(): void {}
  measureText(): { width: number } { return { width: 10 }; }
}

const domSurface = {
  className: "",
  style: {} as Record<string, string>,
  addEventListener: () => undefined,
  removeEventListener: () => undefined,
  remove: () => undefined,
};

class PixelCanvas implements Drawable {
  private _w = 1;
  private _h = 1;
  data: RGBA;
  ctx: PixelCtx;
  getContextCalls = 0;
  drawImageCalls: Array<{ src: Drawable | ImageStub; dx: number; dy: number; dw: number; dh: number }> = [];
  constructor(w: number, h: number) {
    this.data = makeData(Math.max(1, Math.floor(w)), Math.max(1, Math.floor(h)));
    this._w = Math.max(1, Math.floor(w));
    this._h = Math.max(1, Math.floor(h));
    this.ctx = new PixelCtx(this);
  }
  get width(): number { return this._w; }
  set width(v: number) {
    this._w = Math.max(1, Math.floor(v));
    this.data = makeData(this._w, this._h);
  }
  get height(): number { return this._h; }
  set height(v: number) {
    this._h = Math.max(1, Math.floor(v));
    this.data = makeData(this._w, this._h);
  }
  getContext(): PixelCtx {
    this.getContextCalls++;
    return this.ctx;
  }
  toDataURL(): string { return "data:image/png;base64,AAAA"; }
  getBoundingClientRect(): { width: number; height: number } { return { width: this.width, height: this.height }; }
}

// ── Image stub (drives the real `decodeImageFileSafe`) ────────────────────

const FILL_COLOR: [number, number, number, number] = [255, 32, 32, 255];

class ImageStub implements Drawable {
  width: number;
  height: number;
  naturalWidth: number;
  naturalHeight: number;
  data: RGBA;
  onload: (() => void) | null = null;
  onerror: (() => void) | null = null;
  private _src = "";
  constructor(nw = 64, nh = 48) {
    this.naturalWidth = nw;
    this.naturalHeight = nh;
    this.width = nw;
    this.height = nh;
    this.data = makeData(nw, nh);
    for (let i = 0; i < this.data.length; i += 4) {
      this.data[i] = FILL_COLOR[0];
      this.data[i + 1] = FILL_COLOR[1];
      this.data[i + 2] = FILL_COLOR[2];
      this.data[i + 3] = FILL_COLOR[3];
    }
  }
  get src(): string { return this._src; }
  set src(_v: string) {
    this._src = _v;
    queueMicrotask(() => this.onload?.());
  }
}

let nextImageSize: [number, number] = [64, 48];

function installImageStub(): void {
  (globalThis as Record<string, unknown>).Image = class extends ImageStub {
    constructor() { super(nextImageSize[0], nextImageSize[1]); }
  } as never;
}

// ── minimal DOMMatrix (used by localMatrix / compositor) ───────────────────

class FakeMatrix {
  a = 1; b = 0; c = 0; d = 1; e = 0; f = 0;
  translateSelf(x: number, y: number): this { this.e += x; this.f += y; return this; }
  rotateSelf(_rz: number, _ry: number, _rx: number): this { return this; }
  scaleSelf(sx: number, sy: number): this { this.a *= sx; this.b *= sy; this.c *= sx; this.d *= sy; return this; }
  multiply(m: FakeMatrix): FakeMatrix {
    const r = new FakeMatrix();
    r.a = this.a * m.a + this.b * m.c;
    r.b = this.a * m.b + this.b * m.d;
    r.c = this.c * m.a + this.d * m.c;
    r.d = this.c * m.b + this.d * m.d;
    r.e = this.e * m.a + this.f * m.c + m.e;
    r.f = this.e * m.b + this.f * m.d + m.f;
    return r;
  }
}

// ── global DOM harness ─────────────────────────────────────────────────────

const created: PixelCanvas[] = [];
const rafQueue: FrameRequestCallback[] = [];

function installDom(viewW = 800, viewH = 600): void {
  created.length = 0;
  rafQueue.length = 0;
  const g = globalThis as unknown as Record<string, unknown>;
  g.document = {
    createElement: (tag: string) => {
      if (tag === "canvas") {
        const c = new PixelCanvas(1, 1);
        Object.assign(c, domSurface);
        created.push(c);
        return c;
      }
      return {};
    },
  };
  g.window = { devicePixelRatio: 1, addEventListener: () => undefined, removeEventListener: () => undefined };
  g.requestAnimationFrame = (cb: FrameRequestCallback): number => { rafQueue.push(cb); return rafQueue.length; };
  g.cancelAnimationFrame = (): void => undefined;
  g.ResizeObserver = class { observe(): void {} disconnect(): void {} };
  g.DOMMatrix = FakeMatrix as never;
}

function flushRafUntilIdle(): void {
  for (let guard = 0; guard < 100 && rafQueue.length > 0; guard++) {
    const batch = rafQueue.splice(0);
    for (const cb of batch) cb(0);
  }
}

function pixel(canvas: Drawable, x: number, y: number): [number, number, number, number] {
  const i = (Math.floor(y) * canvas.width + Math.floor(x)) * 4;
  return [canvas.data[i], canvas.data[i + 1], canvas.data[i + 2], canvas.data[i + 3]];
}

const fakeFile = (name: string): File => {
  const blob = new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
  return Object.assign(blob, { name }) as File;
};

function freshEngine(): EditorEngine {
  return new EditorEngine();
}

describe("IMPORT black screen pipeline", () => {
  let engine: EditorEngine;

  beforeEach(() => {
    engine = freshEngine();
    runtime.engine = engine;
    runtime.canvas = null;
    pixelStore.clear();
    nextImageSize = [64, 48];
    useEditorStore.setState({ doc: null, busy: false, lastError: null, status: "Ready", selectedIds: [] });
    installImageStub();
    installDom();
  });

  afterEach(() => {
    runtime.canvas?.destroy();
    runtime.canvas = null;
    const g = globalThis as unknown as Record<string, unknown>;
    delete g.document;
    delete g.window;
    delete g.requestAnimationFrame;
    delete g.cancelAnimationFrame;
    delete g.ResizeObserver;
    delete g.DOMMatrix;
    delete g.Image;
    useEditorStore.setState({ doc: null, busy: false, lastError: null, status: "Ready", selectedIds: [] });
  });

  it("decode caps the total pixel AREA (browser render-safe) even when the per-side limit is respected", async () => {
    const { decodeImageFileSafe } = await import("../../utils/canvas");
    nextImageSize = [20000, 20000];

    const decoded = await decodeImageFileSafe(fakeFile("huge.png"));

    expect(decoded.naturalWidth).toBe(20000);
    expect(decoded.naturalHeight).toBe(20000);
    expect(decoded.canvas.width * decoded.canvas.height).toBeLessThanOrEqual(MAX_DECODED_IMAGE_AREA);
    expect(decoded.canvas.width).toBeGreaterThan(0);
    expect(decoded.canvas.height).toBeGreaterThan(0);
    expect(Math.abs(decoded.canvas.width / decoded.canvas.height - 1)).toBeLessThan(0.01);
  });

  it("keeps a 30000×20000 source within the per-side AND area caps with aspect preserved", async () => {
    const { decodeImageFileSafe } = await import("../../utils/canvas");
    nextImageSize = [30000, 20000];

    const decoded = await decodeImageFileSafe(fakeFile("panorama.jpg"));

    expect(decoded.canvas.width).toBeLessThanOrEqual(20000);
    expect(decoded.canvas.height).toBeLessThanOrEqual(20000);
    expect(decoded.canvas.width * decoded.canvas.height).toBeLessThanOrEqual(MAX_DECODED_IMAGE_AREA);
    expect(Math.abs(decoded.canvas.width / decoded.canvas.height - 1.5)).toBeLessThan(0.01);
  });

  it("File → Decode → Document → Layer → Store produces a visible image layer", async () => {
    nextImageSize = [64, 48];
    const { decodeImageFileSafe } = await import("../../utils/canvas");
    const decoded = await decodeImageFileSafe(fakeFile("photo.png"));
    expect(decoded.canvas.width).toBe(64);

    await engine.importImageFile(fakeFile("photo.png"));

    const s = useEditorStore.getState();
    expect(s.doc?.width).toBe(64);
    expect(s.doc?.height).toBe(48);
    expect(s.doc?.layers.length).toBe(1);
    const layer = s.doc!.layers[0];
    expect(layer.type).toBe("image");
    expect(layer.visible).toBe(true);
    expect(layer.opacity).toBe(1);
    expect(layer.transform.width).toBe(64);
    expect(layer.transform.height).toBe(48);
    expect(pixelStore.has((layer as { imageId: string }).imageId)).toBe(true);
    expect(s.lastError).toBeNull();
  });

  it("composites the imported pixels (not empty / not black) into the document canvas", async () => {
    await engine.importImageFile(fakeFile("photo.png"));

    const comp = engine.getComposite();
    expect(comp).toBeTruthy();
    expect(comp!.width).toBe(64);
    expect(comp!.height).toBe(48);

    const p00 = pixel(comp as unknown as Drawable, 0, 0);
    const pMid = pixel(comp as unknown as Drawable, 32, 24);
    expect(p00[0]).toBe(255);
    expect(pMid[0]).toBe(255);
    expect(pMid[1]).toBe(32);

    // Count non-empty pixels: the imported bitmap covers the whole document.
    const data = (comp as unknown as Drawable).data;
    let painted = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i + 3] > 0) painted++;
    }
    expect(painted).toBe(data.length / 4);
  });

  it("first rendered frame draws the imported image onto the visible viewport (not a black canvas)", async () => {
    const { createCanvasEngine } = await import("../canvas/canvasEngine");
    const parent = { appendChild: vi.fn(), getBoundingClientRect: () => ({ width: 800, height: 600 }) };
    const canvasEngine = createCanvasEngine(parent as unknown as HTMLElement);
    runtime.canvas = canvasEngine;
    const main = created[0];

    await engine.importImageFile(fakeFile("photo.png"));

    flushRafUntilIdle();

    // Document sits centered in an 800×600 viewport (pad 48) at zoom ~10.5.
    const pMid = pixel(main, 400, 300);
    expect(pMid[0]).toBe(255);      // image red
    expect(pMid[1]).toBe(32);
    const pOutside = pixel(main, 700, 560);
    expect(pOutside[0]).not.toBe(255); // beyond the document: dark workspace, not image

    // The composite surface (document-sized) must have been drawn to screen.
    const compositeDraw = main.drawImageCalls.find((c) => c.dw > 0 && c.dh > 0);
    expect(compositeDraw).toBeTruthy();
    expect(compositeDraw!.dw).toBeCloseTo(672, -1);
    expect(compositeDraw!.dh).toBeCloseTo(504, -1);
  });

  it("import into an existing document renders, and Undo/Redo preserves the layers", async () => {
    await engine.createNewDocument({ width: 320, height: 200, background: "#ffffff", name: "Untitled" });
    expect(useEditorStore.getState().doc?.layers.length).toBe(1);

    await engine.importImageFile(fakeFile("photo.png"));

    const afterImport = useEditorStore.getState();
    expect(afterImport.doc?.width).toBe(320);
    expect(afterImport.doc?.height).toBe(200);
    expect(afterImport.lastError).toBeNull();
    const imported = afterImport.doc!.layers[afterImport.doc!.layers.length - 1];
    expect(imported.type).toBe("image");

    engine.undo();
    const afterUndo = useEditorStore.getState().doc!;
    expect(afterUndo.layers.length).toBe(1);
    expect(afterUndo.layers.find((l) => l.id === imported.id)).toBeUndefined();

    engine.redo();
    const afterRedo = useEditorStore.getState().doc!;
    expect(afterRedo.layers.length).toBe(2);
    expect(afterRedo.layers.some((l) => l.id === imported.id)).toBe(true);
  });

  it("rejects before silently blanking: corrupt file surfaces a clear error and no blank layer", async () => {
    class CorruptImage extends ImageStub {
      set src(_v: string) {
        setTimeout(() => this.onerror?.(), 0);
      }
    }
    (globalThis as Record<string, unknown>).Image = CorruptImage as never;

    await engine.importImageFile(fakeFile("broken.png"));

    const s = useEditorStore.getState();
    expect(s.lastError).toContain("Import failed");
    expect(s.doc).toBeNull();
    expect(s.busy).toBe(false);
  });
});