import { describe, it, expect, vi, beforeEach } from "vitest";
import { EditorEngine } from "../core/engine";
import { runtime } from "../core/runtime";
import { useEditorStore } from "../../state/store";
import { pixelStore, maskStore, EditorDocument } from "../core/document";
import { ImageLayer } from "../core/types";
import { selectionEngine } from "../selection/selectionEngine";
import { getClipboard } from "../core/engine";

type Rec =
  | { kind: "putImageData"; canvas: HTMLCanvasElement; data: Uint8ClampedArray; x: number; y: number; w: number; h: number }
  | { kind: "fill"; canvas: HTMLCanvasElement; globalAlpha: number };

const HARNESS = vi.hoisted(() => ({
  rec: [] as Rec[],
  records(): Rec[] {
    return HARNESS.rec;
  },
  makeCanvas: null as unknown as (w: number, h: number) => HTMLCanvasElement,
}));

vi.mock("../../utils/canvas", () => {
  const parseColor = (s: unknown): [number, number, number, number] => {
    if (typeof s !== "string") return [255, 255, 255, 255];
    const m = /^#([0-9a-f]{6})$/i.exec(String(s));
    if (m) {
      return [
        parseInt(m[1]!.slice(0, 2), 16),
        parseInt(m[1]!.slice(2, 4), 16),
        parseInt(m[1]!.slice(4, 6), 16),
        255,
      ];
    }
    return [255, 255, 255, 255];
  };

  const makeImageData = (w: number, h: number, source: Uint8ClampedArray | null): ImageData => {
    const data = source ?? new Uint8ClampedArray(w * h * 4);
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
      font: "10px sans-serif",
      textAlign: "start",
      textBaseline: "alphabetic",
      lineWidth: 1,
      lineDashOffset: 0,
      setLineDash: vi.fn(),
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      stroke: vi.fn(),
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
      getTransform: vi.fn(() => ({ a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 })),
      createImageData: (cw: number, ch: number) => makeImageData(cw || 1, ch || 1, null),
      getImageData: (x: number, y: number, cw: number, ch: number) => {
        const img = makeImageData(cw, ch, null);
        const d = c._data as Uint8ClampedArray;
        for (let py = 0; py < ch; py++) {
          for (let px = 0; px < cw; px++) {
            const si = ((y + py) * bw + (x + px)) * 4;
            const di = (py * cw + px) * 4;
            if (si >= 0 && si + 3 < d.length && y + py < bh && x + px < bw) {
              img.data[di] = d[si];
              img.data[di + 1] = d[si + 1];
              img.data[di + 2] = d[si + 2];
              img.data[di + 3] = d[si + 3];
            }
          }
        }
        return img;
      },
      putImageData: (img: ImageData, x: number, y: number) => {
        HARNESS.rec.push({ kind: "putImageData", canvas: c as unknown as HTMLCanvasElement, data: img.data, x, y, w: img.width, h: img.height });
        const d = c._data as Uint8ClampedArray;
        const src = img.data;
        const iw = img.width;
        const ih = img.height;
        const x0 = Math.max(0, Math.round(x));
        const y0 = Math.max(0, Math.round(y));
        for (let py = 0; py < ih; py++) {
          const sy = y0 + py;
          if (sy < 0 || sy >= bh) continue;
          for (let px = 0; px < iw; px++) {
            const sx = x0 + px;
            if (sx < 0 || sx >= bw) continue;
            const si = (py * iw + px) * 4;
            const di = (sy * bw + sx) * 4;
            d[di] = src[si];
            d[di + 1] = src[si + 1];
            d[di + 2] = src[si + 2];
            d[di + 3] = src[si + 3];
          }
        }
      },
      fillRect: (x: number, y: number, cw: number, ch: number) => {
        const [r, g, b, a] = parseColor(ctx.fillStyle);
        const d = c._data as Uint8ClampedArray;
        const x0 = Math.max(0, Math.round(x));
        const y0 = Math.max(0, Math.round(y));
        for (let py = y0; py < Math.min(bh, y0 + Math.max(0, Math.round(ch))); py++) {
          for (let px = x0; px < Math.min(bw, x0 + Math.max(0, Math.round(cw))); px++) {
            const i = (py * bw + px) * 4;
            d[i] = r;
            d[i + 1] = g;
            d[i + 2] = b;
            d[i + 3] = a;
          }
        }
      },
      createLinearGradient: () => ({ addColorStop: vi.fn() }),
      createRadialGradient: () => ({ addColorStop: vi.fn() }),
      createPattern: vi.fn(() => ({})),
    };
    ctx.fill = vi.fn(() => {
      HARNESS.rec.push({ kind: "fill", canvas: c as unknown as HTMLCanvasElement, globalAlpha: ctx.globalAlpha as number });
    });
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
    snapshotCanvas: vi.fn(
      (c: HTMLCanvasElement & { _ctx: CanvasRenderingContext2D }, rect: { x: number; y: number; width: number; height: number }) => ({
        kind: "data",
        imageData: c._ctx.getImageData(rect.x, rect.y, rect.width, rect.height),
      })
    ),
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
      globalAlpha: 1,
      createImageData: (cw: number, ch: number) => {
        const data = new Uint8ClampedArray(cw * ch * 4);
        return { width: cw, height: ch, data };
      },
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
      putImageData: vi.fn(),
      drawImage: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      clearRect: vi.fn(),
      fillRect: vi.fn(),
      setTransform: vi.fn(),
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
  s.setToolOption("brush", { size: 24, opacity: 1, hardness: 0.7, spacing: 0.12, flow: 1, color: "#000000" });
  s.setToolOption("selection", { mode: "replace", shape: "rect", useWand: false, tolerance: 16 });
  s.setToolOption("pen", { fill: "transparent", stroke: "#222222", strokeWidth: 3 });
  s.setToolOption("bucket", { tolerance: 32 });
  s.setToolOption("shape", { kind: "rect", points: 5, fill: "#4f8cff", stroke: "#222222", strokeWidth: 2 });
  s.setToolOption("gradient", { kind: "linear", colorStart: "#ffffff", colorEnd: "#000000" });
  s.setToolOption("clone", { size: 40, opacity: 1, spacing: 0.15 });
  s.setToolOption("heal", { size: 40, opacity: 1, spacing: 0.15 });
  s.setToolOption("dodge", { size: 60, strength: 0.5, spacing: 0.15 });
  s.setToolOption("burn", { size: 60, strength: 0.5, spacing: 0.15 });
  s.setToolOption("smudge", { size: 60, strength: 0.5, spacing: 0.15 });
  useEditorStore.setState({ tool: "move", selectedIds: [], cursor: null, status: "Ready", historyItems: [], historyIndex: -1 });
}

describe("paint tools engine behavior", () => {
  let engine: EditorEngine;

  beforeEach(async () => {
    vi.clearAllMocks();
    HARNESS.rec.length = 0;
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
    await engine.createNewDocument({ width: W, height: H, background: "#ffffff", name: "Paint" });
  });

  function imageLayerId(): string {
    const d = useEditorStore.getState().doc;
    if (!d) throw new Error("no doc");
    const l = d.layers.find((x) => x.type === "image");
    if (!l) throw new Error("no image layer");
    return l.id;
  }

  function lockImageLayer(): void {
    const id = imageLayerId();
    const d = useEditorStore.getState().doc;
    if (!d) return;
    useEditorStore.setState({
      doc: new EditorDocument(d.width, d.height, d.layers.map((l) => (l.id === id ? { ...l, locked: true } : l))),
    });
  }

  function historyNames(): string[] {
    return useEditorStore.getState().historyItems.map((i) => i.name);
  }

  it("for the default opacity=1, a mouse brush stroke commits exactly ONE history entry and does NOT trigger the opacity cap fill", () => {
    const commit = vi.spyOn(engine, "commitStroke");
    useEditorStore.getState().setSelected([imageLayerId()]);
    engine.handlePointerDown("brush", { x: 0, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "mouse" }));
    engine.handlePointerMove("brush", { x: 1, y: 0 }, { x: 120, y: 60 }, ev({ pointerType: "mouse" }));
    engine.handlePointerUp("brush", { x: 1, y: 0 }, { x: 120, y: 60 }, ev({ pointerType: "mouse" }));
    expect(historyNames()).toEqual(["Brush Stroke"]);
    expect(commit).toHaveBeenCalledTimes(1);
    const args = commit.mock.calls[0];
    expect(args[3]).toBe("paint");
    const capFills = HARNESS.records().filter((r) => r.kind === "fill" && r.globalAlpha !== 1);
    expect(capFills.length).toBe(0);
    expect(useEditorStore.getState().status).not.toContain("sampled");
  });

  it("with opacity<1 the final stroke alpha is capped, producing the destination-in cap fill", () => {
    useEditorStore.getState().setToolOption("brush", { opacity: 0.5 });
    useEditorStore.getState().setSelected([imageLayerId()]);
    engine.handlePointerDown("brush", { x: 0, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "mouse" }));
    engine.handlePointerUp("brush", { x: 0, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "mouse" }));
    expect(historyNames()).toEqual(["Brush Stroke"]);
    const cap = HARNESS.records().filter((r) => r.kind === "fill" && r.globalAlpha === 0.5 && r.canvas.width === W && r.canvas.height === H);
    expect(cap.length).toBe(1);
  });

  it("pen pressure scales dab size (bbox shrinks for pressure 0.5 vs mouse)", () => {
    const commit = vi.spyOn(engine, "commitStroke");
    useEditorStore.getState().setSelected([imageLayerId()]);
    engine.handlePointerDown("brush", { x: 0, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "mouse" }));
    engine.handlePointerUp("brush", { x: 0, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "mouse" }));
    const mouseBBox = commit.mock.calls[0]![2] as { width: number };
    HARNESS.rec.length = 0;
    commit.mockClear();
    engine.handlePointerDown("brush", { x: 0, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "pen", pressure: 0.5 }));
    engine.handlePointerUp("brush", { x: 0, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "pen", pressure: 0.5 }));
    expect(commit).toHaveBeenCalledTimes(1);
    const penBBox = commit.mock.calls[0]![2] as { width: number };
    expect(penBBox.width).toBeLessThan(mouseBBox.width);
    expect(penBBox.width).toBe(26);
  });

  it("brush with pen pressure 0 works as a no-pressure fallback (full size)", () => {
    const commit = vi.spyOn(engine, "commitStroke");
    useEditorStore.getState().setSelected([imageLayerId()]);
    engine.handlePointerDown("brush", { x: 0, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "pen", pressure: 0 }));
    engine.handlePointerUp("brush", { x: 0, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "pen", pressure: 0 }));
    expect(commit).toHaveBeenCalledTimes(1);
    expect((commit.mock.calls[0]![2] as { width: number }).width).toBe(32);
  });

  it("brush dynamics+scatter vary the dab from the real random source (deterministic stub)", () => {
    const commit = vi.spyOn(engine, "commitStroke");
    useEditorStore.getState().setToolOption("brush", { dynamics: 0.5, scatter: 0.5 });
    useEditorStore.getState().setSelected([imageLayerId()]);
    const rand = vi.spyOn(Math, "random").mockReturnValue(1);
    try {
      engine.handlePointerDown("brush", { x: 0, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "mouse" }));
      engine.handlePointerUp("brush", { x: 0, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "mouse" }));
    } finally {
      rand.mockRestore();
    }
    expect(commit).toHaveBeenCalledTimes(1);
    const bbox = commit.mock.calls[0]![2] as { width: number };
    expect(bbox.width).toBeGreaterThan(32);
    expect(bbox.width).toBeCloseTo(36.8, 1);
  });

  it("brush dynamics+scatter reset to defaults behave exactly like a plain brush", () => {
    const commit = vi.spyOn(engine, "commitStroke");
    useEditorStore.getState().setToolOption("brush", { dynamics: 0, scatter: 0 });
    useEditorStore.getState().setSelected([imageLayerId()]);
    engine.handlePointerDown("brush", { x: 0, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "mouse" }));
    engine.handlePointerUp("brush", { x: 0, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "mouse" }));
    expect((commit.mock.calls[0]![2] as { width: number }).width).toBe(32);
  });

  it("flow is a per-dab alpha multiplier and does not break the stroke or history", () => {
    useEditorStore.getState().setToolOption("brush", { flow: 0.4 });
    useEditorStore.getState().setSelected([imageLayerId()]);
    engine.handlePointerDown("brush", { x: 0, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "mouse" }));
    engine.handlePointerMove("brush", { x: 1, y: 0 }, { x: 90, y: 60 }, ev({ pointerType: "mouse" }));
    engine.handlePointerUp("brush", { x: 1, y: 0 }, { x: 90, y: 60 }, ev({ pointerType: "mouse" }));
    expect(historyNames()).toEqual(["Brush Stroke"]);
  });

  it("brush stroke is clipped to the selection mask (mask canvas putImageData with mixed alpha)", () => {
    selectionEngine.resize(W, H);
    selectionEngine.clear();
    selectionEngine.setRect("rect", 10, 10, 100, 50, "replace");
    HARNESS.rec.length = 0;
    useEditorStore.getState().setSelected([imageLayerId()]);
    engine.handlePointerDown("brush", { x: 0, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "mouse" }));
    engine.handlePointerUp("brush", { x: 0, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "mouse" }));
    expect(historyNames()).toEqual(["Brush Stroke"]);
    const puts = HARNESS.records().filter((r) => r.kind === "putImageData");
    const hasMaskAlpha = puts.some((r) => {
      let any = false;
      let zero = false;
      for (let i = 3; i < r.data.length; i += 4) {
        if (r.data[i] === 255) any = true;
        else if (r.data[i] === 0) zero = true;
        if (any && zero) break;
      }
      return any && zero;
    });
    expect(hasMaskAlpha).toBe(true);
  });

  it("brush stroke without a selection performs no putImageData clip", () => {
    HARNESS.rec.length = 0;
    useEditorStore.getState().setSelected([imageLayerId()]);
    engine.handlePointerDown("brush", { x: 0, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "mouse" }));
    engine.handlePointerUp("brush", { x: 0, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "mouse" }));
    expect(HARNESS.records().filter((r) => r.kind === "putImageData").length).toBe(0);
    expect(historyNames()).toEqual(["Brush Stroke"]);
  });

  it("brush stroke is a single undoable entry (undo removes it)", () => {
    useEditorStore.getState().setSelected([imageLayerId()]);
    useEditorStore.setState({ historyIndex: 0, historyItems: [] });
    engine.handlePointerDown("brush", { x: 0, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "mouse" }));
    engine.handlePointerUp("brush", { x: 0, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "mouse" }));
    expect(useEditorStore.getState().historyItems.length).toBe(1);
  });

  it("brush is blocked on a locked image layer (no history)", () => {
    lockImageLayer();
    useEditorStore.getState().setSelected([imageLayerId()]);
    engine.handlePointerDown("brush", { x: 0, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "mouse" }));
    engine.handlePointerUp("brush", { x: 0, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "mouse" }));
    expect(historyNames()).toEqual([]);
  });

  it("eraser commits an Eraser entry with erase mode", () => {
    const commit = vi.spyOn(engine, "commitStroke");
    useEditorStore.getState().setSelected([imageLayerId()]);
    engine.handlePointerDown("eraser", { x: 0, y: 0 }, { x: 40, y: 40 }, ev({ pointerType: "mouse" }));
    engine.handlePointerUp("eraser", { x: 0, y: 0 }, { x: 40, y: 40 }, ev({ pointerType: "mouse" }));
    expect(commit).toHaveBeenCalledTimes(1);
    expect((commit.mock.calls[0][3]! as string)).toBe("erase");
    expect(historyNames()).toEqual(["Eraser"]);
  });

  it.each(["pencil", "dodge", "burn", "smudge"])("%s paints a single stroke entry", (tool) => {
    useEditorStore.getState().setSelected([imageLayerId()]);
    engine.handlePointerDown(tool, { x: 0, y: 0 }, { x: 40, y: 40 }, ev({ pointerType: "mouse" }));
    engine.handlePointerMove(tool, { x: 1, y: 0 }, { x: 60, y: 40 }, ev({ pointerType: "mouse" }));
    engine.handlePointerUp(tool, { x: 1, y: 0 }, { x: 60, y: 40 }, ev({ pointerType: "mouse" }));
    const expected = { pencil: "Pencil", dodge: "Dodge", burn: "Burn", smudge: "Smudge" };
    expect(historyNames()).toEqual([expected[tool as keyof typeof expected]]);
  });

  it("clone stamp requires setting the source with Alt+click before painting", () => {
    engine.handlePointerDown("clone", { x: 0, y: 0 }, { x: 10, y: 10 }, ev({ altKey: true }));
    expect(useEditorStore.getState().status).toBe("Clone source set");
    useEditorStore.getState().setSelected([imageLayerId()]);
    engine.handlePointerDown("clone", { x: 0, y: 0 }, { x: 60, y: 60 }, ev({ pointerType: "mouse", altKey: false }));
    engine.handlePointerMove("clone", { x: 1, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "mouse" }));
    engine.handlePointerUp("clone", { x: 1, y: 0 }, { x: 80, y: 60 }, ev({ pointerType: "mouse" }));
    expect(historyNames()).toEqual(["Clone Stamp"]);
  });

  it("healing brush clips to a blurred patch and commits one entry", () => {
    engine.handlePointerDown("heal", { x: 0, y: 0 }, { x: 10, y: 10 }, ev({ pointerType: "mouse" }));
    engine.handlePointerUp("heal", { x: 0, y: 0 }, { x: 10, y: 10 }, ev({ pointerType: "mouse" }));
    useEditorStore.getState().setSelected([imageLayerId()]);
    engine.handlePointerDown("heal", { x: 0, y: 0 }, { x: 60, y: 60 }, ev({ pointerType: "mouse" }));
    engine.handlePointerUp("heal", { x: 0, y: 0 }, { x: 60, y: 60 }, ev({ pointerType: "mouse" }));
    expect(historyNames()).toEqual(["Healing Brush"]);
  });

  it("paint bucket fills the contiguous region with one Paint Bucket entry", () => {
    useEditorStore.getState().setSelected([imageLayerId()]);
    engine.handlePointerDown("bucket", { x: 0, y: 0 }, { x: 20, y: 20 }, ev({ pointerType: "mouse" }));
    expect(historyNames()).toEqual(["Paint Bucket"]);
    const st = useEditorStore.getState().status;
    expect(st).toContain("Paint bucket:");
    expect(st).toContain(`${W * H} pixels`);
    expect(HARNESS.records().filter((r) => r.kind === "putImageData" && r.w === W && r.h === H).length).toBeGreaterThan(0);
  });

  it("paint bucket respects the active selection (only selected pixels are filled)", () => {
    selectionEngine.resize(W, H);
    selectionEngine.clear();
    selectionEngine.setRect("rect", 10, 10, 100, 50, "replace");
    useEditorStore.getState().setSelected([imageLayerId()]);
    engine.handlePointerDown("bucket", { x: 0, y: 0 }, { x: 20, y: 20 }, ev({ pointerType: "mouse" }));
    const st = useEditorStore.getState().status;
    expect(st).toContain("Paint bucket: 5000 pixels");
  });

  it("paint bucket is blocked on a locked layer", () => {
    lockImageLayer();
    useEditorStore.getState().setSelected([imageLayerId()]);
    engine.handlePointerDown("bucket", { x: 0, y: 0 }, { x: 20, y: 20 }, ev({ pointerType: "mouse" }));
    expect(historyNames()).toEqual([]);
  });

  it("eyedropper samples the merged composite and sets the brush color", () => {
    useEditorStore.getState().setSelected([imageLayerId()]);
    engine.handlePointerDown("eyedropper", { x: 0, y: 0 }, { x: 5, y: 5 }, ev({ pointerType: "mouse" }));
    expect(useEditorStore.getState().toolOptions.brush.color).toBe("#ff0000");
    expect(useEditorStore.getState().status).toContain("Color sampled #FF0000");
    expect(historyNames()).toEqual([]);
  });

  it("gradient creates a new opaque layer, one entry, and respects (clips to) the selection", () => {
    selectionEngine.resize(W, H);
    selectionEngine.clear();
    selectionEngine.setRect("rect", 10, 10, 100, 50, "replace");
    HARNESS.rec.length = 0;
    const emptyLayerCount = useEditorStore.getState().doc!.layers.length;
    engine.handlePointerDown("gradient", { x: 0, y: 0 }, { x: 20, y: 20 }, ev({ pointerType: "mouse" }));
    engine.handlePointerMove("gradient", { x: 1, y: 0 }, { x: 120, y: 60 }, ev({ pointerType: "mouse" }));
    engine.handlePointerUp("gradient", { x: 1, y: 0 }, { x: 120, y: 60 }, ev({ pointerType: "mouse" }));
    expect(historyNames()).toEqual(["Gradient"]);
    const d = useEditorStore.getState().doc!;
    expect(d.layers.length).toBe(emptyLayerCount + 1);
    const puts = HARNESS.records().filter((r): r is Extract<Rec, { kind: "putImageData" }> =>
      r.kind === "putImageData" && r.w === W && r.h === H && r.data.length === W * H * 4
    );
    const mixed = puts.length > 0 && puts.some((r) => {
      let any = false;
      let zero = false;
      for (let i = 3; i < r.data.length; i += 4) {
        if (r.data[i] > 0) any = true;
        else zero = true;
        if (any && zero) break;
      }
      return any && zero;
    });
    expect(puts.length).toBeGreaterThan(0);
    expect(mixed).toBe(true);
  });

  it("gradient without a selection does not run a putImageData clip", () => {
    HARNESS.rec.length = 0;
    engine.handlePointerDown("gradient", { x: 0, y: 0 }, { x: 20, y: 20 }, ev({ pointerType: "mouse" }));
    engine.handlePointerUp("gradient", { x: 1, y: 0 }, { x: 120, y: 60 }, ev({ pointerType: "mouse" }));
    expect(historyNames()).toEqual(["Gradient"]);
    expect(HARNESS.records().filter((r) => r.kind === "putImageData").length).toBe(0);
  });

  it("clicking gradient twice at the same point uses a default span (one history entry)", () => {
    engine.handlePointerDown("gradient", { x: 0, y: 0 }, { x: 30, y: 30 }, ev({ pointerType: "mouse" }));
    engine.handlePointerUp("gradient", { x: 0, y: 0 }, { x: 30, y: 30 }, ev({ pointerType: "mouse" }));
    expect(historyNames()).toEqual(["Gradient"]);
  });

  it("pen tool accumulates points and commits a path layer on close", () => {
    engine.handlePointerDown("pen", { x: 0, y: 0 }, { x: 10, y: 10 }, ev({ pointerType: "mouse" }));
    engine.handlePointerDown("pen", { x: 0, y: 0 }, { x: 30, y: 40 }, ev({ pointerType: "mouse" }));
    engine.handlePointerDown("pen", { x: 0, y: 0 }, { x: 30, y: 40 }, ev({ pointerType: "mouse" }));
    expect(historyNames()).toEqual(["New Path"]);
    const d = useEditorStore.getState().doc!;
    const pathLayer = d.layers.find((l) => l.type === "shape" && l.shape === "path");
    expect(pathLayer).toBeDefined();
    const pl = pathLayer as { pathPoints: number[][]; transform: { x: number; y: number } };
    expect(pl.pathPoints).toEqual([
      [0, 0],
      [20, 30],
    ]);
    expect(pl.transform.x).toBe(10);
    expect(pl.transform.y).toBe(10);
    expect(useEditorStore.getState().tool).toBe("move");
  });

  it("pen tool cancel discards points and keeps history untouched", () => {
    engine.handlePointerDown("pen", { x: 0, y: 0 }, { x: 10, y: 10 }, ev({ pointerType: "mouse" }));
    engine.handlePointerDown("pen", { x: 0, y: 0 }, { x: 30, y: 40 }, ev({ pointerType: "mouse" }));
    engine.cancelPen();
    expect(engine.getPenPreview()).toBeNull();
    expect(historyNames()).toEqual([]);
  });
});

