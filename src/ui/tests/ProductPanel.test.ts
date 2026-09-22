import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { ProductPanel } from "../panels/ProductPanel";
import { EditorEngine } from "../../editor/core/engine";
import { runtime } from "../../editor/core/runtime";
import { useEditorStore } from "../../state/store";
import { pixelStore, maskStore } from "../../editor/core/document";

/* Minimal software canvas so engine document creation / product import can run under node. */
class Sctx {
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  imageSmoothingEnabled = true;
  fillStyle = "#ffffff";
  strokeStyle = "#ffffff";
  filter = "none";
  constructor(private c: Sc) {}
  clearRect(x: number, y: number, w: number, h: number): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.c.width, Math.round(x + w));
    const y1 = Math.min(this.c.height, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * this.c.width + xx) * 4;
        this.c.data[i] = this.c.data[i + 1] = this.c.data[i + 2] = this.c.data[i + 3] = 0;
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
        if (sy < 0 || sx < 0 || sy >= this.c.height || sx >= this.c.width) continue;
        const si = (sy * this.c.width + sx) * 4;
        const di = (yy * w + xx) * 4;
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
  drawImage(src: Sc, sx: number, sy: number, sw: number, sh: number, dx: number, dy: number, dw: number, dh: number): void {
    for (let yy = 0; yy < Math.min(dh, this.c.height - dy); yy++) {
      const ty = Math.min(src.height - 1, Math.floor((yy / dh) * sh));
      const syy = sy + ty;
      if (syy < 0 || syy >= src.height) continue;
      for (let xx = 0; xx < Math.min(dw, this.c.width - dx); xx++) {
        const tx = Math.min(src.width - 1, Math.floor((xx / dw) * sw));
        const sxx = sx + tx;
        if (sxx < 0 || sxx >= src.width) continue;
        const si = (syy * src.width + sxx) * 4;
        const di = ((dy + yy) * this.c.width + (dx + xx)) * 4;
        if (this.globalCompositeOperation === "destination-in") {
          this.c.data[di + 3] = Math.round((this.c.data[di + 3] * src.data[si + 3]) / 255);
        } else {
          for (let k = 0; k < 4; k++) this.c.data[di + k] = src.data[si + k];
        }
      }
    }
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.c.width, Math.round(x + w));
    const y1 = Math.min(this.c.height, Math.round(y + h));
    const rgb = /^#?([0-9a-f]{6})$/i.exec(this.fillStyle.trim());
    const r = rgb ? parseInt(rgb[1]!.slice(0, 2), 16) : 0;
    const g = rgb ? parseInt(rgb[1]!.slice(2, 4), 16) : 0;
    const b = rgb ? parseInt(rgb[1]!.slice(4, 6), 16) : 0;
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * this.c.width + xx) * 4;
        this.c.data[i] = r;
        this.c.data[i + 1] = g;
        this.c.data[i + 2] = b;
        this.c.data[i + 3] = 255;
      }
    }
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
  get canvas(): Sc {
    return this.c;
  }
}

class Sc {
  _ctx: Sctx | null = null;
  data: Uint8ClampedArray;
  constructor(public width: number, public height: number) {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.data = new Uint8ClampedArray(this.width * this.height * 4);
  }
  getContext(): Sctx {
    if (!this._ctx) this._ctx = new Sctx(this);
    return this._ctx;
  }
  toDataURL(): string {
    return "data:image/png;base64,fake";
  }
}

vi.mock("../../utils/canvas", () => ({
  createCanvas: vi.fn((w: number, h: number) => new Sc(w, h)),
  getContext2d: vi.fn((c: Sc) => c.getContext()),
  decodeImageFileSafe: vi.fn(),
  imageFileToCanvas: vi.fn(),
  dataURLToCanvasAsync: vi.fn(),
  snapshotCanvas: vi.fn(() => null),
  restoreSnapshot: vi.fn(),
}));

