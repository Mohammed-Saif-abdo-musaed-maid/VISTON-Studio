import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EditorEngine } from "../core/engine";
import { runtime } from "../core/runtime";
import { useEditorStore } from "../../state/store";
import { pixelStore, maskStore } from "../core/document";
import { selectionEngine } from "../selection/selectionEngine";
import { getContext2d } from "../../utils/canvas";
import { COMMANDS, TOOL_SHORTCUTS, findCommand, shortcutTextFor, commandEnabled } from "../../app/commands";
import {
  compareFit,
  compareFitForMode,
  clampCompareCamera,
  zoomCompareCamera,
  panCompareCamera,
  docFromVP,
  vpFromDoc,
  effectiveMode,
  clampSplitPercent,
  clampOverlayOpacity,
  downscaleCanvas,
  drawCompareFrame,
  CompareMode,
  COMPARE_MIN_SBS_WIDTH,
  COMPARE_MAX_REF_DIM,
} from "../compare/compareModel";
import { en } from "../../i18n/en";
import { ar } from "../../i18n/ar";
import { t, getDirection } from "../../i18n";

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

  type CtxLike = Record<string, unknown> & {
    _store: { alpha: number; gco: string };
    _log: { translate: Array<[number, number]>; draw: number };
  };

  const makeCtx = (canvas: { _data: Uint8ClampedArray; width: number; height: number }): CanvasRenderingContext2D => {
    const alphaLog: number[] = [1];
    const translateLog: Array<[number, number]> = [];
    let drawCount = 0;
    const ctx: CtxLike = {
      _store: { alpha: 1, gco: "source-over" },
      _log: { translate: translateLog, draw: drawCount },
      fillStyle: "#000000",
      lineWidth: 1,
      filter: "none",
      get globalAlpha() {
        return alphaLog[alphaLog.length - 1];
      },
      set globalAlpha(v: number) {
        alphaLog.push(v);
      },
      get globalCompositeOperation() {
        return (ctx as unknown as { _store: { gco: string } })._store.gco;
      },
      set globalCompositeOperation(v: string) {
        (ctx as unknown as { _store: { gco: string } })._store.gco = v;
      },
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
      getImageData: (x: number, y: number, w: number, h: number) => {
        const img: ImageData = {
          width: w,
          height: h,
          data: new Uint8ClampedArray(canvas._data.slice(0, canvas.width * canvas.height * 4)),
          colorSpace: "srgb",
        } as ImageData;
        void x; void y;
        return img;
      },
      putImageData: (img: ImageData, dx: number, dy: number) => {
        void dx; void dy;
        for (let i = 0; i < img.data.length; i++) canvas._data[i] = img.data[i];
      },
      createImageData: (w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(Math.max(0, w) * Math.max(0, h) * 4),
      }),
      drawImage: (src: { width: number; height: number; _data?: Uint8ClampedArray }, dx = 0, dy = 0, dw?: number, dh?: number) => {
        drawCount++;
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
      clearRect: (x: number, y: number, w: number, h: number) => {
        for (let py = y; py < Math.min(canvas.height, y + h); py++)
          for (let px = x; px < Math.min(canvas.width, x + w); px++) {
            const i = (py * canvas.width + px) * 4;
            canvas._data[i] = 0; canvas._data[i + 1] = 0; canvas._data[i + 2] = 0; canvas._data[i + 3] = 0;
          }
      },
      fillRect: (x: number, y: number, w: number, h: number) => {
        const [r, g, b, a] = parseColor(ctx.fillStyle as string);
        for (let py = y; py < Math.min(canvas.height, y + h); py++)
          for (let px = x; px < Math.min(canvas.width, x + w); px++) {
            const i = (py * canvas.width + px) * 4;
            canvas._data[i] = r; canvas._data[i + 1] = g; canvas._data[i + 2] = b; canvas._data[i + 3] = a;
          }
      },
      translate: (tx: number, ty: number) => {
        translateLog.push([tx, ty]);
      },
      scale: vi.fn(),
      rotate: vi.fn(),
      setTransform: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    };
    return ctx as unknown as CanvasRenderingContext2D;
  };

  const makeCanvas = (w: number, h: number): HTMLCanvasElement & { _ctx?: CanvasRenderingContext2D; _data: Uint8ClampedArray } => {
    const bw = Math.max(1, Math.round(w));
    const bh = Math.max(1, Math.round(h));
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
    parseColor,
    makeCtx,
    makeCanvas,
    getCtx: (c: HTMLCanvasElement & { _ctx?: CanvasRenderingContext2D }) =>
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
  dataURLToCanvasAsync: vi.fn(),
  canvasToDataURL: vi.fn(() => "data:image/png;base64,AAAA"),
  snapshotCanvas: vi.fn((c: HTMLCanvasElement & { _ctx: CanvasRenderingContext2D }, rect: { x: number; y: number; width: number; height: number }) => ({
    kind: "data",
    imageData: c._ctx.getImageData(rect.x, rect.y, rect.width, rect.height),
  })),
  restoreSnapshot: vi.fn((c: HTMLCanvasElement & { _ctx: CanvasRenderingContext2D }, rect: { x: number; y: number; width: number; height: number }, snap: { imageData: ImageData }) => {
    c._ctx.putImageData(snap.imageData, rect.x, rect.y);
  }),
}));