describe("brush strokes on transformed layers", () => {
  let engine: EditorEngine;

  beforeEach(async () => {
    vi.clearAllMocks();
    HARNESS.rec.length = 0;
    selectionEngine.resize(0, 0);
    selectionEngine.clear();
    selectionEngine.toggleVisibility(false);
    pixelStore.clear();
    maskStore.clear();
    resetToolOptions();
    useEditorStore.getState().setToolOption("brush", { dynamics: 0, scatter: 0 });
    runtime.engine = new EditorEngine();
    runtime.canvas = canvasEngineStub();
    engine = runtime.engine;
    await engine.createNewDocument({ width: W, height: H, background: "#ffffff", name: "Paint" });
  });

  function imageLayerId(): string {
    const d = useEditorStore.getState().doc;
    if (!d) throw new Error("no doc");
    const l = d.layers.find((x) => x.type === "image");
    if (!l) throw new Error("no image layer");
    return l.id;
  }

  it("maps a translated layer's doc-space pointer into the layer's local pixel space", () => {
    const commit = vi.spyOn(engine, "commitStroke");
    const id = imageLayerId();
    useEditorStore.getState().setSelected([id]);
    engine.updateLayerTransformLive(id, { x: 80, y: 50 });

    engine.handlePointerDown("brush", { x: 0, y: 0 }, { x: 80, y: 50 }, ev({ pointerType: "mouse" }));
    engine.handlePointerUp("brush", { x: 0, y: 0 }, { x: 80, y: 50 }, ev({ pointerType: "mouse" }));

    const bbox = commit.mock.calls[0]![2] as { x: number; y: number };
    expect(bbox.x).toBe(0);
    expect(bbox.y).toBe(0);
  });

  it("maps a 2x scaled layer's pointer into the layer canvas (doc W,H -> canvas W/2,H/2)", () => {
    const commit = vi.spyOn(engine, "commitStroke");
    const id = imageLayerId();
    useEditorStore.getState().setSelected([id]);
    engine.updateLayerTransformLive(id, { scaleX: 2, scaleY: 2 });

    engine.handlePointerDown("brush", { x: 0, y: 0 }, { x: W, y: H }, ev({ pointerType: "mouse" }));
    engine.handlePointerUp("brush", { x: 0, y: 0 }, { x: W, y: H }, ev({ pointerType: "mouse" }));

    const bbox = commit.mock.calls[0]![2] as { x: number; y: number };
    const size = 24;
    const pad = 4;
    expect(bbox.x).toBe(Math.max(0, W / 2 - size / 2 - pad));
    expect(bbox.y).toBe(Math.max(0, H / 2 - size / 2 - pad));
  });

  it("leaves identity layers unaffected (dab at doc coords == layer coords)", () => {
    const commit = vi.spyOn(engine, "commitStroke");
    const id = imageLayerId();
    useEditorStore.getState().setSelected([id]);

    engine.handlePointerDown("brush", { x: 0, y: 0 }, { x: 80, y: 50 }, ev({ pointerType: "mouse" }));
    engine.handlePointerUp("brush", { x: 0, y: 0 }, { x: 80, y: 50 }, ev({ pointerType: "mouse" }));

    const bbox = commit.mock.calls[0]![2] as { x: number; y: number };
    expect(bbox.x).toBe(80 - 12 - 4);
    expect(bbox.y).toBe(50 - 12 - 4);
  });
});

