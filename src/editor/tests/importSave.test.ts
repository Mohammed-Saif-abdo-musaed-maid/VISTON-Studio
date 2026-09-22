import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EditorEngine } from "../core/engine";
import { runtime } from "../core/runtime";
import { useEditorStore } from "../../state/store";
import { pixelStore } from "../core/document";
import { COMMANDS } from "../../app/commands";
import { writeProjectText } from "../project/projectStorage";
import { buildProjectFile, stringifyProject, parseProjectText } from "../project/projectFormat";
import { decodeImageFileSafe } from "../../utils/canvas";

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

const fakeFile = (name: string): File =>
  ({ name, type: "image/png", size: 0, slice: () => new Blob() } as unknown as File);

const mockDecode = (canvas: { width: number; height: number }, naturalWidth: number, naturalHeight: number): void => {
  vi.mocked(decodeImageFileSafe as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
    canvas,
    naturalWidth,
    naturalHeight,
  } as never);
};

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

describe("Import Image pipeline", () => {
  let engine: EditorEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime.engine = freshEngine();
    runtime.canvas = canvasEngineStub();
    engine = runtime.engine;
    pixelStore.clear();
  });

  afterEach(() => {
    useEditorStore.setState({ doc: null, dirty: false });
  });

  it("imports into an empty editor by creating a transparent document from the image", async () => {
    mockDecode({ width: 300, height: 200 }, 300, 200);
    useEditorStore.setState({ doc: null });

    await engine.importImageFile(fakeFile("photo.png"));

    const s = useEditorStore.getState();
    expect(s.doc?.width).toBe(300);
    expect(s.doc?.height).toBe(200);
    expect(s.doc?.layers.length).toBe(1);
    expect(engine.getActiveMeta()?.background).toBeNull();
    expect(runtime.canvas?.fitToScreen).toHaveBeenCalled();
    expect(s.lastError).toBeNull();
  });

  it("grows the canvas when the image is larger than the document (no cropping)", async () => {
    mockDecode({ width: 6000, height: 4000 }, 6000, 4000);
    await freshDoc(engine);

    await engine.importImageFile(fakeFile("big.png"));

    const s = useEditorStore.getState();
    expect(s.doc?.width).toBe(6000);
    expect(s.doc?.height).toBe(4000);
    expect(s.doc?.layers.length).toBe(2);
    expect(s.selectedIds.length).toBe(1);
    expect(runtime.canvas?.fitToScreen).toHaveBeenCalled();
    expect(s.dirty).toBe(true);

    engine.undo();
    expect(useEditorStore.getState().doc?.width).toBe(1280);
    expect(useEditorStore.getState().doc?.layers.length).toBe(1);

    engine.redo();
    expect(useEditorStore.getState().doc?.width).toBe(6000);
    expect(useEditorStore.getState().doc?.layers.length).toBe(2);
  });

  it("keeps the document size and centers the layer when the image fits", async () => {
    mockDecode({ width: 1000, height: 800 }, 1000, 800);
    await freshDoc(engine, 8000, 6000);

    await engine.importImageFile(fakeFile("small.png"));

    const s = useEditorStore.getState();
    expect(s.doc?.width).toBe(8000);
    expect(s.doc?.height).toBe(6000);
    expect(s.dirty).toBe(true);
    const imported = s.doc?.layers[s.doc.layers.length - 1];
    expect(imported?.type).toBe("image");
    expect(imported?.transform.width).toBe(1000);
    expect(imported?.transform.height).toBe(800);
    expect(imported?.transform.x).toBe((8000 - 1000) / 2);
    expect(imported?.transform.y).toBe((6000 - 800) / 2);
    expect(runtime.canvas?.fitToScreen).toHaveBeenCalled();
  });

  it("caps oversized sources to the safe render limit, preserving aspect ratio", async () => {
    mockDecode({ width: 20000, height: 13333 }, 30000, 20000);
    await freshDoc(engine, 1280, 800);

    await engine.importImageFile(fakeFile("huge.png"));

    const s = useEditorStore.getState();
    expect(s.doc?.width).toBe(20000);
    expect(s.doc?.height).toBe(13333);
    const imported = s.doc!.layers[s.doc!.layers.length - 1];
    const tw = imported.transform.width ?? 0;
    const th = imported.transform.height ?? 0;
    expect(tw / th).toBeCloseTo(1.5, 2);
  });

  it("fails gracefully (no uncaught error, no blank layer) on a corrupt image", async () => {
    vi.mocked(decodeImageFileSafe as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("Unable to decode the image. The file may be corrupted or unsupported.")
    );
    await freshDoc(engine);

    await expect(engine.importImageFile(fakeFile("broken.png"))).resolves.toBeUndefined();

    const s = useEditorStore.getState();
    expect(s.doc?.width).toBe(1280);
    expect(s.doc?.layers.length).toBe(1);
    expect(s.lastError).toContain("Import failed");
    expect(s.dirty).toBe(false);
  });
});