vi.mock("../renderer/compositor", () => ({
  compositeToCanvas: vi.fn((doc: { width: number; height: number; layers: Array<{ type: string; imageId: string }> }, src: { pixels?: Map<string, HTMLCanvasElement> }) => {
    const c = h.makeCanvas(doc.width, doc.height);
    const ctx = h.getCtx(c);
    if (src && src.pixels) {
      for (const l of doc.layers) {
        if (l.type === "image" || l.type === "3d") {
          const px = src.pixels.get(l.imageId);
          if (px) ctx.drawImage(px, 0, 0);
        }
      }
    }
    return c;
  }),
  renderLayerToCanvas: vi.fn(() => null),
  hasGroupOrAdjustment: vi.fn(() => false),
}));

const canvasEngineStub = () =>
  ({
    fitToScreen: vi.fn(),
    resetCamera: vi.fn(),
    requestRender: vi.fn(),
    zoom100: vi.fn(),
    zoomAtVP: vi.fn(),
    element: vi.fn(),
    resize: vi.fn(),
    zoomTo: vi.fn(),
    docFromVP: vi.fn(),
    vpFromDoc: vi.fn(),
  }) as unknown as typeof runtime.canvas;

const W = 16;
const H = 16;

function fillPattern(canvas: HTMLCanvasElement): void {
  const ctx = getContext2d(canvas);
  const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4;
      img.data[i] = 128 + Math.round(100 * Math.sin(x * 0.9) * Math.sin(y * 0.8));
      img.data[i + 1] = 128 + Math.round(80 * Math.sin(x * 1.3 + y * 0.5));
      img.data[i + 2] = 128 + Math.round(70 * Math.cos(x * 0.4) * Math.cos(y * 1.1));
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
}

function readPixels(canvas: HTMLCanvasElement): Uint8ClampedArray {
  return getContext2d(canvas).getImageData(0, 0, canvas.width, canvas.height).data.slice();
}

interface FakeCtx {
  setTransform: ReturnType<typeof vi.fn>;
  clearRect: ReturnType<typeof vi.fn>;
  fillRect: ReturnType<typeof vi.fn>;
  fillStyle: string;
  globalAlpha: number;
  save: ReturnType<typeof vi.fn>;
  restore: ReturnType<typeof vi.fn>;
  beginPath: ReturnType<typeof vi.fn>;
  rect: ReturnType<typeof vi.fn>;
  clip: ReturnType<typeof vi.fn>;
  translate: ReturnType<typeof vi.fn>;
  scale: ReturnType<typeof vi.fn>;
  drawImage: ReturnType<typeof vi.fn>;
  imageSmoothingEnabled: boolean;
  imageSmoothingQuality: string;
}

function spyCtx(): FakeCtx {
  return {
    setTransform: vi.fn(),
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    fillStyle: "#000",
    globalAlpha: 1,
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    translate: vi.fn(),
    scale: vi.fn(),
    drawImage: vi.fn(),
    imageSmoothingEnabled: true,
    imageSmoothingQuality: "high",
  };
}

