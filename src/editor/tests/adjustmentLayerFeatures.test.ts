import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EditorEngine } from "../core/engine";
import { runtime } from "../core/runtime";
import { useEditorStore } from "../../state/store";
import { EditorDocument } from "../core/document";
import { createBlankImageLayer, createTextLayer, createShapeLayer } from "../layers/layerFactory";
import { createCanvas, dataURLToCanvasAsync } from "../../utils/canvas";
import { buildProjectFile, stringifyProject, parseProjectText, buildDocumentFromProject } from "../project/projectFormat";
import type { Layer } from "../core/types";

function makeCanvasMock(w: number, h: number): HTMLCanvasElement {
  const c = createCanvas(w, h);
  (c.getContext("2d") as unknown as { clearRect: () => void }).clearRect = vi.fn();
  return c;
}

vi.mock("../../utils/canvas", () => {
  const makeCtx = () => ({
    drawImage: vi.fn(),
    putImageData: vi.fn(),
    getImageData: vi.fn(() => ({ width: 1, height: 1, data: new Uint8ClampedArray(4) })),
    clearRect: vi.fn(),
    setTransform: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    measureText: vi.fn(() => ({ width: 0 })),
    createImageData: vi.fn((w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })),
    filter: "none",
    globalAlpha: 1,
    globalCompositeOperation: "source-over",
    imageSmoothingEnabled: false,
    imageSmoothingQuality: "low",
  } as unknown as CanvasRenderingContext2D);
  const makeCanvas = (w: number, h: number) => ({
    width: Math.max(1, Math.round(w)),
    height: Math.max(1, Math.round(h)),
    toDataURL: () => "data:image/png;base64,AAAA",
    getContext: vi.fn(() => makeCtx()),
  } as unknown as HTMLCanvasElement);
  return {
    createCanvas: vi.fn((w: number, h: number) => makeCanvas(w, h)),
    getContext2d: vi.fn(() => makeCtx()),
    decodeImageFileSafe: vi.fn(),
    imageFileToCanvas: vi.fn(),
    dataURLToCanvasAsync: vi.fn(),
    snapshotCanvas: vi.fn(() => ({ kind: "data", imageData: { width: 1, height: 1, data: new Uint8ClampedArray(4) } })),
    restoreSnapshot: vi.fn(),
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
    element: vi.fn(),
    resize: vi.fn(),
    zoomTo: vi.fn(),
    docFromVP: vi.fn(),
    vpFromDoc: vi.fn(),
  }) as unknown as typeof runtime.canvas;

const W = 32;
const H = 32;

