import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EditorEngine } from "../core/engine";
import { runtime } from "../core/runtime";
import { useEditorStore } from "../../state/store";
import { pixelStore } from "../core/document";
import { createBlankImageLayer } from "../layers/layerFactory";
import { createCanvas, dataURLToCanvasAsync } from "../../utils/canvas";
import { buildProjectFile, stringifyProject, parseProjectText, buildDocumentFromProject } from "../project/projectFormat";
import { selectionEngine } from "../selection/selectionEngine";

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

function layerOpacity(id: string): number | undefined {
  return useEditorStore.getState().doc?.getLayer(id)?.opacity;
}

function historyLength(): number {
  return runtime.engine?.history.items().length ?? 0;
}

describe("layer meta edits push undo/redo history", () => {
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

  function addLayer(name: string): string {
    const l = createBlankImageLayer(name, W, H, "transparent");
    engine.addLayer(l, `Add ${name}`);
    return l.id;
  }

  it("coalesces a continuous opacity drag into a single undo entry", () => {
    const id = addLayer("A");
    const base = historyLength();
    engine.updateLayerMeta(id, { opacity: 0.9 });
    engine.updateLayerMeta(id, { opacity: 0.7 });
    engine.updateLayerMeta(id, { opacity: 0.5 });
    expect(historyLength()).toBe(base);
    engine.flushMetaEdit();
    expect(historyLength()).toBe(base + 1);
    expect(layerOpacity(id)).toBe(0.5);
    engine.undo();
    expect(layerOpacity(id)).toBe(1);
    engine.redo();
    expect(layerOpacity(id)).toBe(0.5);
  });

  it("commits a visibility toggle immediately and makes it undoable", () => {
    const id = addLayer("A");
    const base = historyLength();
    engine.updateLayerMeta(id, { visible: false });
    expect(historyLength()).toBe(base + 1);
    expect(useEditorStore.getState().doc?.getLayer(id)?.visible).toBe(false);
    engine.undo();
    expect(useEditorStore.getState().doc?.getLayer(id)?.visible).toBe(true);
    engine.redo();
    expect(useEditorStore.getState().doc?.getLayer(id)?.visible).toBe(false);
  });

  it("commits a lock toggle immediately and makes it undoable", () => {
    const id = addLayer("A");
    engine.updateLayerMeta(id, { locked: true });
    expect(useEditorStore.getState().doc?.getLayer(id)?.locked).toBe(true);
    engine.undo();
    expect(useEditorStore.getState().doc?.getLayer(id)?.locked).toBe(false);
  });

  it("commits a blend mode change immediately and makes it undoable", () => {
    const id = addLayer("A");
    engine.updateLayerMeta(id, { blendMode: "multiply" });
    expect(useEditorStore.getState().doc?.getLayer(id)?.blendMode).toBe("multiply");
    engine.undo();
    expect(useEditorStore.getState().doc?.getLayer(id)?.blendMode).toBe("normal");
    engine.redo();
    expect(useEditorStore.getState().doc?.getLayer(id)?.blendMode).toBe("multiply");
  });

  it("makes layer rename undoable", () => {
    const id = addLayer("A");
    engine.renameLayer(id, "Renamed");
    expect(useEditorStore.getState().doc?.getLayer(id)?.name).toBe("Renamed");
    engine.undo();
    expect(useEditorStore.getState().doc?.getLayer(id)?.name).toBe("A");
    engine.redo();
    expect(useEditorStore.getState().doc?.getLayer(id)?.name).toBe("Renamed");
  });

  it("flushes a pending opacity session before any other history push", () => {
    const id = addLayer("A");
    const base = historyLength();
    engine.updateLayerMeta(id, { opacity: 0.6 });
    engine.updateLayerMeta(id, { opacity: 0.4 });
    const id2 = addLayer("B");
    expect(historyLength()).toBe(base + 2);
    expect(layerOpacity(id)).toBe(0.4);
    engine.undo();
    expect(useEditorStore.getState().doc?.getLayer(id2)).toBeUndefined();
    engine.undo();
    expect(layerOpacity(id)).toBe(1);
  });

  it("records a stale (unchanged) update as no history entry", () => {
    const id = addLayer("A");
    engine.updateLayerMeta(id, { opacity: 0.5 });
    engine.flushMetaEdit();
    const base = historyLength();
    engine.updateLayerMeta(id, { opacity: 0.5 });
    engine.flushMetaEdit();
    expect(historyLength()).toBe(base);
  });

  it("coalesces transform edits into one undo entry", () => {
    const id = addLayer("A");
    const base = historyLength();
    const t0 = useEditorStore.getState().doc?.getLayer(id)?.transform!;
    engine.updateLayerMeta(id, { transform: { ...t0, x: 10, y: 5 } });
    engine.updateLayerMeta(id, { transform: { ...t0, x: 20, y: 5 } });
    engine.flushMetaEdit();
    expect(historyLength()).toBe(base + 1);
    const t = useEditorStore.getState().doc?.getLayer(id)?.transform;
    expect(t?.x).toBe(20);
    expect(t?.y).toBe(5);
    engine.undo();
    const t1 = useEditorStore.getState().doc?.getLayer(id)?.transform;
    expect(t1?.x).toBe(0);
    expect(t1?.y).toBe(0);
    engine.redo();
    const t2 = useEditorStore.getState().doc?.getLayer(id)?.transform;
    expect(t2?.x).toBe(20);
  });
});