describe("Before/After: engine reference capture", () => {
  let engine: EditorEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime.engine = new EditorEngine();
    runtime.canvas = canvasEngineStub();
    engine = runtime.engine;
    pixelStore.clear();
    maskStore.clear();
  });

  afterEach(() => {
    useEditorStore.setState({ doc: null, dirty: false, language: "en" });
    selectionEngine.clear();
  });

  it("captures a Before reference when a document is opened", async () => {
    await engine.createNewDocument({ width: W, height: H, background: "#ffffff", name: "BA" });
    expect(engine.getBeforeRef()).not.toBeNull();
  });

  it("returns null when there is no active document", () => {
    expect(runtime.engine.getBeforeRef()).toBeNull();
  });

  it("Before stays fixed as the original opened state while After changes on edits", async () => {
    await engine.createNewDocument({ width: W, height: H, background: "#ffffff", name: "BA" });
    selectionEngine.resize(W, H);
    selectionEngine.clear();
    const layer = useEditorStore.getState().doc?.layers[0] as { imageId: string };
    const canvas = pixelStore.get(layer.imageId)!;
    fillPattern(canvas);

    const before1 = engine.getBeforeRef();
    expect(before1).not.toBeNull();
    const beforePixels = readPixels(before1!);
    const beforeRefObject = before1;

    await engine.effectApply("wienerFilter", { kernel: 3, noiseVarianceMode: 1, noiseVariance: 40 }, "Wiener Filter");
    await engine.effectApply("meanBlur", { kernel: 3 }, "Mean Blur");

    const before2 = engine.getBeforeRef();
    expect(before2).toBe(beforeRefObject);
    expect(readPixels(before1!)).toEqual(beforePixels);

    const after = engine.getComposite();
    expect(after).not.toBeNull();
    expect(readPixels(after!)).not.toEqual(beforePixels);
  });

  it("capturing/open/comparing does not create history entries", async () => {
    await engine.createNewDocument({ width: W, height: H, background: "#ffffff", name: "BA" });
    expect(useEditorStore.getState().historyItems.length).toBe(0);
    engine.getBeforeRef();
    engine.getComposite();
    expect(useEditorStore.getState().historyItems.length).toBe(0);
  });

  it("undo/redo after edits never mutates the Before reference", async () => {
    await engine.createNewDocument({ width: W, height: H, background: "#ffffff", name: "BA" });
    selectionEngine.resize(W, H);
    selectionEngine.clear();
    const layer = useEditorStore.getState().doc?.layers[0] as { imageId: string };
    const canvas = pixelStore.get(layer.imageId)!;
    fillPattern(canvas);
    const before = engine.getBeforeRef();
    const beforePixels = readPixels(before!);

    await engine.effectApply("wienerFilter", { kernel: 3, noiseVarianceMode: 1, noiseVariance: 40 }, "Wiener Filter");
    engine.undo();
    engine.redo();
    engine.undo();

    expect(readPixels(engine.getBeforeRef()!)).toEqual(beforePixels);
  });

  it("Before is tracked per document and follows document switching", async () => {
    await engine.createNewDocument({ width: W, height: H, background: "#ffffff", name: "A" });
    const keyA = engine.getRecords()[0]!.key;
    await engine.createNewDocument({ width: 20, height: 20, background: "#ffffff", name: "B" });

    const refB = engine.getBeforeRef();
    expect(refB!.width).toBe(20);
    expect(refB!.height).toBe(20);

    engine.switchToDocument(keyA);
    const refA = engine.getBeforeRef();
    expect(refA!.width).toBe(W);
    expect(refA).not.toBe(refB);

    expect(engine.getBeforeRefForKey(keyA)).toBe(refA);
    expect(engine.getBeforeRefForKey(engine.getRecords()[1]!.key)).toBe(refB);
  });

  it("closing a document removes its Before reference", async () => {
    await engine.createNewDocument({ width: W, height: H, background: "#ffffff", name: "A" });
    await engine.createNewDocument({ width: 20, height: 20, background: "#ffffff", name: "B" });
    const keyB = engine.getRecords()[1]!.key;
    await engine.closeDocument(keyB);
    expect(engine.getBeforeRefForKey(keyB)).toBeNull();
    expect(engine.getBeforeRef()).not.toBeNull();
  });

  it("lazily recaptures the reference if the initial capture failed", async () => {
    const comp = await import("../renderer/compositor");
    const mockComposite = comp.compositeToCanvas as ReturnType<typeof vi.fn>;
    const original = mockComposite.getMockImplementation() as unknown as (...args: unknown[]) => unknown;
    // Simulates async hydration: the composite is not ready while the document
    // still holds its blank white background, and becomes available later.
    mockComposite.mockImplementation((doc: { layers: Array<{ imageId: string }> }, src: { pixels?: Map<string, HTMLCanvasElement & { _data: Uint8ClampedArray }> }) => {
      for (const l of doc.layers) {
        const c = src?.pixels?.get(l.imageId);
        if (!c || !c._data) continue;
        for (let i = 0; i < c._data.length; i += 4) {
          if (c._data[i] !== 255 || c._data[i + 1] !== 255 || c._data[i + 2] !== 255 || c._data[i + 3] !== 255) {
            return original(doc, src) as HTMLCanvasElement;
          }
        }
      }
      return null;
    });

    await engine.createNewDocument({ width: W, height: H, background: "#ffffff", name: "BA" });
    expect(engine.getBeforeRef()).toBeNull();

    const layer = useEditorStore.getState().doc?.layers[0] as { imageId: string };
    const canvas = pixelStore.get(layer.imageId)!;
    fillPattern(canvas);

    expect(engine.getBeforeRef()).not.toBeNull();
    mockComposite.mockImplementation(original);
  });

  it("keeps original dimensions after a crop while After follows the new canvas", async () => {
    await engine.createNewDocument({ width: W, height: H, background: "#ffffff", name: "BA" });
    const before = engine.getBeforeRef();
    expect(before!.width).toBe(W);

    engine.applyCrop({ x: 0, y: 0, width: 8, height: 8 });
    const doc = useEditorStore.getState().doc;
    expect(doc!.width).toBe(8);
    expect(engine.getBeforeRef()!.width).toBe(W);
    expect(engine.getComposite()!.width).toBe(8);
  });

  it("layer operations do not alter the Before reference", async () => {
    await engine.createNewDocument({ width: W, height: H, background: "#ffffff", name: "BA" });
    const before = engine.getBeforeRef();
    const beforePixels = readPixels(before!);
    engine.flattenImage();
    expect(engine.getBeforeRef()).toBe(before);
    expect(readPixels(engine.getBeforeRef()!)).toEqual(beforePixels);
  });

  it("Before canvas identity is stable across repeated reads", async () => {
    await engine.createNewDocument({ width: W, height: H, background: "#ffffff", name: "BA" });
    expect(engine.getBeforeRef()).toBe(engine.getBeforeRef());
  });
});

