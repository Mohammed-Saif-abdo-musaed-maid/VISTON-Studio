import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EditorEngine } from "../core/engine";
import { runtime } from "../core/runtime";
import { useEditorStore } from "../../state/store";
import { pixelStore, maskStore } from "../core/document";
import { selectionEngine } from "../selection/selectionEngine";
import type { AISelection } from "../../ai/types";
import type { ImageLayer } from "../core/types";

/**
 * Software canvas backend so real pixel math (lighting pipeline, mask refine,
 * contact shadow, perspective warp) runs under node without a DOM.
 */
class SoftCtx {
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  imageSmoothingEnabled = true;
  imageSmoothingQuality = "low";
  fillStyle = "#000000";
  strokeStyle = "#000000";
  filter = "none";

  constructor(private c: SoftCanvas) {}

  get canvas(): SoftCanvas {
    return this.c;
  }

  clearRect(x: number, y: number, w: number, h: number): void {
    const data = this.c.data;
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.c.width, Math.round(x + w));
    const y1 = Math.min(this.c.height, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * this.c.width + xx) * 4;
        data[i] = data[i + 1] = data[i + 2] = data[i + 3] = 0;
      }
    }
  }

  createImageData(w: number, h: number): { width: number; height: number; data: Uint8ClampedArray } {
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  }

  getImageData(x: number, y: number, w: number, h: number): { width: number; height: number; data: Uint8ClampedArray } {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const out = new Uint8ClampedArray(w * h * 4);
    for (let yy = 0; yy < h; yy++) {
      const sy = y0 + yy;
      for (let xx = 0; xx < w; xx++) {
        const sx = x0 + xx;
        const di = (yy * w + xx) * 4;
        if (sx < 0 || sy < 0 || sx >= this.c.width || sy >= this.c.height) continue;
        const si = (sy * this.c.width + sx) * 4;
        for (let k = 0; k < 4; k++) out[di + k] = this.c.data[si + k];
      }
    }
    return { width: w, height: h, data: out };
  }

  putImageData(img: { width: number; height: number; data: Uint8ClampedArray }, x: number, y: number): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    for (let yy = 0; yy < img.height; yy++) {
      const sy = y0 + yy;
      if (sy < 0 || sy >= this.c.height) continue;
      for (let xx = 0; xx < img.width; xx++) {
        const sx = x0 + xx;
        if (sx < 0 || sx >= this.c.width) continue;
        const si = (yy * img.width + xx) * 4;
        const di = (sy * this.c.width + sx) * 4;
        for (let k = 0; k < 4; k++) this.c.data[di + k] = img.data[si + k];
      }
    }
  }

  private blobPixels(src: SoftCanvas, sx: number, sy: number, sw: number, sh: number): Uint8ClampedArray {
    const data = new Uint8ClampedArray(sw * sh * 4);
    for (let yy = 0; yy < sh; yy++) {
      const ssy = sy + yy;
      if (ssy < 0 || ssy >= src.height) continue;
      for (let xx = 0; xx < sw; xx++) {
        const ssx = sx + xx;
        if (ssx < 0 || ssx >= src.width) continue;
        const si = (ssy * src.width + ssx) * 4;
        const di = (yy * sw + xx) * 4;
        for (let k = 0; k < 4; k++) data[di + k] = src.data[si + k];
      }
    }
    return data;
  }

  drawImage(src: SoftCanvas, a: number, b: number, c?: number, d?: number, dx?: number, dy?: number, dw?: number, dh?: number): void {
    const sA = Math.ceil(this.globalAlpha * 255);
    if (typeof c !== "number" || typeof d !== "number" || dx === undefined || dy === undefined || dw === undefined || dh === undefined) {
      this.blit(src, src.data, 0, 0, src.width, src.height, Math.round(a), Math.round(b), Math.round(c ?? src.width), Math.round(d ?? src.height), sA);
      return;
    }
    this.blit(src, src.data, Math.round(a), Math.round(b), Math.round(c), Math.round(d), Math.round(dx), Math.round(dy), Math.round(dw ?? c), Math.round(dh ?? d), sA);
  }

  private blit(src: SoftCanvas, data: Uint8ClampedArray, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number, srcAlpha: number): void {
    const mode = this.globalCompositeOperation || "source-over";
    const whole = sw === dw && sh === dh && sw === src.width && sh === src.height;
    const srcFull = data.length === src.width * src.height * 4;
    const outW = Math.min(this.c.width, dw);
    const outH = Math.min(this.c.height, dh);
    for (let yy = 0; yy < outH; yy++) {
      const ty = sh <= 1 ? 0 : Math.min(sh - 1, Math.floor((yy / dh) * sh));
      const srcY = sy + ty;
      for (let xx = 0; xx < outW; xx++) {
        const tx = sw <= 1 ? 0 : Math.min(sw - 1, Math.floor((xx / dw) * sw));
        const srcX = sx + tx;
        const dstX = dx + xx;
        const dstY = dy + yy;
        if (srcY < 0 || srcX < 0 || srcY >= src.height || srcX >= src.width) continue;
        if (dstX < 0 || dstY < 0 || dstX >= this.c.width || dstY >= this.c.height) continue;
        const si = (srcY * src.width + srcX) * 4;
        const sA = Math.round((data[si + 3] * srcAlpha) / 255);
        const dA = this.c.data[(dstY * this.c.width + dstX) * 4 + 3];
        if (mode === "destination-in") {
          if (whole && srcFull) {
            const i = (dstY * this.c.width + dstX) * 4;
            this.c.data[i + 3] = Math.round((dA * sA) / 255);
          }
          continue;
        }
        if (mode === "destination-out") {
          const i = (dstY * this.c.width + dstX) * 4;
          this.c.data[i + 3] = Math.round((dA * (255 - sA)) / 255);
          continue;
        }
        // source-over (default): compositing
        const i = (dstY * this.c.width + dstX) * 4;
        const oA = sA + Math.round((dA * (255 - sA)) / 255);
        if (oA === 0) continue;
        for (let k = 0; k < 3; k++) {
          this.c.data[i + k] =
            Math.round((data[si + k] * sA + this.c.data[i + k] * dA * (255 - sA) / 255) / oA) as number;
        }
        this.c.data[i + 3] = oA;
      }
    }
  }

  fillRect(x: number, y: number, w: number, h: number): void {
    const rgb = this.parseColor(this.fillStyle);
    const sA = Math.ceil(this.globalAlpha * 255);
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.c.width, Math.round(x + w));
    const y1 = Math.min(this.c.height, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * this.c.width + xx) * 4;
        const dA = this.c.data[i + 3];
        const oA = sA + Math.round((dA * (255 - sA)) / 255);
        if (oA === 0) continue;
        for (let k = 0; k < 3; k++) {
          this.c.data[i + k] = Math.round((rgb[k] * sA + this.c.data[i + k] * dA * (255 - sA) / 255) / oA);
        }
        this.c.data[i + 3] = oA;
      }
    }
  }

  private parseColor(color: string): [number, number, number] {
    const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
    if (m) {
      const n = parseInt(m[1], 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    return [255, 255, 255];
  }

  beginPath(): void {}
  ellipse(): void {}
  fill(): void {}
  stroke(): void {}
  save(): void {}
  restore(): void {}
  translate(): void {}
  scale(): void {}
  rotate(): void {}
  setTransform(): void {}
}

class SoftCanvas {
  data: Uint8ClampedArray;
  _ctx: SoftCtx | null = null;
  constructor(public width: number, public height: number) {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.data = new Uint8ClampedArray(this.width * this.height * 4);
  }
  getContext(_kind?: string): SoftCtx {
    if (!this._ctx) this._ctx = new SoftCtx(this);
    return this._ctx;
  }
  getImageData(x: number, y: number, w: number, h: number) {
    return this.getContext().getImageData(x, y, w, h);
  }
  putImageData(img: { width: number; height: number; data: Uint8ClampedArray }) {
    this.getContext().putImageData(img, 0, 0);
  }
  toDataURL(): string {
    return "data:image/png;base64,fake";
  }
}

function makeCanvas(w: number, h: number, fill?: [number, number, number]): SoftCanvas {
  const c = new SoftCanvas(w, h);
  if (fill) {
    const ctx = c.getContext();
    ctx.fillStyle = `#${("0" + fill[0]!.toString(16)).slice(-2)}${("0" + fill[1]!.toString(16)).slice(-2)}${("0" + fill[2]!.toString(16)).slice(-2)}`;
    ctx.fillRect(0, 0, w, h);
  }
  return c;
}

vi.mock("../../utils/canvas", () => ({
  createCanvas: vi.fn((w: number, h: number) => new SoftCanvas(w, h)),
  getContext2d: vi.fn((c: SoftCanvas) => c.getContext()),
  decodeImageFileSafe: vi.fn(),
  imageFileToCanvas: vi.fn(),
  dataURLToCanvasAsync: vi.fn(),
  snapshotCanvas: vi.fn(() => ({ kind: "data", imageData: { width: 1, height: 1, data: new Uint8ClampedArray(4) } })),
  restoreSnapshot: vi.fn(),
}));

vi.mock("../renderer/compositor", () => ({
  compositeToCanvas: vi.fn(() => null),
  renderLayerToCanvas: vi.fn(() => null),
}));

vi.mock("../project/projectStorage", async () => {
  const actual = await vi.importActual<typeof import("../project/projectStorage")>("../project/projectStorage");
  return {
    ...actual,
    writeProjectText: vi.fn(),
    pickProjectFile: vi.fn(),
    getRecentProjects: vi.fn(() => []),
    addRecentProject: vi.fn(() => []),
    removeRecentProject: vi.fn(() => []),
    touchRecentProject: vi.fn(() => []),
  };
});

const canvasEngineStub = () =>
  ({
    fitToScreen: vi.fn(),
    resetCamera: vi.fn(),
    requestRender: vi.fn(),
    zoom100: vi.fn(),
    zoomAtVP: vi.fn(),
  }) as unknown as typeof runtime.canvas;

function freshEngine(): EditorEngine {
  return new EditorEngine();
}

async function freshDoc(engine: EditorEngine, width = 1280, height = 800): Promise<void> {
  await engine.createNewDocument({ width, height, background: "#ffffff", name: "Untitled" });
}

function prodCanvas(w: number, h: number): SoftCanvas {
  return makeCanvas(w, h, [128, 128, 128]);
}

function innerOpaqueMask(totalW: number, totalH: number, x0: number, y0: number, iw: number, ih: number): Uint8Array {
  const data = new Uint8Array(totalW * totalH);
  for (let y = y0; y < y0 + ih; y++) {
    for (let x = x0; x < x0 + iw; x++) {
      data[y * totalW + x] = 255;
    }
  }
  return data;
}

function px(canvas: HTMLCanvasElement, x: number, y: number): number[] {
  return Array.from((canvas as unknown as SoftCanvas).getImageData(x, y, 1, 1).data);
}

/** First pixel's alpha channel. */
function pxa(canvas: HTMLCanvasElement, x: number, y: number): number {
  return (canvas as unknown as SoftCanvas).getImageData(x, y, 1, 1).data[3]!;
}

describe("Product compositing", () => {
  let engine: EditorEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime.engine = freshEngine();
    runtime.canvas = canvasEngineStub();
    engine = runtime.engine;
    pixelStore.clear();
    maskStore.clear();
  });

  afterEach(() => {
    selectionEngine.resize(0, 0);
    useEditorStore.setState({ doc: null, dirty: false });
  });

  it("imports a product as an independent image layer with metadata + pristine source", async () => {
    await freshDoc(engine);
    const id = engine.importProductCanvas(prodCanvas(200, 150) as unknown as HTMLCanvasElement, "Shoe");
    expect(id).not.toBeNull();
    const s = useEditorStore.getState();
    const layer = s.doc?.getLayer(id!) as ImageLayer;
    expect(layer).toBeTruthy();
    expect(layer.type).toBe("image");
    expect(layer.product?.role).toBe("product");
    expect(layer.product?.sourceName).toBe("Shoe");
    expect(pixelStore.has(layer.imageId)).toBe(true);
    expect(layer.product?.sourceImageId).toBeTruthy();
    expect(pixelStore.has(layer.product!.sourceImageId!)).toBe(true);
    expect(engine.isProductLayer(id!)).toBe(true);
    expect(engine.productLayers().length).toBe(1);
    expect(layer.transform.y).toBeGreaterThan(0);
    expect(s.historyItems.some((h) => h.name === "Import Product")).toBe(true);
  });

  it("applies lighting destructively with undo/redo", async () => {
    await freshDoc(engine);
    const id = engine.importProductCanvas(prodCanvas(8, 8) as unknown as HTMLCanvasElement, "Can")!;
    const layer = useEditorStore.getState().doc?.getLayer(id) as ImageLayer;
    const before = px(pixelStore.get(layer.imageId)!, 4, 4);

    engine.applyProductLighting(id, { exposure: 0, brightness: 60, contrast: 0, temperature: 0, tint: 0, saturation: 0, highlights: 0, shadows: 0 });

    const after = px(pixelStore.get(layer.imageId)!, 4, 4);
    expect(after[3]).toBe(255);
    expect(after[0]).toBeGreaterThan(before[0]!);
    expect(after[1]).toBeGreaterThan(before[1]!);

    engine.undo();
    const restored = px(pixelStore.get(layer.imageId)!, 4, 4);
    expect(restored[0]).toBe(before[0]);
    expect(restored[1]).toBe(before[1]);

    engine.redo();
    const reapplied = px(pixelStore.get(layer.imageId)!, 4, 4);
    expect(reapplied[0]).toBe(after[0]);
  });

  it("reset product lighting restores the pristine import pixels", async () => {
    await freshDoc(engine);
    const id = engine.importProductCanvas(prodCanvas(8, 8) as unknown as HTMLCanvasElement, "Mug")!;
    const layer = useEditorStore.getState().doc?.getLayer(id) as ImageLayer;
    const pristine = px(pixelStore.get(layer.product!.sourceImageId!)!, 4, 4);

    engine.applyProductLighting(id, { exposure: 0, brightness: -70, contrast: 0, temperature: 0, tint: 0, saturation: 0, highlights: 0, shadows: 0 });
    engine.resetProductLighting(id);

    const after = px(pixelStore.get(layer.imageId)!, 4, 4);
    expect(after[0]).toBe(pristine[0]);
    expect(after[1]).toBe(pristine[1]);
  });

  it("applies an AI selection as an editable mask and undoes", async () => {
    await freshDoc(engine);
    const id = engine.importProductCanvas(prodCanvas(40, 40) as unknown as HTMLCanvasElement, "Bottle")!;
    const sel: AISelection = {
      kind: "raster-mask",
      bounds: { x: 0, y: 0, width: 40, height: 40 },
      mask: { width: 40, height: 40, data: new Uint8Array(1600).fill(255), weight: 1 },
    };
    engine.setProductMaskFromAiSelection(id, sel, undefined);
    let layer = useEditorStore.getState().doc?.getLayer(id) as ImageLayer;
    expect(layer.mask).toBeTruthy();
    expect(maskStore.has(layer.mask!.id)).toBe(true);
    expect(layer.product?.segmentOrigin).toBe("ai");

    engine.undo();
    layer = useEditorStore.getState().doc?.getLayer(id) as ImageLayer;
    expect(layer.mask).toBeNull();

    engine.redo();
    layer = useEditorStore.getState().doc?.getLayer(id) as ImageLayer;
    expect(layer.mask).toBeTruthy();
  });

  it("creates a mask from the editor selection (manual fallback)", async () => {
    await freshDoc(engine);
    const id = engine.importProductCanvas(prodCanvas(40, 40) as unknown as HTMLCanvasElement, "Cap")!;
    selectionEngine.resize(1280, 800);
    selectionEngine.setMask(new Uint8ClampedArray(1280 * 800).fill(1));

    engine.setProductMaskFromEditorSelection(id);
    const layer = useEditorStore.getState().doc?.getLayer(id) as ImageLayer;
    expect(layer.mask).toBeTruthy();
    expect(layer.product?.segmentOrigin).toBe("manual");
  });

  it("refines the mask canvas with feather and undoes", async () => {
    await freshDoc(engine);
    const id = engine.importProductCanvas(prodCanvas(40, 40) as unknown as HTMLCanvasElement, "Pill")!;
    const sel: AISelection = {
      kind: "raster-mask",
      bounds: { x: 0, y: 0, width: 40, height: 40 },
      mask: { width: 40, height: 40, data: innerOpaqueMask(40, 40, 10, 10, 20, 20), weight: 1 },
    };
    engine.setProductMaskFromAiSelection(id, sel, undefined);
    const layer = useEditorStore.getState().doc?.getLayer(id) as ImageLayer;
    const beforeValue = pxa(maskStore.get(layer.mask!.id)!, 10, 10);

    engine.refineProductMask(id, { feather: 3, smooth: 0, spread: 0 });
    const afterValue = pxa(maskStore.get(layer.mask!.id)!, 10, 10);
    expect(beforeValue).toBe(255);
    expect(afterValue).toBeLessThan(255);

    engine.undo();
    const restoredValue = pxa(maskStore.get(layer.mask!.id)!, 10, 10);
    expect(restoredValue).toBe(255);
  });

  it("adds a contact shadow layer beneath the product and syncs it", async () => {
    await freshDoc(engine);
    const id = engine.importProductCanvas(prodCanvas(40, 40) as unknown as HTMLCanvasElement, "Box")!;
    const doc = useEditorStore.getState().doc!;
    const prodIdx = doc.layerIndex(id);

    const shadowId = engine.addContactShadow(id, { opacity: 0.5, blur: 6, distance: 20, angle: 90, spread: 0, tinted: 0.1 });
    expect(shadowId).not.toBeNull();

    let doc2 = useEditorStore.getState().doc!;
    const shadowIdx = doc2.layerIndex(shadowId!);
    expect(shadowIdx).toBe(prodIdx);
    const shadow = doc2.getLayer(shadowId!) as ImageLayer;
    expect(shadow.shadow?.mode).toBe("shadow");
    expect(shadow.shadow?.productLayerId).toBe(id);
    expect(pixelStore.has(shadow.imageId)).toBe(true);

    engine.updateContactShadow(shadowId!, { distance: 40 });
    doc2 = useEditorStore.getState().doc!;
    const shadow2 = doc2.getLayer(shadowId!) as ImageLayer;
    expect(shadow2.shadow?.distance).toBe(40);
    const canvas2 = pixelStore.get(shadow2.imageId);
    expect(canvas2).toBeTruthy();

    engine.undo();
    doc2 = useEditorStore.getState().doc!;
    expect((doc2.getLayer(shadowId!) as ImageLayer).shadow?.distance).toBe(20);
  });

  it("auto-place and manual placement are undoable transforms", async () => {
    await freshDoc(engine);
    const id = engine.importProductCanvas(prodCanvas(40, 40) as unknown as HTMLCanvasElement, "Vase")!;
    engine.autoPlaceProduct(id, { x: 100, y: 300, width: 120, height: 160, rotation: 15 }, { ai: false, operation: null, provider: "local" });

    let layer = useEditorStore.getState().doc?.getLayer(id) as ImageLayer;
    expect(layer.transform.x).toBe(100);
    expect(layer.transform.rotation).toBe(15);

    engine.undo();
    layer = useEditorStore.getState().doc?.getLayer(id) as ImageLayer;
    expect(layer.transform.rotation).toBe(0);
  });

  it("bakes the cutout into product pixels (mask removed) with undo", async () => {
    await freshDoc(engine);
    const id = engine.importProductCanvas(prodCanvas(8, 8) as unknown as HTMLCanvasElement, "Cap")!;
    const halfMask = new Uint8Array(8 * 8);
    for (let y = 0; y < 8; y++) for (let x = 4; x < 8; x++) halfMask[y * 8 + x] = 255;
    const sel: AISelection = {
      kind: "raster-mask",
      bounds: { x: 0, y: 0, width: 8, height: 8 },
      mask: { width: 8, height: 8, data: halfMask, weight: 1 },
    };
    engine.setProductMaskFromAiSelection(id, sel, undefined);
    const beforeLayer = useEditorStore.getState().doc?.getLayer(id) as ImageLayer;
    expect(beforeLayer.mask).toBeTruthy();

    engine.burnProductCutoutToPixels(id);
    const layer = useEditorStore.getState().doc?.getLayer(id) as ImageLayer;
    expect(layer.mask).toBeNull();
    expect(layer.product?.sourceImageId).toBeNull();
    const pixels = pixelStore.get(layer.imageId)!;
    expect(pxa(pixels, 0, 0)).toBe(0);
    expect(pxa(pixels, 7, 0)).toBe(255);

    engine.undo();
    const restored = useEditorStore.getState().doc?.getLayer(id) as ImageLayer;
    expect(restored.mask).toBeTruthy();
    expect(restored.product?.sourceImageId).toBeTruthy();
    const restoredPixels = pixelStore.get(restored.imageId)!;
    expect(pxa(restoredPixels, 0, 0)).toBe(255);
  });
});