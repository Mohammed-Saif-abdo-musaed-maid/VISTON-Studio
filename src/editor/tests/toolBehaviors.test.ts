import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditorEngine } from "../core/engine";
import { runtime } from "../core/runtime";
import { useEditorStore } from "../../state/store";
import { pixelStore, maskStore, EditorDocument } from "../core/document";
import { selectionEngine } from "../selection/selectionEngine";

const HARNESS = vi.hoisted(() => ({
  makeCanvas: null as unknown as (w: number, h: number) => HTMLCanvasElement,
}));

vi.mock("../../utils/canvas", () => {
  const makeImageData = (w: number, h: number): ImageData => {
    const data = new Uint8ClampedArray(w * h * 4);
    return { width: w, height: h, data, colorSpace: "srgb" } as unknown as ImageData;
  };
  const makeCanvas = (w: number, h: number): HTMLCanvasElement => {
    const bw = Math.max(1, Math.round(w));
    const bh = Math.max(1, Math.round(h));
    const c: Record<string, unknown> = {
      width: bw,
      height: bh,
      _data: new Uint8ClampedArray(bw * bh * 4),
      toDataURL: () => "data:image/png;base64,AAAA",
    };
    const ctx: Record<string, unknown> = {
      fillStyle: "#000000",
      strokeStyle: "#000000",
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
      filter: "none",
      setLineDash: vi.fn(),
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      fillRect: vi.fn(),
      fillText: vi.fn(),
      strokeText: vi.fn(),
      scale: vi.fn(),
      translate: vi.fn(),
      rotate: vi.fn(),
      arc: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      closePath: vi.fn(),
      ellipse: vi.fn(),
      drawImage: vi.fn(),
      measureText: vi.fn(() => ({ width: 10, actualBoundingBoxAscent: 5, actualBoundingBoxDescent: 5 })),
      createImageData: (cw: number, ch: number) => makeImageData(cw, ch),
      getImageData: (_x: number, _y: number, cw: number, ch: number) => makeImageData(cw, ch),
      putImageData: vi.fn(),
      createLinearGradient: () => ({ addColorStop: vi.fn() }),
      createRadialGradient: () => ({ addColorStop: vi.fn() }),
      createPattern: vi.fn(() => ({})),
    };
    c._ctx = ctx;
    c.getContext = () => ctx;
    return c as unknown as HTMLCanvasElement;
  };
  HARNESS.makeCanvas = makeCanvas;
  return {
    createCanvas: (w: number, h: number) => makeCanvas(w, h),
    getContext2d: (c: HTMLCanvasElement & { _ctx?: CanvasRenderingContext2D }) =>
      c._ctx ?? (c.getContext("2d") as CanvasRenderingContext2D),
    decodeImageFileSafe: vi.fn(),
    imageFileToCanvas: vi.fn(),
    dataURLToCanvasAsync: vi.fn(),
    snapshotCanvas: vi.fn(() => ({ kind: "data", imageData: makeImageData(1, 1) })),
    restoreSnapshot: vi.fn(),
  };
});

vi.mock("../renderer/compositor", () => {
  const red: [number, number, number, number] = [255, 0, 0, 255];
  const makeComp = (w: number, h: number): HTMLCanvasElement => {
    const c: Record<string, unknown> = {
      width: Math.max(1, Math.round(w)),
      height: Math.max(1, Math.round(h)),
      toDataURL: () => "data:image/png;base64,AAAA",
    };
    const ctx: Record<string, unknown> = {
      globalCompositeOperation: "source-over",
      getImageData: (_x: number, _y: number, cw: number, ch: number) => {
        const data = new Uint8ClampedArray(cw * ch * 4);
        for (let i = 0; i < data.length; i += 4) {
          data[i] = red[0];
          data[i + 1] = red[1];
          data[i + 2] = red[2];
          data[i + 3] = red[3];
        }
        return { width: cw, height: ch, data, colorSpace: "srgb" } as ImageData;
      },
      createImageData: (cw: number, ch: number) => {
        const data = new Uint8ClampedArray(cw * ch * 4);
        return { width: cw, height: ch, data };
      },
      putImageData: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      clearRect: vi.fn(),
    };
    c.getContext = () => ctx;
    return c as unknown as HTMLCanvasElement;
  };
  return {
    compositeToCanvas: vi.fn((d: { width: number; height: number }) => makeComp(d.width, d.height)),
    renderLayerToCanvas: vi.fn(() => null),
  };
});