describe("Before/After: cross-feature stability matrix", () => {
  let engine: EditorEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime.engine = new EditorEngine();
    runtime.canvas = canvasEngineStub();
    engine = runtime.engine;
    pixelStore.clear();
    maskStore.clear();
  });

  afterEach(() => {
    useEditorStore.setState({ doc: null, dirty: false, language: "en", compare: false });
    selectionEngine.clear();
  });

  async function openWithPattern(): Promise<void> {
    await engine.createNewDocument({ width: W, height: H, background: "#ffffff", name: "BA" });
    selectionEngine.resize(W, H);
    selectionEngine.clear();
    const layer = useEditorStore.getState().doc?.layers[0] as { imageId: string } | undefined;
    const canvas = layer ? pixelStore.get(layer.imageId) : null;
    if (canvas) fillPattern(canvas);
  }

  it("Before equals After for a freshly opened, unmodified document", async () => {
    await engine.createNewDocument({ width: W, height: H, background: "#ffffff", name: "BA" });
    const before = engine.getBeforeRef();
    const after = engine.getComposite();
    expect(before).not.toBeNull();
    expect(after).not.toBeNull();
    expect(readPixels(before!)).toEqual(readPixels(after!));
  });

  it("global adjustments keep the Before reference fixed", async () => {
    await openWithPattern();
    const before = engine.getBeforeRef();
    const beforePixels = readPixels(before!);
    await engine.adjustmentsApply({ brightness: 5, contrast: 6, gamma: 1.1, saturation: 12, exposure: 0.5, hue: 8, temperature: -10 });
    expect(engine.getBeforeRef()).toBe(before);
    expect(readPixels(engine.getBeforeRef()!)).toEqual(beforePixels);
    expect(readPixels(engine.getComposite()!)).not.toEqual(beforePixels);
  });

  it("exposure keeps the Before reference fixed", async () => {
    await openWithPattern();
    const before = engine.getBeforeRef();
    const beforePixels = readPixels(before!);
    await engine.effectApply("exposure", { amount: 1.5 }, "Exposure");
    expect(engine.getBeforeRef()).toBe(before);
    expect(readPixels(engine.getBeforeRef()!)).toEqual(beforePixels);
    expect(readPixels(engine.getComposite()!)).not.toEqual(beforePixels);
  });

  it("morphological operations keep the Before reference fixed", async () => {
    await openWithPattern();
    const before = engine.getBeforeRef();
    const beforePixels = readPixels(before!);
    await engine.effectApply(
      "morphoDilation",
      { shape: 0, size: 3, iterations: 1, borderMode: 0, borderValue: 0, threshold: 128, inputMode: 0 },
      "Morphology"
    );
    expect(engine.getBeforeRef()).toBe(before);
    expect(readPixels(engine.getBeforeRef()!)).toEqual(beforePixels);
  });

  it("mask painting keeps the Before reference fixed", async () => {
    await openWithPattern();
    const doc = useEditorStore.getState().doc;
    const layerId = doc?.layers[0]?.id;
    expect(layerId).toBeTruthy();
    engine.addMaskToLayer(layerId!);
    const before = engine.getBeforeRef();
    const beforePixels = readPixels(before!);
    engine.paintMaskDab(layerId!, 8, 8, 4, false);
    expect(engine.getBeforeRef()).toBe(before);
    expect(readPixels(engine.getBeforeRef()!)).toEqual(beforePixels);
  });

  it("toggling comparison never mutates the document, dirty flag, version or history", async () => {
    await openWithPattern();
    const doc = useEditorStore.getState().doc;
    const dirty = useEditorStore.getState().dirty;
    const version = engine.version;
    const historyCount = useEditorStore.getState().historyItems.length;
    const before = engine.getBeforeRef();

    useEditorStore.getState().setCompare(true);
    expect(engine.getBeforeRef()).toBe(before);
    expect(useEditorStore.getState().doc).toBe(doc);
    expect(useEditorStore.getState().dirty).toBe(dirty);
    expect(engine.version).toBe(version);
    expect(useEditorStore.getState().historyItems.length).toBe(historyCount);

    useEditorStore.getState().setCompare(false);
    expect(useEditorStore.getState().doc).toBe(doc);
    expect(useEditorStore.getState().dirty).toBe(dirty);
    expect(engine.version).toBe(version);
    expect(useEditorStore.getState().historyItems.length).toBe(historyCount);
  });
});

