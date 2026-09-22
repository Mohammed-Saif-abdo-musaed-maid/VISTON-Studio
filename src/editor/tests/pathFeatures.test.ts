import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EditorEngine } from "../core/engine";
import { runtime } from "../core/runtime";
import { createShapeLayer } from "../layers/layerFactory";
import { PathPoint, ShapeLayer } from "../core/types";
import { traceShapePath, drawShapeLayer } from "../renderer/shapeRenderer";
import { selectionEngine } from "../selection/selectionEngine";

const h = vi.hoisted(() => {
  const makeCtx = (): CanvasRenderingContext2D & { calls: string[] } => {
    const cmds: string[] = [];
    let fillStyle = "#000000", strokeStyle = "#000000", lineWidth = 1, lineJoin = "miter", lineCap = "butt", globalAlpha = 1;
    const cctx: Record<string, unknown> = {
      calls: cmds,
      get fillStyle() { return fillStyle; }, set fillStyle(v: string | CanvasGradient) { fillStyle = String(v); },
      get strokeStyle() { return strokeStyle; }, set strokeStyle(v: string | CanvasGradient) { strokeStyle = String(v); },
      get lineWidth() { return lineWidth; }, set lineWidth(v: number) { lineWidth = v; },
      get lineJoin() { return lineJoin; }, set lineJoin(v: string) { lineJoin = v; },
      get lineCap() { return lineCap; }, set lineCap(v: string) { lineCap = v; },
      get globalAlpha() { return globalAlpha; }, set globalAlpha(v: number) { globalAlpha = v; },
      beginPath: vi.fn(() => cmds.push("beginPath")),
      moveTo: vi.fn((x: number, y: number) => cmds.push(`move ${x} ${y}`)),
      lineTo: vi.fn((x: number, y: number) => cmds.push(`line ${x} ${y}`)),
      bezierCurveTo: vi.fn((a: number, b: number, c: number, d: number, x: number, y: number) => cmds.push(`bez ${a} ${b} ${c} ${d} ${x} ${y}`)),
      closePath: vi.fn(() => cmds.push("close")),
      fill: vi.fn(() => cmds.push("fill")),
      stroke: vi.fn(() => cmds.push("stroke")),
      save: vi.fn(), restore: vi.fn(), rect: vi.fn(), clip: vi.fn(), scale: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
      ellipse: vi.fn(), quadraticCurveTo: vi.fn(), arc: vi.fn(),
      clearRect: vi.fn(),
      fillRect: (x: number, y: number, w: number, ht: number) => {
        for (let py = Math.max(0, y); py < Math.min(64, y + ht); py++)
          for (let px = Math.max(0, x); px < Math.min(64, x + w); px++) {
            const i = (py * 64 + px) * 4;
            // backing pixel store not shared; nothing else reads it here
            void i;
          }
      },
      getImageData: vi.fn(() => ({ width: 1, height: 2, data: new Uint8ClampedArray(8) })),
      putImageData: vi.fn(),
      createImageData: vi.fn((w: number, ht: number) => ({ width: w, height: ht, data: new Uint8ClampedArray(w * ht * 4) })),
      drawImage: vi.fn(),
    };
    return cctx as unknown as CanvasRenderingContext2D & { calls: string[] };
  };
  const makeCanvas = (w: number, ht: number): HTMLCanvasElement & { _ctx?: CanvasRenderingContext2D; _data: Uint8ClampedArray } => {
    const bw = Math.max(1, Math.round(w)), bh = Math.max(1, Math.round(ht));
    const c = {
      width: bw, height: bh,
      _data: new Uint8ClampedArray(bw * bh * 4),
      toDataURL: () => "data:image/png;base64,AAAA",
    } as HTMLCanvasElement & { _ctx?: CanvasRenderingContext2D; _data: Uint8ClampedArray };
    const cctx = makeCtx();
    c._ctx = cctx;
    (c as unknown as { getContext: (kind: string) => CanvasRenderingContext2D }).getContext = () => cctx;
    return c;
  };
  return { makeCtx, makeCanvas };
});

