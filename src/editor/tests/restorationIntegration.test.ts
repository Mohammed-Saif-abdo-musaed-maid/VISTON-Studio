import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EditorEngine } from "../core/engine";
import { runtime } from "../core/runtime";
import { useEditorStore } from "../../state/store";
import { pixelStore, maskStore } from "../core/document";
import { selectionEngine } from "../selection/selectionEngine";
import { getContext2d } from "../../utils/canvas";
import { ProcessOp, ProcessParams } from "../processing/processor";
import { COMMANDS } from "../../app/commands";

vi.mock("../../utils/canvas", () => {
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

  interface MockImageData {
    width: number;
    height: number;
    data: Uint8ClampedArray;
  }
  interface MockCtx {
    fillStyle: string;
    globalAlpha: number;
    globalCompositeOperation: string;
    imageSmoothingEnabled: boolean;
    imageSmoothingQuality: string;
    filter: string;
    getImageData: (x: number, y: number, w: number, h: number) => MockImageData;
    putImageData: (img: MockImageData, dx: number, dy: number) => void;
    createImageData: (w: number, h: number) => MockImageData;
    drawImage: ReturnType<typeof vi.fn>;
    clearRect: (x: number, y: number, w: number, h: number) => void;
    fillRect: (x: number, y: number, w: number, h: number) => void;
    translate: ReturnType<typeof vi.fn>;
    scale: ReturnType<typeof vi.fn>;
    rotate: ReturnType<typeof vi.fn>;
    setTransform: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    restore: ReturnType<typeof vi.fn>;
  }

  const makeCtx = (canvas: { _data: Uint8ClampedArray; width: number; height: number }): CanvasRenderingContext2D => {
    const ctx: MockCtx = {
      fillStyle: "#000000",
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
      filter: "none",
      getImageData: (x: number, y: number, w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(canvas._data),
      }),
      putImageData: (img: MockImageData) => {
        for (let i = 0; i < img.data.length; i++) canvas._data[i] = img.data[i];
      },
      createImageData: (w: number, h: number) => ({
        width: w,
        height: h,
        data: new Uint8ClampedArray(w * h * 4),
      }),
      drawImage: vi.fn(),
      clearRect: (x: number, y: number, w: number, h: number) => {
        for (let py = y; py < Math.min(canvas.height, y + h); py++)
          for (let px = x; px < Math.min(canvas.width, x + w); px++) {
            const i = (py * canvas.width + px) * 4;
            canvas._data[i] = 0; canvas._data[i + 1] = 0; canvas._data[i + 2] = 0; canvas._data[i + 3] = 0;
          }
      },
      fillRect: (x: number, y: number, w: number, h: number) => {
        const [r, g, b, a] = parseColor(ctx.fillStyle);
        for (let py = y; py < Math.min(canvas.height, y + h); py++)
          for (let px = x; px < Math.min(canvas.width, x + w); px++) {
            const i = (py * canvas.width + px) * 4;
            canvas._data[i] = r; canvas._data[i + 1] = g; canvas._data[i + 2] = b; canvas._data[i + 3] = a;
          }
      },
      translate: vi.fn(),
      scale: vi.fn(),
      rotate: vi.fn(),
      setTransform: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
    };
    return ctx as unknown as CanvasRenderingContext2D;
  };

  const makeCanvas = (w: number, h: number): HTMLCanvasElement => {
    const bw = Math.max(1, Math.round(w));
    const bh = Math.max(1, Math.round(h));
    const c = {
      width: bw,
      height: bh,
      _data: new Uint8ClampedArray(bw * bh * 4),
      toDataURL: () => "data:image/png;base64,AAAA",
    } as unknown as HTMLCanvasElement & { _ctx: CanvasRenderingContext2D; _data: Uint8ClampedArray };
    (c as unknown as HTMLCanvasElement & { _ctx: CanvasRenderingContext2D })._ctx =
      makeCtx({ _data: c._data, width: c.width, height: c.height });
    (c as unknown as { getContext: (kind: string) => CanvasRenderingContext2D }).getContext =
      () => (c as unknown as HTMLCanvasElement & { _ctx: CanvasRenderingContext2D })._ctx;
    return c;
  };

  return {
    createCanvas: vi.fn((w: number, h: number) => makeCanvas(w, h)),
    getContext2d: vi.fn((c: HTMLCanvasElement & { _ctx?: CanvasRenderingContext2D }) =>
      c._ctx ?? ((c as HTMLCanvasElement).getContext("2d") as CanvasRenderingContext2D)),
    decodeImageFileSafe: vi.fn(),
    imageFileToCanvas: vi.fn(),
    dataURLToCanvasAsync: vi.fn(),
    snapshotCanvas: vi.fn((c: HTMLCanvasElement & { _ctx: CanvasRenderingContext2D }, rect: { x: number; y: number; width: number; height: number }) => ({
      kind: "data",
      imageData: c._ctx.getImageData(rect.x, rect.y, rect.width, rect.height),
    })),
    restoreSnapshot: vi.fn((c: HTMLCanvasElement & { _ctx: CanvasRenderingContext2D }, rect: { x: number; y: number; width: number; height: number }, snap: { imageData: ImageData }) => {
      c._ctx.putImageData(snap.imageData, rect.x, rect.y);
    }),
  };
});