describe("Before/After: reference memory bound", () => {
  it("downscaleCanvas returns the same canvas when within bounds", () => {
    const fake = { width: 2048, height: 1024 } as HTMLCanvasElement;
    expect(downscaleCanvas(fake)).toBe(fake);
  });

  it("downscaleCanvas caps the longest side to maxDim", () => {
    const fake = { width: 8000, height: 4000 } as HTMLCanvasElement;
    const out = downscaleCanvas(fake);
    expect(Math.max(out.width, out.height)).toBe(COMPARE_MAX_REF_DIM);
    expect(out.width / out.height).toBeCloseTo(8000 / 4000, 3);
  });

  it("downscaleCanvas cannot exceed maxDim for a very tall image", () => {
    const fake = { width: 100, height: 20000 } as HTMLCanvasElement;
    const out = downscaleCanvas(fake);
    expect(out.height).toBe(COMPARE_MAX_REF_DIM);
    expect(out.width).toBeGreaterThan(0);
  });

  it("downscaleCanvas tolerates degenerate sizes", () => {
    const fake = { width: 0, height: 0 } as HTMLCanvasElement;
    expect(downscaleCanvas(fake)).toBe(fake);
  });
});

describe("Before/After: compare model math", () => {
  it("fit centers the document with padding and keeps aspect ratio", () => {
    const cam = compareFit(200, 100, 1000, 600);
    const expectedZoom = Math.min((1000 - 96) / 200, (600 - 96) / 100);
    expect(cam.zoom).toBeCloseTo(expectedZoom, 6);
    expect(cam.x).toBeCloseTo((1000 - 200 * expectedZoom) / 2, 6);
    expect(cam.y).toBeCloseTo((600 - 100 * expectedZoom) / 2, 6);
  });

  it("fit guards degenerate document/viewport sizes", () => {
    const cam = compareFit(0, 100, 500, 400);
    expect(cam.zoom).toBe(1);
    expect(compareFit(200, 100, 0, 0).zoom).toBe(1);
  });

  it("clamp keeps zoom within the allowed range", () => {
    const cam = clampCompareCamera({ x: 0, y: 0, zoom: 9999 }, 100, 100, 800, 600);
    expect(cam.zoom).toBeLessThanOrEqual(64);
    const cam2 = clampCompareCamera({ x: 0, y: 0, zoom: 0.0001 }, 100, 100, 800, 600);
    expect(cam2.zoom).toBeGreaterThanOrEqual(0.02);
  });

  it("zoom about a viewport point keeps that document point fixed", () => {
    const cam = { x: 100, y: 80, zoom: 2 };
    const vp = { x: 300, y: 240 };
    const docBefore = docFromVP(cam, vp.x, vp.y);
    const next = zoomCompareCamera(cam, 100, 100, 800, 600, vp.x, vp.y, 1.5);
    const docAfter = docFromVP(next, vp.x, vp.y);
    expect(next.zoom).toBeCloseTo(3, 6);
    expect(docAfter.x).toBeCloseTo(docBefore.x, 6);
    expect(docAfter.y).toBeCloseTo(docBefore.y, 6);
  });

  it("pan shifts the camera by the pointer delta", () => {
    const cam = { x: 100, y: 80, zoom: 1 };
    const next = panCompareCamera(cam, 25, -15, 1600, 1200, 800, 600);
    expect(next.x).toBe(125);
    expect(next.y).toBe(65);
  });

  it("docFromVP/vpFromDoc round trip", () => {
    const cam = { x: 12, y: 34, zoom: 3.5 };
    const doc = docFromVP(cam, 400, 300);
    const back = vpFromDoc(cam, doc.x, doc.y);
    expect(back.x).toBeCloseTo(400, 6);
    expect(back.y).toBeCloseTo(300, 6);
  });

  it("clamps slider values to 0..100", () => {
    expect(clampSplitPercent(-10)).toBe(0);
    expect(clampSplitPercent(150)).toBe(100);
    expect(clampOverlayOpacity(0)).toBe(0);
    expect(clampOverlayOpacity(100)).toBe(100);
  });
});