const W = 160;
const H = 120;

const canvasEngineStub = () =>
  ({
    fitToScreen: vi.fn(),
    resetCamera: vi.fn(),
    requestRender: vi.fn(),
    zoom100: vi.fn(),
    zoomAtVP: vi.fn(),
  }) as unknown as typeof runtime.canvas;

const ev = (over: Record<string, unknown> = {}) => over as unknown as PointerEvent;

function resetToolOptions(): void {
  const s = useEditorStore.getState();
  s.setToolOption("selection", { mode: "replace", shape: "rect", useWand: false, tolerance: 16 });
  s.setToolOption("crop", { aspect: "free" });
  s.setToolOption("shape", { kind: "rect", points: 5, fill: "#4f8cff", stroke: "#222222", strokeWidth: 2, cornerRadius: 0, starRatio: 0.4 });
  useEditorStore.setState({ tool: "move", selectedIds: [], cursor: null, status: "Ready", historyItems: [], historyIndex: -1 });
}

function maskCount(mask: Uint8ClampedArray | null): number {
  if (!mask) return 0;
  let n = 0;
  for (let i = 0; i < mask.length; i++) if (mask[i] > 0) n++;
  return n;
}

describe("non-paint tool engine behavior", () => {
  let engine: EditorEngine;

  beforeEach(async () => {
    vi.clearAllMocks();
    (globalThis as unknown as Record<string, unknown>).document = {
      createElement: (tag: string) => {
        if (tag === "canvas") return HARNESS.makeCanvas(1, 1);
        if (tag === "input") return { type: "", files: [], value: "", click: vi.fn() };
        if (tag === "a") return { href: "", download: "", click: vi.fn(), appendChild: vi.fn(), remove: vi.fn() };
        return { getContext: () => null };
      },
    } as unknown as Document;
    selectionEngine.resize(0, 0);
    selectionEngine.clear();
    selectionEngine.toggleVisibility(false);
    pixelStore.clear();
    maskStore.clear();
    resetToolOptions();
    runtime.engine = new EditorEngine();
    runtime.canvas = canvasEngineStub();
    engine = runtime.engine;
    await engine.createNewDocument({ width: W, height: H, background: "#ffffff", name: "Tools" });
  });

  function historyNames(): string[] {
    return useEditorStore.getState().historyItems.map((i) => i.name);
  }

  it("rect selection marks the region in the mask", () => {
    engine.handlePointerDown("selection", { x: 0, y: 0 }, { x: 10, y: 10 }, ev({ pointerType: "mouse" }));
    engine.handlePointerMove("selection", { x: 1, y: 0 }, { x: 60, y: 50 }, ev({ pointerType: "mouse" }));
    engine.handlePointerUp("selection", { x: 1, y: 0 }, { x: 60, y: 50 }, ev({ pointerType: "mouse" }));
    expect(selectionEngine.hasSelection).toBe(true);
    expect(maskCount(selectionEngine.getMask(W, H))).toBe(50 * 40);
    expect(historyNames()).toEqual([]);
  });

  it("lasso selection fills the polygon interior", () => {
    useEditorStore.getState().setToolOption("selection", { shape: "lasso" });
    engine.handlePointerDown("selection", { x: 0, y: 0 }, { x: 20, y: 20 }, ev({ pointerType: "mouse" }));
    engine.handlePointerMove("selection", { x: 1, y: 0 }, { x: 60, y: 20 }, ev({ pointerType: "mouse" }));
    engine.handlePointerMove("selection", { x: 2, y: 0 }, { x: 60, y: 60 }, ev({ pointerType: "mouse" }));
    engine.handlePointerUp("selection", { x: 3, y: 0 }, { x: 20, y: 60 }, ev({ pointerType: "mouse" }));
    expect(selectionEngine.hasSelection).toBe(true);
    const mask = selectionEngine.getMask(W, H)!;
    expect(mask[20 * W + 40]).toBe(1);
    expect(maskCount(mask)).toBeGreaterThan(0);
  });

  it("magic wand selects all matching (red) pixels, subtract mode clears them", () => {
    useEditorStore.getState().setToolOption("selection", { useWand: true, tolerance: 16, mode: "replace" });
    engine.handlePointerDown("selection", { x: 0, y: 0 }, { x: 5, y: 5 }, ev({ pointerType: "mouse" }));
    expect(selectionEngine.hasSelection).toBe(true);
    expect(maskCount(selectionEngine.getMask(W, H))).toBe(W * H);
    useEditorStore.getState().setToolOption("selection", { mode: "subtract" });
    engine.handlePointerDown("selection", { x: 0, y: 0 }, { x: 5, y: 5 }, ev({ pointerType: "mouse" }));
    expect(selectionEngine.hasSelection).toBe(false);
  });

  it("select-related engine helpers mutate the mask without history", () => {
    engine.selectAll();
    expect(maskCount(selectionEngine.getMask(W, H))).toBe(W * H);
    engine.contractSelection();
    expect(maskCount(selectionEngine.getMask(W, H))).toBeLessThan(W * H);
    engine.growSelection();
    engine.featherSelection();
    engine.deselect();
    expect(selectionEngine.hasSelection).toBe(false);
    expect(historyNames()).toEqual([]);
  });

  it("move tool drags the clicked layer and commits one Move Layer entry (undo restores)", () => {
    const d0 = useEditorStore.getState().doc!;
    const layerId = d0.layers.find((l) => l.type === "image")!.id;
    const beforeX = d0.layers.find((l) => l.id === layerId)!.transform.x;
    engine.handlePointerDown("move", { x: 0, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "mouse" }));
    engine.handlePointerMove("move", { x: 1, y: 0 }, { x: 140, y: 80 }, ev({ pointerType: "mouse" }));
    engine.handlePointerUp("move", { x: 1, y: 0 }, { x: 140, y: 80 }, ev({ pointerType: "mouse" }));
    expect(historyNames()).toEqual(["Move Layer"]);
    const moved = useEditorStore.getState().doc!.getLayer(layerId)!.transform;
    expect(moved.x).toBe(beforeX + 60);
    expect(moved.y).toBe(20);
    engine.undo();
    const restored = useEditorStore.getState().doc!.getLayer(layerId)!.transform;
    expect(restored.x).toBe(beforeX);
    expect(restored.y).toBe(0);
  });

  it("move tool drags an explicitly selected layer", () => {
    const layerId = useEditorStore.getState().doc!.layers.find((l) => l.type === "image")!.id;
    useEditorStore.getState().setSelected([layerId]);
    engine.handlePointerDown("move", { x: 0, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "mouse" }));
    engine.handlePointerMove("move", { x: 1, y: 0 }, { x: 120, y: 60 }, ev({ pointerType: "mouse" }));
    engine.handlePointerUp("move", { x: 1, y: 0 }, { x: 120, y: 60 }, ev({ pointerType: "mouse" }));
    expect(historyNames()).toEqual(["Move Layer"]);
    expect(useEditorStore.getState().doc!.getLayer(layerId)!.transform.x).toBe(40);
  });

  it("crop tool plus apply shrinks the document, shifts layers, and is undoable", () => {
    engine.handlePointerDown("crop", { x: 0, y: 0 }, { x: 10, y: 10 }, ev({ pointerType: "mouse" }));
    engine.handlePointerMove("crop", { x: 1, y: 0 }, { x: 110, y: 60 }, ev({ pointerType: "mouse" }));
    engine.applyCropFromTool();
    const d = useEditorStore.getState().doc!;
    expect(d.width).toBe(100);
    expect(d.height).toBe(50);
    const layer = d.layers.find((l) => l.type === "image")!;
    expect(layer.transform.x).toBe(-10);
    expect(layer.transform.y).toBe(-10);
    expect(historyNames()).toContain("Crop");
    engine.undo();
    const d2 = useEditorStore.getState().doc!;
    expect(d2.width).toBe(W);
    expect(d2.height).toBe(H);
    expect(d2.layers.find((l) => l.type === "image")!.transform.x).toBe(0);
  });

  it("shape tool draws a rectangle draft and commits a New Shape layer", () => {
    engine.handlePointerDown("shape", { x: 0, y: 0 }, { x: 5, y: 5 }, ev({ pointerType: "mouse" }));
    engine.handlePointerMove("shape", { x: 1, y: 0 }, { x: 55, y: 35 }, ev({ pointerType: "mouse" }));
    expect(engine.getShapeDraftRect()).toMatchObject({ x: 5, y: 5, width: 50, height: 30, kind: "rect" });
    engine.handlePointerUp("shape", { x: 1, y: 0 }, { x: 55, y: 35 }, ev({ pointerType: "mouse" }));
    expect(historyNames()).toEqual(["New Shape"]);
    const d = useEditorStore.getState().doc!;
    const shape = d.layers.find((l) => l.type === "shape")!;
    expect(shape.shape).toBe("rect");
    expect(shape.transform.width).toBe(50);
    expect(shape.transform.height).toBe(30);
    expect(useEditorStore.getState().tool).toBe("move");
  });

  it("star shape preserves the points option", () => {
    useEditorStore.getState().setToolOption("shape", { kind: "star", points: 6 });
    engine.handlePointerDown("shape", { x: 0, y: 0 }, { x: 10, y: 10 }, ev({ pointerType: "mouse" }));
    engine.handlePointerMove("shape", { x: 1, y: 0 }, { x: 60, y: 40 }, ev({ pointerType: "mouse" }));
    engine.handlePointerUp("shape", { x: 1, y: 0 }, { x: 60, y: 40 }, ev({ pointerType: "mouse" }));
    const shape = useEditorStore.getState().doc!.layers.find((l) => l.type === "shape")!;
    expect(shape.shape).toBe("star");
    expect(shape.points).toBe(6);
  });

  it("text tool creates a text layer and switches to move", () => {
    engine.handlePointerDown("text", { x: 0, y: 0 }, { x: 20, y: 30 }, ev({ pointerType: "mouse" }));
    expect(historyNames()).toEqual(["New Text"]);
    const d = useEditorStore.getState().doc!;
    const t = d.layers.find((l) => l.type === "text");
    expect(t).toBeDefined();
    expect((t as { text: string }).text).toBe("Text");
    expect(useEditorStore.getState().tool).toBe("move");
  });

  it("hand and zoom tools are canvas-level: no history, no doc mutation", () => {
    const before = JSON.stringify(useEditorStore.getState().doc);
    for (const tool of ["hand", "zoom"]) {
      engine.handlePointerDown(tool, { x: 0, y: 0 }, { x: 10, y: 10 }, ev({ pointerType: "mouse" }));
      engine.handlePointerMove(tool, { x: 1, y: 0 }, { x: 30, y: 20 }, ev({ pointerType: "mouse" }));
      engine.handlePointerUp(tool, { x: 1, y: 0 }, { x: 30, y: 20 }, ev({ pointerType: "mouse" }));
    }
    expect(historyNames()).toEqual([]);
    expect(JSON.stringify(useEditorStore.getState().doc)).toBe(before);
  });
});