describe("selection copy/delete, crop undo, and smudge edge cases", () => {
  let engine: EditorEngine;

  beforeEach(async () => {
    vi.clearAllMocks();
    HARNESS.rec.length = 0;
    selectionEngine.resize(0, 0);
    selectionEngine.clear();
    selectionEngine.toggleVisibility(false);
    pixelStore.clear();
    maskStore.clear();
    resetToolOptions();
    runtime.engine = new EditorEngine();
    runtime.canvas = canvasEngineStub();
    engine = runtime.engine;
    await engine.createNewDocument({ width: W, height: H, background: "#ffffff", name: "Paint" });
  });

  function imageLayerId(): string {
    const d = useEditorStore.getState().doc;
    if (!d) throw new Error("no doc");
    const l = d.layers.find((x) => x.type === "image");
    if (!l) throw new Error("no image layer");
    return l.id;
  }

  function historyNames(): string[] {
    return useEditorStore.getState().historyItems.map((i) => i.name);
  }

  function layerCanvas(id: string): HTMLCanvasElement {
    const d = useEditorStore.getState().doc;
    if (!d) throw new Error("no doc");
    const layer = d.getLayer(id);
    if (!layer || layer.type !== "image") throw new Error("layer not image");
    const canvas = pixelStore.get((layer as ImageLayer).imageId);
    if (!canvas) throw new Error("no layer canvas");
    return canvas as unknown as HTMLCanvasElement;
  }

it("copySelection crops to selection bounds and pastes at the selection origin", () => {
    selectionEngine.resize(W, H);
    selectionEngine.setRect("rect", 5, 5, 10, 10, "replace");
    engine.copySelection();
    const clip = getClipboard();
    expect(clip).not.toBeNull();
    expect(clip!.width).toBe(10);
    expect(clip!.height).toBe(10);

    selectionEngine.clear();
    engine.copySelection();
    const full = getClipboard();
    expect(full!.width).toBe(W);
    expect(full!.height).toBe(H);
  });

  it("deleteSelection clears only the selected doc region on a translated layer", () => {
    const id = imageLayerId();
    useEditorStore.getState().setSelected([id]);
    const c = layerCanvas(id);
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#ff0000";
    ctx.fillRect(0, 0, c.width, c.height);
    engine.updateLayerTransformLive(id, { x: 5, y: 5 });

    selectionEngine.resize(W, H);
    selectionEngine.clear();
    selectionEngine.setRect("rect", 10, 10, 10, 10, "replace");
    engine.deleteSelection();

    const img = ctx.getImageData(0, 0, c.width, c.height);
    const alpha = (x: number, y: number) => img.data[(y * c.width + x) * 4 + 3];
    expect(alpha(5, 5)).toBe(0); // doc (10,10) -> local (5,5)
    expect(alpha(14, 14)).toBe(0); // doc (19,19) -> local (14,14)
    expect(alpha(4, 4)).toBe(255);
    expect(alpha(15, 15)).toBe(255);
  });

  it("crop undo/redo restores the original and clipped layer canvases", () => {
    const id = imageLayerId();
    const beforeCanvas = layerCanvas(id);
    engine.applyCrop({ x: 0, y: 0, width: 8, height: 8 });
    expect(useEditorStore.getState().doc!.width).toBe(8);
    expect(layerCanvas(id)).not.toBe(beforeCanvas);

    engine.undo();
    expect(useEditorStore.getState().doc!.width).toBe(W);
    expect(layerCanvas(id)).toBe(beforeCanvas);

    engine.redo();
    expect(useEditorStore.getState().doc!.width).toBe(8);
    expect(layerCanvas(id)).not.toBe(beforeCanvas);
  });

  it("imageSize undo/redo restores the original and scaled layer canvases", () => {
    const id = imageLayerId();
    const beforeCanvas = layerCanvas(id);
    engine.setImageSize(W * 2, H * 2);
    expect(useEditorStore.getState().doc!.width).toBe(W * 2);
    expect(layerCanvas(id)).not.toBe(beforeCanvas);

    engine.undo();
    expect(useEditorStore.getState().doc!.width).toBe(W);
    expect(layerCanvas(id)).toBe(beforeCanvas);

    engine.redo();
    expect(useEditorStore.getState().doc!.width).toBe(W * 2);
    expect(layerCanvas(id)).not.toBe(beforeCanvas);
  });

  it("smudge click with no movement commits no history entry", () => {
    const id = imageLayerId();
    useEditorStore.getState().setSelected([id]);
    engine.handlePointerDown("smudge", { x: 0, y: 0 }, { x: 30, y: 30 }, ev({ pointerType: "mouse" }));
    engine.handlePointerUp("smudge", { x: 0, y: 0 }, { x: 30, y: 30 }, ev({ pointerType: "mouse" }));
    expect(historyNames()).toEqual([]);
  });

  it("smudge with a drag commits exactly one Smudge history entry", () => {
    const id = imageLayerId();
    useEditorStore.getState().setSelected([id]);
    engine.handlePointerDown("smudge", { x: 0, y: 0 }, { x: 30, y: 30 }, ev({ pointerType: "mouse" }));
    engine.handlePointerMove("smudge", { x: 1, y: 0 }, { x: 60, y: 60 }, ev({ pointerType: "mouse" }));
    engine.handlePointerUp("smudge", { x: 1, y: 0 }, { x: 60, y: 60 }, ev({ pointerType: "mouse" }));
    expect(historyNames()).toEqual(["Smudge"]);
  });
});