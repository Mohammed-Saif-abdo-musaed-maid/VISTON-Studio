import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditorEngine } from "../core/engine";
import { runtime } from "../core/runtime";
import { useEditorStore } from "../../state/store";
import { pixelStore, maskStore } from "../core/document";
import { selectionEngine } from "../selection/selectionEngine";
import { buildProjectFile, stringifyProject, parseProjectText } from "../project/projectFormat";

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
    const c: Record<string, unknown> = { width: bw, height: bh, toDataURL: () => "data:image/png;base64,AAAA" };
    const ctx: Record<string, unknown> = {
      fillStyle: "#000000",
      strokeStyle: "#000000",
      globalAlpha: 1,
      globalCompositeOperation: "source-over",
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
      filter: "none",
      font: "",
      textBaseline: "alphabetic",
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
      strokeRect: vi.fn(),
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
  const makeComp = (w: number, h: number): HTMLCanvasElement => {
    const c: Record<string, unknown> = { width: Math.max(1, Math.round(w)), height: Math.max(1, Math.round(h)), toDataURL: () => "data:image/png;base64,AAAA" };
    const ctx: Record<string, unknown> = {
      globalCompositeOperation: "source-over",
      getImageData: (_x: number, _y: number, cw: number, ch: number) => {
        const data = new Uint8ClampedArray(cw * ch * 4);
        return { width: cw, height: ch, data, colorSpace: "srgb" } as ImageData;
      },
      createImageData: (cw: number, ch: number) => ({ width: cw, height: ch, data: new Uint8ClampedArray(cw * ch * 4) }),
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
    renderLayerToCanvas: vi.fn(() => makeComp(1, 1)),
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

describe("Guides & artboards wiring", () => {
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
    pixelStore.clear();
    maskStore.clear();
    useEditorStore.setState({
      tool: "move",
      selectedIds: [],
      cursor: null,
      status: "Ready",
      historyItems: [],
      historyIndex: -1,
      guides: [],
      artboards: [],
      activeArtboardId: null,
      snapToGrid: false,
      snapToGuides: false,
      snapToLayers: false,
      snapToCenter: false,
      snapToEdges: false,
      snapToArtboards: false,
      zoomDisplay: 1,
    });
    runtime.engine = new EditorEngine();
    runtime.canvas = canvasEngineStub();
    engine = runtime.engine;
    await engine.createNewDocument({ width: W, height: H, background: "#ffffff", name: "Guides" });
    useEditorStore.setState({ historyItems: [], historyIndex: -1 });
  });

  function historyNames(): string[] {
    return useEditorStore.getState().historyItems.map((i) => i.name);
  }

  it("creates a guide with a single undoable history entry", () => {
    const id = engine.createGuide("v", 60);
    expect(useEditorStore.getState().guides).toHaveLength(1);
    expect(historyNames()).toEqual(["New Vertical Guide"]);

    engine.undo();
    expect(useEditorStore.getState().guides).toHaveLength(0);
    engine.redo();
    expect(useEditorStore.getState().guides.map((g) => g.id)).toEqual([id]);
  });

  it("commits a guide drag as one entry and skips no-op commits", () => {
    const id = useEditorStore.getState().addGuide("h", 30);
    const before = useEditorStore.getState().guides.map((g) => ({ ...g }));
    engine.commitGuideEdit(before);
    expect(historyNames()).toEqual([]);

    useEditorStore.getState().moveGuide(id, 70);
    engine.commitGuideEdit(before);
    expect(historyNames()).toEqual(["Move Guide"]);
    engine.undo();
    expect(useEditorStore.getState().guides[0]!.position).toBe(30);
  });

  it("clears all guides with one history entry", () => {
    engine.createGuide("h", 10);
    engine.createGuide("v", 20);
    const before = historyNames().length;
    engine.clearAllGuides();
    expect(useEditorStore.getState().guides).toHaveLength(0);
    expect(historyNames().slice(-1)).toEqual(["Clear Guides"]);
    expect(historyNames().length).toBe(before + 1);
    engine.undo();
    expect(useEditorStore.getState().guides).toHaveLength(2);
  });

  it("adds and removes artboards through history, keeping the active id in sync", () => {
    const ab = engine.addArtboard({ x: 10, y: 20, width: 80, height: 60 }, "Card");
    expect(ab).not.toBeNull();
    expect(useEditorStore.getState().artboards).toHaveLength(1);
    expect(useEditorStore.getState().activeArtboardId).toBe(ab!.id);
    expect(historyNames()).toEqual(["New Artboard"]);

    engine.removeArtboard(ab!.id);
    expect(useEditorStore.getState().artboards).toHaveLength(0);
    expect(useEditorStore.getState().activeArtboardId).toBeNull();
    engine.undo();
    expect(useEditorStore.getState().artboards).toHaveLength(1);
    expect(useEditorStore.getState().artboards[0]!.name).toBe("Card");
    expect(useEditorStore.getState().activeArtboardId).toBe(ab!.id);
    engine.redo();
    expect(useEditorStore.getState().artboards).toHaveLength(0);
    expect(useEditorStore.getState().activeArtboardId).toBeNull();
  });

  it("snaps a dragged layer to an enabled guide and clears the overlay on release", () => {
    useEditorStore.getState().setSnapToGuides(true);
    useEditorStore.getState().addGuide("v", 60);
    const layerId = useEditorStore.getState().doc!.layers.find((l) => l.type === "image")!.id;
    useEditorStore.getState().setSelected([layerId]);

    engine.handlePointerDown("move", { x: 0, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "mouse" }));
    engine.handlePointerMove("move", { x: 1, y: 0 }, { x: 137, y: 80 }, ev({ pointerType: "mouse" }));

    const during = useEditorStore.getState().doc!.getLayer(layerId)!.transform;
    expect(during.x).toBe(60);
    expect(engine.snapLines.length).toBeGreaterThan(0);

    engine.handlePointerUp("move", { x: 1, y: 0 }, { x: 137, y: 80 }, ev({ pointerType: "mouse" }));
    expect(engine.snapLines.length).toBe(0);
    expect(historyNames()).toEqual(["Move Layer"]);
  });

  it("does not snap when snapping is disabled (backward-compatible move)", () => {
    useEditorStore.getState().addGuide("v", 60);
    const layerId = useEditorStore.getState().doc!.layers.find((l) => l.type === "image")!.id;
    useEditorStore.getState().setSelected([layerId]);

    engine.handlePointerDown("move", { x: 0, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "mouse" }));
    engine.handlePointerMove("move", { x: 1, y: 0 }, { x: 137, y: 80 }, ev({ pointerType: "mouse" }));
    expect(useEditorStore.getState().doc!.getLayer(layerId)!.transform.x).toBe(57);
    engine.handlePointerUp("move", { x: 1, y: 0 }, { x: 137, y: 80 }, ev({ pointerType: "mouse" }));
  });

  it("round-trips guides, artboards and grid settings through the project file", async () => {
    const ab = engine.addArtboard({ x: 5, y: 6, width: 70, height: 50 }, "Frame");
    engine.createGuide("v", 42);
    useEditorStore.getState().setGridSettings({ spacing: 32, subdivisions: 2, color: "#00ff00" });
    const doc = engine.doc();
    const meta = engine.getActiveMeta();
    if (!doc || !meta) throw new Error("expected doc + meta");

    const text = stringifyProject(
      buildProjectFile(doc, meta, engine.activeLayerId(), {
        guides: useEditorStore.getState().guides,
        artboards: useEditorStore.getState().artboards,
        grid: useEditorStore.getState().gridSettings,
      })
    );
    const parsed = parseProjectText(text);
    expect(parsed.error).toBeNull();
    expect(parsed.file!.guides).toHaveLength(1);
    expect(parsed.file!.artboards).toHaveLength(1);
    expect((parsed.file!.artboards as { id: string }[])[0]!.id).toBe(ab!.id);
    expect(parsed.file!.grid).toMatchObject({ spacing: 32, subdivisions: 2, color: "#00ff00" });
  });
});