describe("Before/After: fit by mode", () => {
  it("fits side-by-side to half the viewport so each panel shows the full document", () => {
    const cam = compareFitForMode("sbs", 200, 100, 1000, 600);
    const expected = compareFit(200, 100, 500, 600);
    expect(cam.zoom).toBeCloseTo(expected.zoom, 6);
    expect(cam.x).toBeCloseTo(expected.x, 6);
  });

  it("fits split to the pane width so each pane shows the full document without cropping", () => {
    const splitCam = compareFitForMode("split", 200, 100, 1000, 600);
    const expected = compareFit(200, 100, 500, 600);
    expect(splitCam.zoom).toBeCloseTo(expected.zoom, 6);
    expect(splitCam.x).toBeCloseTo(expected.x, 6);
    expect(compareFitForMode("overlay", 200, 100, 1000, 600)).toEqual(compareFit(200, 100, 1000, 600));
  });

  it("fits split to the narrower pane regardless of divider skew", () => {
    const leftSkew = compareFitForMode("split", 200, 100, 1000, 600, 48, 30);
    expect(leftSkew.zoom).toBeCloseTo(compareFit(200, 100, 300, 600).zoom, 6);
    const rightSkew = compareFitForMode("split", 200, 100, 1000, 600, 48, 80);
    expect(rightSkew.zoom).toBeCloseTo(compareFit(200, 100, 200, 600).zoom, 6);
  });
});

describe("Before/After: mode resolution", () => {
  it("side-by-side falls back to split on a narrow viewport", () => {
    expect(effectiveMode("sbs", COMPARE_MIN_SBS_WIDTH - 1)).toBe("split");
    expect(effectiveMode("sbs", COMPARE_MIN_SBS_WIDTH)).toBe("sbs");
  });

  it("split and overlay never fall back", () => {
    expect(effectiveMode("split", 200)).toBe("split");
    expect(effectiveMode("overlay", 200)).toBe("overlay");
  });
});