vi.mock("../../utils/canvas", () => ({
  createCanvas: vi.fn((w: number, ht: number) => h.makeCanvas(w, ht)),
  getContext2d: vi.fn((c: { _ctx?: CanvasRenderingContext2D } & { getContext?: (k: string) => CanvasRenderingContext2D }) => c._ctx ?? (c.getContext?.("2d") as CanvasRenderingContext2D)),
  decodeImageFileSafe: vi.fn(),
  imageFileToCanvas: vi.fn(),
  dataURLToCanvas: vi.fn(),
}));

vi.mock("../renderer/compositor", () => ({
  compositeToCanvas: vi.fn(() => null),
  renderLayerToCanvas: vi.fn(() => null),
}));

const canvasEngineStub = () =>
  ({
    fitToScreen: vi.fn(), resetCamera: vi.fn(), requestRender: vi.fn(), zoom100: vi.fn(),
    zoomAtVP: vi.fn(), element: vi.fn(), resize: vi.fn(), zoomTo: vi.fn(), docFromVP: vi.fn(), vpFromDoc: vi.fn(),
  }) as unknown as typeof runtime.canvas;

function p(x: number, y: number, inX = 0, inY = 0, outX = 0, outY = 0, smooth = false): PathPoint {
  return { x, y, inX, inY, outX, outY, smooth };
}

describe("path tracing + rendering", () => {
  it("straight segments trace as move + lines", () => {
    const t = traceShapePath([p(0, 0), p(10, 0), p(10, 10)], false);
    expect(t.cmds.map((c) => c.kind)).toEqual(["move", "line", "line"]);
    expect(t.outline[0]).toEqual([0, 0]);
  });

  it("bezier handles produce cubic commands and a sampled outline", () => {
    const t = traceShapePath([p(0, 0, 0, 0, 10, 0), p(10, 10, 0, -10)], false);
    const kinds = t.cmds.map((c) => c.kind);
    expect(kinds[0]).toBe("move");
    expect(kinds[1]).toBe("cubic");
    const c = t.cmds[1]!;
    expect(c.c1x).toBe(10); // prev anchor + out handle
    expect(c.c2y).toBe(0); // next anchor + in handle (0,-10) => (10, 0)
    expect(t.outline.length).toBeGreaterThanOrEqual(16);
  });

  it("closed paths (first == last) add a closing segment automatically", () => {
    const t = traceShapePath([p(0, 0), p(10, 0), p(10, 10), p(0, 0)], false);
    const kinds = t.cmds.map((c) => c.kind);
    expect(kinds).toContain("line"); // closing cubic/line back to (0,0)
    expect(t.outline.length).toBeGreaterThanOrEqual(5);
  });

  it("drawShapeLayer renders beziers for path shapes", () => {
    const ctx = h.makeCtx();
    const layer = {
      ...createShapeLayer("path"),
      pathData: [p(0, 0, 0, 0, 10, 0), p(10, 10, 0, -10), p(0, 10)],
      fill: "#ff0000",
      strokeWidth: 1,
    } as ShapeLayer;
    drawShapeLayer(ctx, layer);
    expect(ctx.calls).toContain("beginPath");
    expect(ctx.calls).toContain("fill");
    expect(ctx.calls.some((c) => c.startsWith("bez "))).toBe(true);
  });

  it("smooth anchors derive a mirrored out-handle from the in-handle on the outgoing segment", () => {
    const t = traceShapePath([p(0, 0), p(10, 0, -5, 0, 0, 0, true), p(20, 0)], false);
    const kinds = t.cmds.map((c) => c.kind);
    expect(kinds[1]).toBe("cubic"); // in-handle attracts the second anchor
    const c1 = t.cmds[1]!;
    expect(c1.c2x).toBe(5); // 10 + (-5)
    const c2 = t.cmds[2]!;
    expect(c2.c1x).toBe(15); // mirrored out-handle (5,0) from the anchor at 10
  });
});