describe("all five layer metadata properties share one focused undo/redo path", () => {
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

  function addLayer(name: string): string {
    const l = createBlankImageLayer(name, W, H, "transparent");
    engine.addLayer(l, `Add ${name}`);
    return l.id;
  }

  const meta = (id: string) => useEditorStore.getState().doc?.getLayer(id)!;

  it("undoes opacity→blend→visibility→lock→rename in reverse and redoes in forward order", () => {
    const id = addLayer("Base");
    const base = historyLength();
    engine.updateLayerMeta(id, { opacity: 0.5 });
    engine.flushMetaEdit();
    engine.updateLayerMeta(id, { blendMode: "multiply" });
    engine.updateLayerMeta(id, { visible: false });
    engine.updateLayerMeta(id, { locked: true });
    engine.renameLayer(id, "Main");
    expect(historyLength()).toBe(base + 5);
    expect(engine.history.items().slice(-5).map((i) => i.name)).toEqual([
      "Adjust Opacity",
      "Layer Blend Mode",
      "Toggle Visibility",
      "Toggle Lock",
      "Rename Layer",
    ]);
    engine.undo();
    expect(meta(id).name).toBe("Base");
    engine.undo();
    expect(meta(id).locked).toBe(false);
    engine.undo();
    expect(meta(id).visible).toBe(true);
    engine.undo();
    expect(meta(id).blendMode).toBe("normal");
    engine.undo();
    expect(meta(id).opacity).toBe(1);
    engine.redo();
    expect(meta(id).opacity).toBe(0.5);
    engine.redo();
    expect(meta(id).blendMode).toBe("multiply");
    engine.redo();
    expect(meta(id).visible).toBe(false);
    engine.redo();
    expect(meta(id).locked).toBe(true);
    engine.redo();
    expect(meta(id).name).toBe("Main");
  });

  it("never touches image pixels for metadata-only edits (undo/redo swap no planes)", () => {
    const id = addLayer("A");
    const l = useEditorStore.getState().doc?.getLayer(id);
    if (!l) throw new Error("layer");
    const lid = (l as unknown as { imageId: string }).imageId;
    const before = pixelStore.get(lid);
    engine.updateLayerMeta(id, { opacity: 0.3 });
    engine.updateLayerMeta(id, { locked: true });
    engine.undo();
    engine.redo();
    expect(pixelStore.get(lid)).toBe(before);
  });

  it("keeps a brush stroke and interleaved layer meta edits ordered and undoable", () => {
    const id = addLayer("A");
    const base = historyLength();
    engine.commitStroke(id, createCanvas(4, 4), { x: 2, y: 2, width: 4, height: 4 }, "paint", "Brush Stroke");
    engine.updateLayerMeta(id, { opacity: 0.5 });
    engine.flushMetaEdit();
    engine.updateLayerMeta(id, { visible: false });
    selectionEngine.setShape({ kind: "rect", x: 1, y: 1, width: 3, height: 3 });
    engine.renameLayer(id, "Main");
    engine.updateLayerMeta(id, { blendMode: "multiply" });
    engine.updateLayerMeta(id, { locked: true });
    expect(historyLength()).toBe(base + 6);
    expect(engine.history.items().slice(-6).map((i) => i.name)).toEqual([
      "Brush Stroke",
      "Adjust Opacity",
      "Toggle Visibility",
      "Rename Layer",
      "Layer Blend Mode",
      "Toggle Lock",
    ]);
    engine.undo();
    expect(meta(id).locked).toBe(false);
    engine.undo();
    expect(meta(id).blendMode).toBe("normal");
    engine.undo();
    expect(meta(id).name).toBe("A");
    engine.undo();
    expect(meta(id).visible).toBe(true);
    engine.undo();
    expect(meta(id).opacity).toBe(1);
    engine.undo();
    expect(engine.history.currentIndex()).toBe(0);
    engine.undo();
    expect(engine.canUndo()).toBe(false);
    engine.redo();
    expect(engine.canUndo()).toBe(true);
    engine.redo();
    engine.redo();
    expect(meta(id).opacity).toBe(0.5);
    engine.redo();
    expect(meta(id).visible).toBe(false);
    engine.redo();
    expect(meta(id).name).toBe("Main");
    engine.redo();
    expect(meta(id).blendMode).toBe("multiply");
    engine.redo();
    expect(meta(id).locked).toBe(true);
    expect(engine.canRedo()).toBe(false);
  });

  it("branching: undo then a new edit discards the redo tail", () => {
    const id = addLayer("A");
    engine.renameLayer(id, "X");
    engine.updateLayerMeta(id, { opacity: 0.5 });
    engine.flushMetaEdit();
    engine.updateLayerMeta(id, { visible: false });
    expect(engine.history.items().slice(-3).map((i) => i.name)).toEqual([
      "Rename Layer",
      "Adjust Opacity",
      "Toggle Visibility",
    ]);
    engine.undo();
    expect(meta(id).visible).toBe(true);
    engine.undo();
    expect(meta(id).opacity).toBe(1);
    engine.undo();
    expect(meta(id).name).toBe("A");
    expect(engine.canRedo()).toBe(true);
    engine.updateLayerMeta(id, { locked: true });
    expect(engine.canRedo()).toBe(false);
    expect(engine.history.items().slice(-2).map((i) => i.name)).toEqual(["Add A", "Toggle Lock"]);
    engine.undo();
    expect(meta(id).locked).toBe(false);
    engine.redo();
    expect(meta(id).locked).toBe(true);
  });

  it("persists opacity/blendMode/visibility/lock/rename through save and load", async () => {
    const id = addLayer("A");
    engine.updateLayerMeta(id, { opacity: 0.5 });
    engine.updateLayerMeta(id, { blendMode: "multiply" });
    engine.updateLayerMeta(id, { visible: false });
    engine.updateLayerMeta(id, { locked: true });
    engine.renameLayer(id, "Main");
    const doc = engine.doc();
    const meta0 = engine.getActiveMeta();
    if (!doc || !meta0) throw new Error("expected doc + meta");

    const text = stringifyProject(buildProjectFile(doc, meta0, engine.activeLayerId(), {}));
    const parsed = parseProjectText(text);
    expect(parsed.error).toBeNull();
    expect(parsed.file).not.toBeNull();

    vi.mocked(dataURLToCanvasAsync).mockResolvedValue({
      width: W,
      height: H,
      toDataURL: () => "data:image/png;base64,AAAA",
      getContext: () => null,
    } as unknown as HTMLCanvasElement);
    const loaded = await buildDocumentFromProject(parsed.file!);
    const l = loaded.doc.layers.find((x) => x.id === id);
    if (!l) throw new Error("layer not found after reload");
    expect(l.name).toBe("Main");
    expect(l.opacity).toBe(0.5);
    expect(l.blendMode).toBe("multiply");
    expect(l.visible).toBe(false);
    expect(l.locked).toBe(true);
  });
});