describe("Save / Save As", () => {
  let engine: EditorEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime.engine = freshEngine();
    runtime.canvas = canvasEngineStub();
    engine = runtime.engine;
    pixelStore.clear();
  });

  afterEach(() => {
    useEditorStore.setState({ doc: null, dirty: false });
  });

  it("first save runs through Save As (picks a name) and clears the dirty flag", async () => {
    vi.mocked(writeProjectText).mockResolvedValue({
      ok: true,
      name: "my-design.vstudio",
      path: "my-design.vstudio",
      cancelled: false,
      error: null,
    });
    await freshDoc(engine);

    const r = await engine.saveProject();

    expect(r.action).toBe("saved");
    expect(writeProjectText).toHaveBeenCalledWith(expect.any(String), "Untitled", "saveAs");
    const s = useEditorStore.getState();
    expect(s.dirty).toBe(false);
    expect(s.savedName).toBe("my-design");
    expect(s.savedPath).toBe("my-design.vstudio");
    expect(s.lastError).toBeNull();
  });

  it("subsequent saves reuse the saved target (mode save)", async () => {
    vi.mocked(writeProjectText).mockResolvedValue({
      ok: true,
      name: "my-design.vstudio",
      path: "my-design.vstudio",
      cancelled: false,
      error: null,
    });
    await freshDoc(engine);

    await engine.saveProject();
    await engine.saveProject();

    expect(writeProjectText).toHaveBeenNthCalledWith(2, expect.any(String), "Untitled", "save");
  });

  it("saveProject({ asNew: true }) always uses Save As mode", async () => {
    vi.mocked(writeProjectText).mockResolvedValue({
      ok: true,
      name: "copy.vstudio",
      path: "copy.vstudio",
      cancelled: false,
      error: null,
    });
    await freshDoc(engine);
    await engine.saveProject();
    await engine.saveProject({ asNew: true });

    expect(vi.mocked(writeProjectText).mock.calls[0]).toEqual([expect.any(String), "Untitled", "saveAs"]);
    expect(vi.mocked(writeProjectText).mock.calls[1]).toEqual([expect.any(String), "Untitled", "saveAs"]);
  });

  it("surfaces a save failure without silently losing the dirty state", async () => {
    vi.mocked(writeProjectText).mockResolvedValue({
      ok: false,
      name: null,
      path: null,
      cancelled: false,
      error: "disk full",
    });
    await freshDoc(engine);
    useEditorStore.setState({ dirty: true });

    const r = await engine.saveProject();

    expect(r.action).toBe("failed");
    const s = useEditorStore.getState();
    expect(s.dirty).toBe(true);
    expect(s.lastError).toContain("disk full");
  });
});

describe("Project reload round-trip", () => {
  let engine: EditorEngine;

  beforeEach(() => {
    vi.clearAllMocks();
    runtime.engine = freshEngine();
    runtime.canvas = canvasEngineStub();
    engine = runtime.engine;
    pixelStore.clear();
  });

  afterEach(() => {
    useEditorStore.setState({ doc: null, dirty: false });
  });

  it("saves an imported image and re-parses the project with full fidelity", async () => {
    mockDecode({ width: 250, height: 150 }, 250, 150);
    useEditorStore.setState({ doc: null });

    await engine.importImageFile(fakeFile("transparent.png"));
    const doc = engine.doc();
    const meta = engine.getActiveMeta();
    if (!doc || !meta) throw new Error("expected doc + meta");

    const text = stringifyProject(buildProjectFile(doc, meta, engine.activeLayerId(), {}));
    const parsed = parseProjectText(text);

    expect(parsed.error).toBeNull();
    expect(parsed.file).not.toBeNull();
    expect(parsed.file!.meta.width).toBe(250);
    expect(parsed.file!.meta.height).toBe(150);
    expect(parsed.file!.meta.background).toBeNull();
    expect(parsed.file!.layers.length).toBe(1);
    expect(parsed.file!.layers[0].type).toBe("image");
    const imageId = String(parsed.file!.layers[0].imageId);
    expect(imageId.length).toBeGreaterThan(0);
    expect(parsed.file!.resources).toHaveProperty(imageId);
    expect(parsed.file!.resources[imageId].startsWith("data:")).toBe(true);
  });
});

describe("Shortcut registry", () => {
  const cmd = (id: string) => COMMANDS.find((c) => c.id === id);

  it("binds Ctrl+N / Ctrl+O / Ctrl+S / Ctrl+Shift+S to the right commands", () => {
    expect(cmd("newProject")?.shortcut).toEqual({ key: "n", ctrl: true });
    expect(cmd("openProject")?.shortcut).toEqual({ key: "o", ctrl: true });
    expect(cmd("save")?.shortcut).toEqual({ key: "s", ctrl: true });
    expect(cmd("saveAs")?.shortcut).toEqual({ key: "s", ctrl: true, shift: true });
  });

  it("binds undo / redo / import", () => {
    expect(cmd("undo")?.shortcut).toEqual({ key: "z", ctrl: true });
    expect(cmd("redo")?.shortcut).toEqual({ key: "z", ctrl: true, shift: true });
    expect(cmd("importImage")?.shortcut).toEqual({ key: "i", ctrl: true, shift: true });
  });

  it("binds fit-to-screen and 100% without duplicate bindings", () => {
    expect(cmd("fitToScreen")?.shortcut).toEqual({ key: "0", ctrl: true });
    expect(cmd("actualSize")?.shortcut).toEqual({ key: "1", ctrl: true });
    const fit = COMMANDS.filter((c) => c.shortcut?.ctrl && c.shortcut.key === "0");
    expect(fit).toHaveLength(1);
  });

  it("binds every shortcut to a command that actually exists", () => {
    for (const c of COMMANDS) {
      expect(c.id.length).toBeGreaterThan(0);
      expect(typeof c.run).toBe("function");
    }
  });
});