describe("path layer editing history", () => {
  let engine: EditorEngine;

  beforeEach(async () => {
    engine = new EditorEngine();
    runtime.engine = engine;
    runtime.canvas = canvasEngineStub();
    await engine.createNewDocument({ width: 64, height: 64, background: "#ffffff", name: "P" });
  });

  afterEach(() => {
    runtime.engine = null as unknown as EditorEngine;
    runtime.canvas = null as unknown as typeof runtime.canvas;
    selectionEngine.toggleVisibility(false);
  });

  function addPath(pts: PathPoint[]): string {
    const sl = createShapeLayer("path");
    sl.pathData = pts.map((x) => ({ ...x }));
    sl.fill = "#00ff00";
    engine.addLayer(sl, "Add path");
    return sl.id;
  }

  it("movePathAnchor shifts an anchor and is undoable", () => {
    const id = addPath([p(0, 0), p(10, 0), p(10, 10)]);
    engine.movePathAnchor(id, 1, 3, -2);
    let pts = (engine.doc()!.getLayer(id) as ShapeLayer).pathData!;
    expect(pts[1]!.x).toBe(13);
    expect(pts[1]!.y).toBe(-2);
    engine.undo();
    pts = (engine.doc()!.getLayer(id) as ShapeLayer).pathData!;
    expect(pts[1]!.x).toBe(10);
    expect(pts[1]!.y).toBe(0);
  });

  it("addPathAnchor appends and splice-inserts in the right place", () => {
    const id = addPath([p(0, 0), p(10, 0)]);
    engine.addPathAnchor(id, -1, 50, 50);
    engine.addPathAnchor(id, 0, 5, 5);
    const pts = (engine.doc()!.getLayer(id) as ShapeLayer).pathData!;
    expect(pts.length).toBe(4);
    expect(pts[1]!.x).toBe(5);
    expect(pts[3]!.x).toBe(50);
    engine.undo();
    expect((engine.doc()!.getLayer(id) as ShapeLayer).pathData!.length).toBe(3);
  });

  it("deletePathAnchor removes an anchor and is undoable", () => {
    const id = addPath([p(0, 0), p(10, 0), p(10, 10)]);
    engine.deletePathAnchor(id, 1);
    expect((engine.doc()!.getLayer(id) as ShapeLayer).pathData!.length).toBe(2);
    engine.undo();
    expect((engine.doc()!.getLayer(id) as ShapeLayer).pathData!.length).toBe(3);
  });

  it("togglePathAnchorSmooth mirrors the in-handle into the out-handle", () => {
    const id = addPath([p(0, 0), p(10, 0, -5, 0, 0, 0, false), p(20, 0)]);
    engine.togglePathAnchorSmooth(id, 1);
    const pts = (engine.doc()!.getLayer(id) as ShapeLayer).pathData!;
    expect(pts[1]!.smooth).toBe(true);
    expect(pts[1]!.outX).toBe(5);
    engine.undo();
    expect((engine.doc()!.getLayer(id) as ShapeLayer).pathData![1]!.smooth).toBe(false);
  });

  it("editPathLayer replaces pathData in one undoable entry", () => {
    const id = addPath([p(0, 0), p(10, 0)]);
    engine.editPathLayer(id, { pathData: [p(0, 0), p(20, 20), p(0, 20)] });
    expect((engine.doc()!.getLayer(id) as ShapeLayer).pathData!.length).toBe(3);
    engine.undo();
    expect((engine.doc()!.getLayer(id) as ShapeLayer).pathData!.length).toBe(2);
  });

  it("selectionFromPath fills the selection mask inside a closed triangle", () => {
    const id = addPath([p(10, 10), p(40, 10), p(25, 40)]);
    engine.selectionFromPath(id);
    const sel = selectionEngine.getMask();
    expect(sel).not.toBeNull();
    const at = (x: number, y: number) => sel![y * 64 + x]!;
    expect(at(12, 12)).toBe(1); // inside triangle
    expect(at(5, 5)).toBe(0); // outside
    expect(at(10, 50)).toBe(0);
  });
});