vi.mock("../../editor/renderer/compositor", () => ({
  compositeToCanvas: vi.fn(() => null),
  renderLayerToCanvas: vi.fn(() => null),
}));

vi.mock("../../editor/project/projectStorage", async () => {
  const actual = await vi.importActual<typeof import("../../editor/project/projectStorage")>("../../editor/project/projectStorage");
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

function freshDoc(engine: EditorEngine, w = 1280, h = 800): Promise<void> {
  return engine.createNewDocument({ width: w, height: h, background: "#ffffff", name: "Shot" });
}

function productCanvas(w: number, h: number): Sc {
  const c = new Sc(w, h);
  const ctx = c.getContext();
  ctx.fillStyle = "#808080";
  ctx.fillRect(0, 0, w, h);
  return c;
}

const renderPanel = () => renderToString(createElement(ProductPanel));

describe("ProductPanel wired UI (render smoke)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    pixelStore.clear();
    maskStore.clear();
    runtime.engine = new EditorEngine();
    runtime.canvas = {
      fitToScreen: vi.fn(),
      resetCamera: vi.fn(),
      requestRender: vi.fn(),
      zoom100: vi.fn(),
      zoomAtVP: vi.fn(),
    } as unknown as typeof runtime.canvas;
    useEditorStore.setState({ doc: null, dirty: false, selectedIds: [], language: "en" });
  });

  afterEach(() => {
    useEditorStore.setState({ doc: null, dirty: false, selectedIds: [] });
  });

  it("renders the import control and no-doc hint when there is no document", async () => {
    const html = renderPanel();
    expect(html).toContain("Import Product");
    expect(html).toContain("Open or create a document");
  });

  it("mounts the full compositing UI for an imported product, without an AI provider", async () => {
    const engine = runtime.engine;
    await freshDoc(engine);
    const id = engine.importProductCanvas(productCanvas(120, 140) as unknown as HTMLCanvasElement, "Bronze Vase")!;
    expect(id).toBeTruthy();
    useEditorStore.getState().setSelected([id]);

    const html = renderPanel();

    expect(html).toContain("Bronze Vase");

    // Provider-required / AI-unavailable messaging must be visible when no provider exists.
    expect(html).toContain("AI provider unavailable");
    expect(html).toMatch(/PROVIDER REQUIRED|AI (provider )?unavailable|AI UNAVAILABLE/i);

    // Mask section (AI cutout disabled without AI, manual select still available)
    expect(html).toContain("Remove Background");
    expect(html).toContain("(manual)");
    expect(html).toMatch(/disabled/i);

    // Placement / transform
    expect(html).toContain("Placement");
    expect(html).toContain("Perspective");

    // Lighting
    expect(html).toContain("Lighting");
    expect(html).toContain("Exposure");
    expect(html).toContain("Brightness");

    // Color
    expect(html).toContain("Color");

    // Manual shadow
    expect(html).toContain("Contact Shadow");
    expect(html).toContain("Add Contact Shadow");

    // Reflection
    expect(html).toContain("Reflection");
    expect(html).toContain("Add Reflection");

    // Smart placement is local and must NOT be gated by AI
    expect(html).toContain("Smart Place");
  });

  it("shows the refine + bake controls once a mask exists", async () => {
    const engine = runtime.engine;
    await freshDoc(engine);
    const id = engine.importProductCanvas(productCanvas(40, 40) as unknown as HTMLCanvasElement, "Cap")!;
    const data = new Uint8Array(40 * 40).fill(255);
    engine.setProductMaskFromAiSelection(
      id,
      { kind: "raster-mask", bounds: { x: 0, y: 0, width: 40, height: 40 }, mask: { width: 40, height: 40, data, weight: 1 } },
      undefined
    );
    useEditorStore.getState().setSelected([id]);

    const html = renderPanel();
    expect(html).toContain("Refine");
    expect(html).toContain("Feather");
    expect(html).toContain("Bake Cutout");
  });
});