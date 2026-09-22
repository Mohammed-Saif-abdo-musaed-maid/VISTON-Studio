import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EditorEngine } from "../core/engine";
import { runtime } from "../core/runtime";
import { useEditorStore } from "../../state/store";
import type { ToolId } from "../../state/store";
import type { TextLayer, ShapeLayer } from "../core/types";

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

/** The complete set of 2D tools (matches the `ToolId` union in state/store.ts). */
const ALL_TOOLS: ToolId[] = [
  "move", "selection", "crop", "brush", "pencil", "eraser", "bucket", "eyedropper",
  "clone", "heal", "dodge", "burn", "smudge", "text", "shape", "pen", "hand", "zoom", "gradient",
];

describe("2D tools coverage and flows", () => {
  let engine: EditorEngine;

  beforeEach(async () => {
    engine = new EditorEngine();
    runtime.engine = engine;
    runtime.canvas = canvasEngineStub();
    await engine.createNewDocument({ width: 400, height: 300, background: "#ffffff", name: "T" });
  });

  afterEach(() => {
    runtime.canvas = null as unknown as typeof runtime.canvas;
    runtime.engine = null as unknown as EditorEngine;
  });

  it("exposes exactly 19 distinct tools", () => {
    expect(ALL_TOOLS.length).toBe(19);
    expect(new Set(ALL_TOOLS).size).toBe(19);
  });

  it("text tool creates a text layer, selects it and is undoable", () => {
    const before = useEditorStore.getState().doc!.layers.length;
    useEditorStore.getState().setTool("text");
    engine.handlePointerDown("text", { x: 0, y: 0 }, { x: 60, y: 40 }, {} as PointerEvent);

    const st = useEditorStore.getState();
    expect(st.doc!.layers.length).toBe(before + 1);
    const tl = st.doc!.layers[st.doc!.layers.length - 1]!;
    expect(tl.type).toBe("text");
    expect((tl as TextLayer).text).toBe("Text");
    expect(st.tool).toBe("move");
    expect(st.selectedIds).toContain(tl.id);

    engine.undo();
    expect(useEditorStore.getState().doc!.layers.length).toBe(before);
    engine.redo();
    expect(useEditorStore.getState().doc!.layers.length).toBe(before + 1);
  });

  it("shape tool commits an undoable shape layer with the dragged rect", () => {
    const before = useEditorStore.getState().doc!.layers.length;
    useEditorStore.getState().setTool("shape");
    engine.handlePointerDown("shape", { x: 0, y: 0 }, { x: 50, y: 50 }, {} as PointerEvent);
    engine.handlePointerMove("shape", { x: 0, y: 0 }, { x: 150, y: 120 }, {} as PointerEvent);
    engine.handlePointerUp("shape", { x: 0, y: 0 }, { x: 150, y: 120 }, {} as PointerEvent);

    const st = useEditorStore.getState();
    expect(st.doc!.layers.length).toBe(before + 1);
    const sl = st.doc!.layers[st.doc!.layers.length - 1]!;
    expect(sl.type).toBe("shape");
    expect(sl.transform.x).toBe(50);
    expect(sl.transform.y).toBe(50);
    expect(sl.transform.width).toBe(100);
    expect(sl.transform.height).toBe(70);
    expect((sl as ShapeLayer).fill).toBe(useEditorStore.getState().toolOptions.shape.fill);
    expect(st.tool).toBe("move");
    expect(st.selectedIds).toContain(sl.id);

    engine.undo();
    expect(useEditorStore.getState().doc!.layers.length).toBe(before);
  });
});