vi.mock("../renderer/compositor", () => ({
  compositeToCanvas: vi.fn(() => null),
  renderLayerToCanvas: vi.fn(() => null),
}));

const canvasEngineStub = () =>
  ({
    fitToScreen: vi.fn(),
    resetCamera: vi.fn(),
    requestRender: vi.fn(),
    zoom100: vi.fn(),
    zoomAtVP: vi.fn(),
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
  return getContext2d(canvas).getImageData(0, 0, canvas.width, canvas.height).data;
}

async function freshDoc(engine: EditorEngine): Promise<string> {
  await engine.createNewDocument({ width: W, height: H, background: "#ffffff", name: "Restoration Test" });
  const layer = useEditorStore.getState().doc?.layers[0] as { id: string; imageId: string; type: string };
  if (!layer || layer.type !== "image") throw new Error("expected image background layer");
  const canvas = pixelStore.get(layer.imageId);
  if (!canvas) throw new Error("missing pixel canvas");
  fillPattern(canvas);
  selectionEngine.resize(W, H);
  selectionEngine.clear();
  return layer.id;
}

describe("restoration filter engine integration", () => {
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
    useEditorStore.setState({ doc: null, dirty: false });
    selectionEngine.clear();
  });

  it("effectApply runs the real arithmetic mean on the layer pixels", async () => {
    await freshDoc(engine);
    const layer = useEditorStore.getState().doc?.layers[0] as { imageId: string };
    const canvas = pixelStore.get(layer.imageId)!;
    const before = readPixels(canvas);

    await engine.effectApply("arithmeticMean", { kernel: 3 }, "Arithmetic Mean");

    const after = readPixels(canvas);
    // Interior pixel (5,5) must equal the 3×3 neighbourhood average (± rounding).
    let sum = 0;
    for (let dy = -1; dy <= 1; dy++)
      for (let dx = -1; dx <= 1; dx++) {
        sum += before[((5 + dy) * W + (5 + dx)) * 4];
      }
    const expected = Math.round(sum / 9);
    expect(Math.abs(after[(5 * W + 5) * 4] - expected)).toBeLessThanOrEqual(1);
    // The non-linear pattern means blur genuinely changes samples.
    expect(after).not.toEqual(before);
    // KeepAlpha: alpha stays 255.
    expect(after[3]).toBe(255);
  });

  it("undo restores the exact original pixels and redo reapplies the filter", async () => {
    await freshDoc(engine);
    const layer = useEditorStore.getState().doc?.layers[0] as { imageId: string };
    const canvas = pixelStore.get(layer.imageId)!;
    const before = readPixels(canvas);

    await engine.effectApply("wienerFilter", { kernel: 3, noiseVarianceMode: 1, noiseVariance: 40 }, "Wiener Filter");

    const filtered = readPixels(canvas);
    expect(filtered).not.toEqual(before);

    engine.undo();
    expect(readPixels(canvas)).toEqual(before);

    engine.redo();
    expect(readPixels(canvas)).toEqual(filtered);
  });

  it("the filter respects the current selection (outside = untouched)", async () => {
    await freshDoc(engine);
    const mask = new Uint8ClampedArray(W * H);
    for (let y = 0; y < H; y++)
      for (let x = 0; x < W; x++) mask[y * W + x] = x < 8 ? 1 : 0;
    selectionEngine.setMask(mask);

    const layer = useEditorStore.getState().doc?.layers[0] as { imageId: string };
    const canvas = pixelStore.get(layer.imageId)!;
    const before = readPixels(canvas);

    await engine.effectApply("geometricMean", { kernel: 3 }, "Geometric Mean");

    const after = readPixels(canvas);
    for (let y = 0; y < H; y++) {
      for (let x = 8; x < W; x++) {
        const i = (y * W + x) * 4;
        expect(after[i]).toBe(before[i]);
        expect(after[i + 1]).toBe(before[i + 1]);
        expect(after[i + 2]).toBe(before[i + 2]);
      }
    }
    let changed = false;
    for (let i = 0; i < 8 * H * 4 && !changed; i++) changed = after[i] !== before[i];
    expect(changed).toBe(true);
  });

  it("the filter respects the layer mask (masked-off area = untouched)", async () => {
    const id = await freshDoc(engine);
    const layer = useEditorStore.getState().doc?.getLayer(id) as { imageId: string };
    const canvas = pixelStore.get(layer.imageId)!;
    const before = readPixels(canvas);

    engine.addMaskToLayer(id);
    const l2 = useEditorStore.getState().doc?.getLayer(id) as { mask?: { id: string } | null };
    const maskCanvas = maskStore.get(l2!.mask!.id)!;
    const mctx = getContext2d(maskCanvas);
    const mimg = mctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
    for (let y = 0; y < maskCanvas.height; y++)
      for (let x = 0; x < maskCanvas.width; x++) mimg.data[(y * maskCanvas.width + x) * 4 + 3] = x < 8 ? 0 : 255;
    mctx.putImageData(mimg, 0, 0);

    await engine.effectApply("alphaTrimmedMean", { kernel: 3, trim: 2 }, "Alpha-Trimmed Mean");

    const after = readPixels(canvas);
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < 8; x++) {
        const i = (y * W + x) * 4;
        expect(after[i]).toBe(before[i]);
        expect(after[i + 1]).toBe(before[i + 1]);
        expect(after[i + 2]).toBe(before[i + 2]);
      }
    }
    // The exposed half actually changed.
    expect(after).not.toEqual(before);
  });

  it("all six restoration ops apply end-to-end and undo in a single step", async () => {
    const cases: Array<{ op: ProcessOp; params: ProcessParams }> = [
      { op: "noiseGeneration", params: { noiseType: 0, amount: 30, variance: 25, seed: 0 } },
      { op: "arithmeticMean", params: { kernel: 3 } },
      { op: "geometricMean", params: { kernel: 3 } },
      { op: "contraHarmonicMean", params: { kernel: 3, q: 1 } },
      { op: "alphaTrimmedMean", params: { kernel: 3, trim: 2 } },
      { op: "wienerFilter", params: { kernel: 3, noiseVarianceMode: 1, noiseVariance: 40 } },
    ];
    for (const { op, params } of cases) {
      await freshDoc(engine);
      const layer = useEditorStore.getState().doc?.layers[0] as { imageId: string };
      const canvas = pixelStore.get(layer.imageId)!;
      const before = readPixels(canvas);

      await engine.effectApply(op, params, "Restoration op");

      const after = readPixels(canvas);
      expect(after).not.toEqual(before);

      engine.undo();
      expect(readPixels(canvas)).toEqual(before);
    }
  });

  it("every restoration op is registered in the command palette", () => {
    const ids = COMMANDS.map((c) => c.id);
    for (const id of ["gaussianNoise", "uniformNoise", "saltPepperNoise", "arithmeticMean", "geometricMean", "contraHarmonicMean", "alphaTrimmedMean", "wienerFilter"]) {
      expect(ids).toContain(id);
    }
  });

  it("FilterDialog spec entries exist for every restoration op", async () => {
    const { specs } = await import("../processing/filterSpecs");
    for (const op of ["noiseGeneration", "arithmeticMean", "geometricMean", "contraHarmonicMean", "alphaTrimmedMean", "wienerFilter"] as const) {
      expect(specs[op]).toBeDefined();
      for (const p of specs[op].params) expect(p.key.length).toBeGreaterThan(0);
    }
  });
});