describe("Before/After: frame drawing", () => {
  const cam = { x: 8, y: 8, zoom: 2 };
  const before = { width: 10, height: 10, _data: new Uint8ClampedArray(10 * 10 * 4).fill(0) } as HTMLCanvasElement & { _data: Uint8ClampedArray };
  const after = { width: 10, height: 10, _data: new Uint8ClampedArray(10 * 10 * 4).fill(255) } as HTMLCanvasElement & { _data: Uint8ClampedArray };
  const opts = (mode: CompareMode, split = 50, opacity = 50) => ({
    before,
    after,
    camera: cam,
    docW: 10,
    docH: 10,
    mode,
    splitValue: split,
    overlayOpacity: opacity,
    viewW: 800,
    viewH: 600,
  });

  it("split mode draws both images, clips each pane, and a divider that never crops", () => {
    const ctx = spyCtx();
    drawCompareFrame(ctx as unknown as CanvasRenderingContext2D, opts("split"));
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
    // outer viewport clip + left pane + right pane
    expect(ctx.clip).toHaveBeenCalledTimes(3);
    expect(Number((ctx.globalAlpha))).toBe(1);
  });

  it("split centers the full Before in the left pane and the full After in the right pane", () => {
    const ctx = spyCtx();
    drawCompareFrame(ctx as unknown as CanvasRenderingContext2D, opts("split"));
    const txs = (ctx.translate.mock.calls as Array<[number, number]>).filter((c) => c.length === 2);
    // Left pane anchored about the left half, right pane about the right half –
    // the same offsets side-by-side uses, so both documents are fully visible.
    expect(txs.some((c) => c[0] === cam.x && c[1] === cam.y)).toBe(true);
    expect(txs.some((c) => c[0] === cam.x + 400 && c[1] === cam.y)).toBe(true);
    expect(txs.every((c) => c[0] < cam.x + 800)).toBe(true);
  });

  it("split keeps each image inside its own pane when the divider is skewed", () => {
    const ctx = spyCtx();
    drawCompareFrame(ctx as unknown as CanvasRenderingContext2D, opts("split", 30));
    const txs = (ctx.translate.mock.calls as Array<[number, number]>).filter((c) => c.length === 2);
    const splitX = 240; // 30% of 800
    const fitW = 240; // min(30, 70)/100 * 800
    expect(txs.some((c) => c[0] === cam.x + (splitX - fitW) / 2)).toBe(true);
    expect(txs.some((c) => c[0] === cam.x + (800 + splitX - fitW) / 2)).toBe(true);
  });

  it("split at 0% clips the Before region to zero width", () => {
    const ctx = spyCtx();
    drawCompareFrame(ctx as unknown as CanvasRenderingContext2D, opts("split", 0));
    const calls = ctx.rect.mock.calls as Array<[number, number, number, number]>;
    expect(calls.some((c) => c[0] === 0 && c[2] === 0)).toBe(true);
  });

  it("overlay mode draws After then Before with reduced alpha", () => {
    const ctx = spyCtx();
    drawCompareFrame(ctx as unknown as CanvasRenderingContext2D, opts("overlay", 50, 40));
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
    expect(ctx.globalAlpha).toBeCloseTo(0.4, 6);
  });

  it("overlay alpha clamps on extremes", () => {
    const ctx0 = spyCtx();
    drawCompareFrame(ctx0 as unknown as CanvasRenderingContext2D, opts("overlay", 50, 0));
    expect(ctx0.globalAlpha).toBe(0);
    const ctx100 = spyCtx();
    drawCompareFrame(ctx100 as unknown as CanvasRenderingContext2D, opts("overlay", 50, 100));
    expect(ctx100.globalAlpha).toBe(1);
  });

  it("side-by-side draws Before in the left panel and After in the right panel", () => {
    const ctx = spyCtx();
    drawCompareFrame(ctx as unknown as CanvasRenderingContext2D, opts("sbs"));
    const txs = (ctx.translate.mock.calls as Array<[number, number]>).filter((c) => c.length === 2);
    expect(txs.some((c) => c[0] === cam.x)).toBe(true);
    expect(txs.some((c) => c[0] === cam.x + 400)).toBe(true);
    expect(txs.every((c) => c[0] !== cam.x - 400)).toBe(true);
  });

  it("scales a downscaled Before up to its original document dimensions", () => {
    const ctx = spyCtx();
    const downscaled = { width: 512, height: 512 } as HTMLCanvasElement;
    drawCompareFrame(ctx as unknown as CanvasRenderingContext2D, {
      ...opts("overlay"),
      before: downscaled,
      beforeW: 1024,
      beforeH: 1024,
    });
    const draws = (ctx.drawImage.mock.calls as Array<unknown[]>).filter((c) => c.length >= 5);
    expect(draws.some((c) => c[3] === 1024 && c[4] === 1024)).toBe(true);
  });

  it("scales the frame by dpr when provided", () => {
    const ctx = spyCtx();
    drawCompareFrame(ctx as unknown as CanvasRenderingContext2D, { ...opts("split"), dpr: 2 });
    expect(ctx.setTransform).toHaveBeenCalledWith(2, 0, 0, 2, 0, 0);
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
  });

  it("renders a full-size After alongside a missing Before in side-by-side", () => {
    const ctx = spyCtx();
    drawCompareFrame(ctx as unknown as CanvasRenderingContext2D, { ...opts("sbs"), before: null });
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
  });

  it("renders something even when Before is missing", () => {
    const ctx = spyCtx();
    drawCompareFrame(ctx as unknown as CanvasRenderingContext2D, { ...opts("split"), before: null });
    expect(ctx.drawImage).toHaveBeenCalledTimes(1);
  });

  it("uses effectiveMode during drawing (narrow sbs behaves as split)", () => {
    const ctx = spyCtx();
    drawCompareFrame(ctx as unknown as CanvasRenderingContext2D, { ...opts("sbs"), viewW: 300 });
    // narrow sbs routes through split: full Before + full After in two panes
    expect(ctx.drawImage).toHaveBeenCalledTimes(2);
  });
});

