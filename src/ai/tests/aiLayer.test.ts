import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EditorEngine } from "../../editor/core/engine";
import { runtime } from "../../editor/core/runtime";
import { useEditorStore } from "../../state/store";
import { pixelStore } from "../../editor/core/document";
import { createCanvas } from "../../utils/canvas";
import { createAiResultLayer } from "../../editor/layers/layerFactory";
import { buildProjectFile, stringifyProject, parseProjectText, buildDocumentFromProject } from "../../editor/project/projectFormat";
import { insertAiResultAsLayer } from "../history/AIHistoryAdapter";
import type { AIResult } from "../types";

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
    createImageData: vi.fn((w: number, h: number) => ({ width: w, height: h, data: new Uint8ClampedArray(w * h * 4) })),
    measureText: vi.fn(() => ({ width: 10 })),
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
    dataURLToCanvasAsync: vi.fn(async () => makeCanvas(4, 3)),
    snapshotCanvas: vi.fn(() => ({ kind: "data", imageData: { width: 1, height: 1, data: new Uint8ClampedArray(4) } })),
    restoreSnapshot: vi.fn(),
  };
});

vi.mock("../../editor/renderer/compositor", () => ({
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

function fakeAiResult(): AIResult {
  const canvas = createCanvas(4, 3);
  return {
    request: {
      id: "r1",
      operation: "generateImage",
      provider: "remote",
      model: "flux",
      params: { prompt: "a red cube" },
    },
    canvas,
    text: null,
    structured: null,
    selection: null,
    metadata: { seed: 7 },
    origin: "provider",
    createdAt: 1_700_000_000_000,
    provider: "remote",
    model: "flux",
  } as unknown as AIResult;
}

describe("AI result layer (create + round-trip + sanitize)", () => {
  let engine: EditorEngine;

  beforeEach(async () => {
    engine = new EditorEngine();
    runtime.engine = engine;
    runtime.canvas = canvasEngineStub();
    pixelStore.clear();
    await engine.createNewDocument({ width: 200, height: 150, background: "#ffffff", name: "T" });
  });

  afterEach(() => {
    runtime.canvas = null as unknown as typeof runtime.canvas;
    runtime.engine = null as unknown as EditorEngine;
    useEditorStore.setState({ doc: null, dirty: false });
  });

  it("creates an image layer carrying full AI metadata", () => {
    const layer = createAiResultLayer(fakeAiResult(), "AI Layer", { sourceLayerId: "src-1" });
    expect(layer.type).toBe("image");
    expect(layer.ai?.operation).toBe("generateImage");
    expect(layer.ai?.provider).toBe("remote");
    expect(layer.ai?.prompt).toBe("a red cube");
    expect(layer.ai?.sourceLayerId).toBe("src-1");
    expect(layer.ai?.origin).toBe("provider");

    engine.addLayer(layer, "AI Result: test");
    const doc = engine.doc()!;
    const inserted = doc.layers[doc.layers.length - 1]!;
    expect(inserted.ai?.operation).toBe("generateImage");
  });

  it("round-trips the AI metadata through the .vstudio format", () => {
    engine.addLayer(createAiResultLayer(fakeAiResult(), "AI Layer"), "AI Result");
    const doc = engine.doc()!;
    const meta = engine.getActiveMeta()!;
    const text = stringifyProject(buildProjectFile(doc, meta, engine.activeLayerId(), {}));

    const parsed = parseProjectText(text);
    expect(parsed.error).toBeNull();
    const rawLayer = parsed.file!.layers.find((l) => (l as Record<string, unknown>).ai) as Record<string, unknown> | undefined;
    expect(rawLayer).toBeDefined();
    const rawAi = rawLayer!.ai as Record<string, unknown>;
    expect(rawAi.operation).toBe("generateImage");
    expect(rawAi.prompt).toBe("a red cube");
    expect(rawAi.origin).toBe("provider");
    expect(String(rawLayer!.imageId).length).toBeGreaterThan(0);
    expect(parsed.file!.resources).toHaveProperty(String(rawLayer!.imageId));
  });

  it("drops unknown ai.operation during sanitization while keeping the layer", async () => {
    engine.addLayer(createAiResultLayer(fakeAiResult(), "AI Layer"), "AI Result");
    const doc = engine.doc()!;
    const meta = engine.getActiveMeta()!;
    const text = stringifyProject(buildProjectFile(doc, meta, engine.activeLayerId(), {}));
    const forged = text.replace('"operation":"generateImage"', '"operation":"takeover"');

    const parsed = parseProjectText(forged);
    expect(parsed.error).toBeNull();
    const built = await buildDocumentFromProject(parsed.file!);
    expect(built.doc).toBeDefined();
    expect(built.doc.layers.length).toBe(2);
    const aiLayer = built.doc.layers.find((l) => l.ai);
    expect(aiLayer).toBeUndefined();
  });
});

describe("AI result insertion is non-destructive, undoable and keeps Before fixed", () => {
  let engine: EditorEngine;

  beforeEach(async () => {
    engine = new EditorEngine();
    runtime.engine = engine;
    runtime.canvas = canvasEngineStub();
    pixelStore.clear();
    await engine.createNewDocument({ width: 200, height: 150, background: "#ffffff", name: "T" });
  });

  afterEach(() => {
    runtime.canvas = null as unknown as typeof runtime.canvas;
    runtime.engine = null as unknown as EditorEngine;
    useEditorStore.setState({ doc: null, dirty: false });
  });

  it("inserting an AI layer never mutates existing layers and undo removes it", () => {
    const baseId = engine.doc()!.layers[0]!.id;
    const beforeLayerIds = engine.doc()!.layers.map((l) => l.id);
    const prevCount = beforeLayerIds.length;

    const report = insertAiResultAsLayer(fakeAiResult());
    expect(report.ok).toBe(true);

    const d = engine.doc()!;
    expect(d.layers.length).toBe(prevCount + 1);
    // Original document structure is fully preserved, AI content is additive.
    expect(d.layers.slice(0, prevCount).map((l) => l.id)).toEqual(beforeLayerIds);
    const aiLayer = d.layers[prevCount]!;
    expect(aiLayer.type).toBe("image");
    expect(aiLayer.ai?.operation).toBe("generateImage");
    expect(aiLayer.id).toBe(report.layerId);
    expect(engine.canUndo()).toBe(true);

    // Undo removes the AI layer and restores the original layer list exactly.
    engine.undo();
    const d2 = engine.doc()!;
    expect(d2.layers.length).toBe(prevCount);
    expect(d2.layers.map((l) => l.id)).toEqual(beforeLayerIds);
    expect(d2.layers.find((l) => l.id === baseId)).toBeDefined();

    // Redo brings the AI layer back (still carrying its metadata).
    engine.redo();
    const d3 = engine.doc()!;
    expect(d3.layers.length).toBe(prevCount + 1);
    expect(d3.layers[prevCount]!.ai?.operation).toBe("generateImage");
  });

  it("rejects AI results without an image without touching the document", () => {
    const noImage = { ...fakeAiResult(), canvas: null };
    const before = engine.doc()!.layers.length;
    const report = insertAiResultAsLayer(noImage);
    expect(report.ok).toBe(false);
    expect(report.reason).toMatch(/image/i);
    expect(engine.doc()!.layers.length).toBe(before);
  });
});