describe("adjustment layers: naming, amounts and params are undoable", () => {
  let engine: EditorEngine;

  beforeEach(async () => {
    engine = new EditorEngine();
    runtime.engine = engine;
    runtime.canvas = canvasEngineStub();
    await engine.createNewDocument({ width: W, height: H, background: "#ffffff", name: "M" });
  });

  afterEach(() => {
    runtime.canvas = null as unknown as typeof runtime.canvas;
    runtime.engine = null as unknown as EditorEngine;
  });

  it("adds every adjustment kind with its human label (levels/curves included)", () => {
    const id = engine.addAdjustmentLayer("brightness")!;
    const id2 = engine.addAdjustmentLayer("gradientMap")!;
    const id3 = engine.addAdjustmentLayer("levels")!;
    const d = engine.doc()!;
    expect(d.getLayer(id)!.name).toBe("Brightness");
    expect(d.getLayer(id2)!.name).toBe("Gradient Map");
    expect(d.getLayer(id3)!.name).toBe("Levels");
  });

  it("keeps a non-levels/curves layer from being mislabeled 'Curves'", () => {
    const id = engine.addAdjustmentLayer("colorLookup", { colorLookup: { lut: "sepia" } })!;
    const l = engine.doc()!.getLayer(id)!;
    expect(l.type).toBe("adjustment");
    expect((l as { adjustment: string }).adjustment).toBe("colorLookup");
    expect(l.name).toBe("Color Lookup");
  });

  it("stores the requested amount for amount-based adjustments", () => {
    const id = engine.addAdjustmentLayer("tint", null, undefined, 35)!;
    const l = engine.doc()!.getLayer(id)!;
    expect((l as { amount: number }).amount).toBe(35);
  });

  it("setAdjustmentAmount is undoable and redoable", () => {
    const id = engine.addAdjustmentLayer("brightness", null, undefined, 0)!;
    engine.setAdjustmentAmount(id, 70);
    expect((engine.doc()!.getLayer(id)! as { amount: number }).amount).toBe(70);
    engine.undo();
    expect((engine.doc()!.getLayer(id)! as { amount: number }).amount).toBe(0);
    engine.redo();
    expect((engine.doc()!.getLayer(id)! as { amount: number }).amount).toBe(70);
  });

  it("updateAdjustmentParams is undoable and redoable for the new ops", () => {
    const id = engine.addAdjustmentLayer("gradientMap")!;
    engine.updateAdjustmentParams(id, { gradientMap: { stops: [{ pos: 0, color: "#000000" }, { pos: 1, color: "#ff0000" }] } });
    const l = engine.doc()!.getLayer(id)! as { params: { gradientMap: { stops: { color: string }[] } } };
    expect(l.params.gradientMap.stops[1].color).toBe("#ff0000");
    engine.undo();
    expect((engine.doc()!.getLayer(id)! as { params: unknown }).params).toBeNull();
    engine.redo();
    const l2 = engine.doc()!.getLayer(id)! as { params: { gradientMap: { stops: { color: string }[] } } };
    expect(l2.params.gradientMap.stops[1].color).toBe("#ff0000");
  });
});