describe("Before/After: command, shortcut and i18n", () => {
  it("registers compare.toggle with a shortcut", () => {
    const cmd = findCommand("compare.toggle");
    expect(cmd).toBeTruthy();
    expect(shortcutTextFor("compare.toggle")).toBe("Ctrl+Alt+B");
    expect(cmd!.shortcut).toEqual({ key: "b", ctrl: true, alt: true });
  });

  it("compare.toggle is enabled only with a document and outside 3D workspace", async () => {
    runtime.engine = new EditorEngine();
    runtime.canvas = canvasEngineStub();
    useEditorStore.setState({ doc: null, view3d: false });
    expect(commandEnabled("compare.toggle")).toBe(false);
    await runtime.engine.createNewDocument({ width: 16, height: 16, background: "#ffffff", name: "A" });
    expect(commandEnabled("compare.toggle")).toBe(true);
    useEditorStore.setState({ view3d: true });
    expect(commandEnabled("compare.toggle")).toBe(false);
  });

  it("has no shortcut conflicts in the registry", () => {
    const all = [...COMMANDS, ...TOOL_SHORTCUTS].filter((c) => c.shortcut);
    const seen = new Set<string>();
    for (const c of all) {
      const s = c.shortcut!;
      const k = `${s.key}|${!!s.ctrl}|${!!s.shift}|${!!s.alt}`;
      expect(seen.has(k)).toBe(false);
      seen.add(k);
    }
  });

  it("adds English and Arabic translations for all compare strings", () => {
    const keys = [
      "beforeAfter", "beforeAfterToggle", "beforeAfterModeSbs", "beforeAfterModeSplit",
      "beforeAfterModeOverlay", "beforeAfterBefore", "beforeAfterAfter", "beforeAfterSplitValue",
      "beforeAfterOpacity", "beforeAfterFit", "beforeAfterClose", "beforeAfterNoDoc",
    ];
    for (const k of keys) {
      expect(typeof (en as Record<string, unknown>)[k]).toBe("string");
      expect(String((en as Record<string, unknown>)[k]).length).toBeGreaterThan(0);
      expect(typeof (ar as Record<string, unknown>)[k]).toBe("string");
      expect(String((ar as Record<string, unknown>)[k]).length).toBeGreaterThan(0);
    }
  });

  it("renders Arabic labels and RTL direction when language is ar", () => {
    useEditorStore.setState({ language: "ar" });
    expect(t("beforeAfter")).toBe(ar.beforeAfter);
    expect(t("beforeAfterModeSbs")).not.toBe(en.beforeAfterModeSbs);
    expect(getDirection()).toBe("rtl");
  });

  it("renders English labels and LTR direction by default", () => {
    useEditorStore.setState({ language: "en" });
    expect(t("beforeAfter")).toBe(en.beforeAfter);
    expect(getDirection()).toBe("ltr");
  });

  it("store compare flag toggles", () => {
    useEditorStore.setState({ compare: false });
    expect(useEditorStore.getState().compare).toBe(false);
    useEditorStore.getState().setCompare(true);
    expect(useEditorStore.getState().compare).toBe(true);
    useEditorStore.getState().setCompare(false);
    expect(useEditorStore.getState().compare).toBe(false);
  });
});