describe("save/load: new adjustment params, text stroke/shadow, paths and mask linkage survive round-trip", () => {
  let engine: EditorEngine;

  beforeEach(async () => {
    engine = new EditorEngine();
    runtime.engine = engine;
    runtime.canvas = canvasEngineStub();
    await engine.createNewDocument({ width: W, height: H, background: "#ffffff", name: "M" });
  });

  afterEach(() => {
    runtime.canvas = null as unknown as typeof runtime.canvas;
    runtime.engine = null as unknown as EditorEngine;
  });

  async function roundTrip() {
    const doc = engine.doc();
    const meta = engine.getActiveMeta();
    if (!doc || !meta) throw new Error("expected doc + meta");
    const text = stringifyProject(buildProjectFile(doc, meta, engine.activeLayerId(), {}));
    const parsed = parseProjectText(text);
    expect(parsed.error).toBeNull();
    vi.mocked(dataURLToCanvasAsync).mockResolvedValue(makeCanvasMock(W, H));
    return buildDocumentFromProject(parsed.file!);
  }

  it("new adjustment kinds keep their params and layout order", async () => {
    engine.addAdjustmentLayer("gradientMap", { gradientMap: { stops: [{ pos: 0, color: "#000000" }, { pos: 0.5, color: "#555555" }, { pos: 1, color: "#ffffff" }] } });
    engine.addAdjustmentLayer("colorLookup", { colorLookup: { lut: "sepia" } });
    engine.addAdjustmentLayer("tint", null, undefined, 42);

    const loaded = await roundTrip();
    const layers = loaded.doc.layers.filter((l) => l.type === "adjustment");
    expect(layers.map((l) => (l as { adjustment: string }).adjustment)).toEqual(["gradientMap", "colorLookup", "tint"]);
    const gm = layers[0]!;
    expect((gm.params as { gradientMap: { stops: { color: string }[] } }).gradientMap.stops.map((s) => s.color)).toEqual(["#000000", "#555555", "#ffffff"]);
    expect((layers[1]!.params as { colorLookup: { lut: string } }).colorLookup.lut).toBe("sepia");
    expect((layers[2]! as { amount: number }).amount).toBe(42);
  });

  it("a legacy levels adjustment still loads (backward compatibility)", async () => {
    engine.addAdjustmentLayer("levels", { levels: { black: 15, mid: 1.3, white: 230 } });
    const loaded = await roundTrip();
    const l = loaded.doc.layers.find((x) => x.type === "adjustment") as { adjustment: string; params: { levels: { black: number; mid: number; white: number } } };
    expect(l.adjustment).toBe("levels");
    expect(l.params.levels.black).toBe(15);
    expect(l.params.levels.mid).toBeCloseTo(1.3);
    expect(l.params.levels.white).toBe(230);
  });

  it("text layers keep stroke, strokeWidth and shadow", async () => {
    const tl = createTextLayer({ text: "مرحبا", x: 3, y: 4 });
    const bordered = { ...tl, stroke: "#ff0000", strokeWidth: 4, shadow: { offsetX: 3, offsetY: 2, blur: 5, color: "rgba(0,0,0,0.5)", opacity: 0.5 } };
    engine.addLayer(bordered, "Add text");

    const loaded = await roundTrip();
    const l = loaded.doc.layers.find((x) => x.type === "text") as { stroke: string | null; strokeWidth: number; shadow: { offsetX: number; offsetY: number; blur: number; color: string; opacity: number } | null };
    expect(l.stroke).toBe("#ff0000");
    expect(l.strokeWidth).toBe(4);
    expect(l.shadow?.color).toBe("rgba(0,0,0,0.5)");
    expect(l.shadow?.blur).toBe(5);
    expect(l.shadow?.offsetX).toBe(3);
  });

  it("path shape layers keep their anchor points and bezier data (the reload-to-rect bug is gone)", async () => {
    const shape = createShapeLayer("path");
    const path = {
      ...shape,
      pathPoints: [[10, 10], [30, 10], [30, 30], [10, 30], [10, 10]],
      pathData: [
        { x: 10, y: 10, inX: 0, inY: 0, outX: 5, outY: 0, smooth: false },
        { x: 30, y: 10, inX: 0, inY: 0, outX: 0, outY: 5, smooth: true },
        { x: 30, y: 30, inX: 0, inY: 0, outX: -5, outY: 0, smooth: true },
        { x: 10, y: 30, inX: 0, inY: 0, outX: 0, outY: -5, smooth: false },
      ],
    };
    engine.addLayer(path, "Add path");

    const loaded = await roundTrip();
    const l = loaded.doc.layers.find((x) => x.type === "shape") as { shape: string; pathPoints: number[][] | null; pathData: { x: number; y: number }[] | null };
    expect(l.shape).toBe("path");
    expect(l.pathPoints).toEqual([[10, 10], [30, 10], [30, 30], [10, 30], [10, 10]]);
    expect(l.pathData?.length).toBe(4);
    expect(l.pathData?.[1]?.x).toBe(30);
  });

  it("legacy path projects (pathPoints only) still load as path layers", async () => {
    const shape = createShapeLayer("path");
    const path = { ...shape, pathPoints: [[0, 0], [20, 0], [20, 20]] };
    engine.addLayer(path, "Add path");

    const loaded = await roundTrip();
    const l = loaded.doc.layers.find((x) => x.type === "shape") as { shape: string; pathPoints: number[][] | null };
    expect(l.shape).toBe("path");
    expect(l.pathPoints?.length).toBe(3);
  });

  it("mask linked flag survives and defaults to true for legacy refs", async () => {
    const img = createBlankImageLayer("I", W, H, "transparent");
    engine.addLayer(img, "Add image");
    engine.addMaskToLayer(img.id);

    const d = engine.doc()!;
    const l = d.getLayer(img.id)! as Layer & { mask: { id: string; enabled: boolean; linked: boolean } };
    expect(l.mask.linked).toBe(true);

    // Flip linkage on the live layer, then serialize.
    const flippedLayer = { ...l, mask: { ...l.mask, linked: false } } as Layer;
    useEditorStore.setState({ doc: new EditorDocument(W, H, d.layers.map((x) => (x.id === img.id ? flippedLayer : x))) });
    const loaded = await roundTrip();
    const reloaded = loaded.doc.layers.find((x) => x.id === img.id) as { id: string; mask: { id: string; enabled: boolean; linked: boolean } };
    expect(reloaded.mask.linked).toBe(false);
  });
});