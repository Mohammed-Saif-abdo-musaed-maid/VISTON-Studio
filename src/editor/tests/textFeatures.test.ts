import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EditorEngine } from "../core/engine";
import { runtime } from "../core/runtime";
import { createTextLayer } from "../layers/layerFactory";
import { TextLayer } from "../core/types";
import { fontString, drawTextLayer, TextStyle } from "../renderer/textRenderer";

const h = vi.hoisted(() => {
  const makeCtx = (canvas: { _data: Uint8ClampedArray; width: number; height: number }): CanvasRenderingContext2D => {
    let _fill = "#ffffff", _stroke = "#ffffff", _font = "12px sans-serif", _baseline = "alphabetic", _dir = "ltr",
      _align = "left", _spacing = "0px", _alpha = 1, _shadowColor = "", _shadowBlur = 0, _shadowX = 0, _shadowY = 0,
      _lineWidth = 1, _join = "miter";
    const cctx: Record<string, unknown> = {
      globalCompositeOperation: "source-over", filter: "none", imageSmoothingEnabled: true,
      get fillStyle() { return _fill; }, set fillStyle(v: string | CanvasGradient) { _fill = String(v); },
      get strokeStyle() { return _stroke; }, set strokeStyle(v: string | CanvasGradient) { _stroke = String(v); },
      get font() { return _font; }, set font(v: string) { _font = v; },
      get lineWidth() { return _lineWidth; }, set lineWidth(v: number) { _lineWidth = v; },
      get lineJoin() { return _join; }, set lineJoin(v: string) { _join = v; },
      get textBaseline() { return _baseline; }, set textBaseline(v: string) { _baseline = v; },
      get direction() { return _dir; }, set direction(v: string) { _dir = v; },
      get textAlign() { return _align; }, set textAlign(v: string) { _align = v; },
      get letterSpacing() { return _spacing; }, set letterSpacing(v: string) { _spacing = v; },
      get globalAlpha() { return _alpha; }, set globalAlpha(v: number) { _alpha = v; },
      get shadowColor() { return _shadowColor; }, set shadowColor(v: string) { _shadowColor = v; },
      get shadowBlur() { return _shadowBlur; }, set shadowBlur(v: number) { _shadowBlur = v; },
      get shadowOffsetX() { return _shadowX; }, set shadowOffsetX(v: number) { _shadowX = v; },
      get shadowOffsetY() { return _shadowY; }, set shadowOffsetY(v: number) { _shadowY = v; },
      setTransform: vi.fn(), save: vi.fn(), restore: vi.fn(), beginPath: vi.fn(), arc: vi.fn(),
      closePath: vi.fn(), rect: vi.fn(), clip: vi.fn(), translate: vi.fn(), scale: vi.fn(), rotate: vi.fn(),
      fill: vi.fn(), stroke: vi.fn(), clearRect: vi.fn(),
      fillText: vi.fn(), strokeText: vi.fn(),
      measureText: vi.fn((s: string) => ({ width: s.length * 5 })),
      createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
      drawImage: vi.fn(),
      fillRect: (x: number, y: number, w: number, ht: number) => {
        for (let py = Math.max(0, y); py < Math.min(canvas.height, y + ht); py++)
          for (let px = Math.max(0, x); px < Math.min(canvas.width, x + w); px++) {
            const i = (py * canvas.width + px) * 4;
            canvas._data[i] = 0; canvas._data[i + 1] = 0; canvas._data[i + 2] = 0; canvas._data[i + 3] = 255;
          }
      },
      getImageData: (x: number, y: number, w: number, ht: number) => {
        const data = new Uint8ClampedArray(Math.max(0, w) * Math.max(0, ht) * 4);
        for (let py = 0; py < ht; py++)
          for (let px = 0; px < w; px++) {
            const si = (Math.min(canvas.height - 1, y + py) * canvas.width + Math.min(canvas.width - 1, x + px)) * 4;
            const di = (py * w + px) * 4;
            data[di] = canvas._data[si] ?? 0; data[di + 1] = canvas._data[si + 1] ?? 0;
            data[di + 2] = canvas._data[si + 2] ?? 0; data[di + 3] = canvas._data[si + 3] ?? 0;
          }
        return { width: w, height: ht, data, colorSpace: "srgb" } as ImageData;
      },
      putImageData: vi.fn(),
      createImageData: (w: number, ht: number) => ({ width: w, height: ht, data: new Uint8ClampedArray(w * ht * 4) }),
    };
    return cctx as unknown as CanvasRenderingContext2D;
  };
  const makeCanvas = (w: number, ht: number): HTMLCanvasElement & { _ctx?: CanvasRenderingContext2D; _data: Uint8ClampedArray } => {
    const bw = Math.max(1, Math.round(w)), bh = Math.max(1, Math.round(ht));
    const c = { width: bw, height: bh, _data: new Uint8ClampedArray(bw * bh * 4), toDataURL: () => "data:image/png;base64,AAAA" } as HTMLCanvasElement & { _ctx?: CanvasRenderingContext2D; _data: Uint8ClampedArray };
    const cctx = makeCtx({ _data: c._data, width: c.width, height: c.height });
    c._ctx = cctx;
    (c as unknown as { getContext: (kind: string) => CanvasRenderingContext2D }).getContext = () => cctx;
    return c;
  };
  return { makeCanvas };
});

vi.mock("../../utils/canvas", () => ({
  createCanvas: vi.fn((w: number, ht: number) => h.makeCanvas(w, ht)),
  getContext2d: vi.fn((c: HTMLCanvasElement & { _ctx?: CanvasRenderingContext2D }) => c._ctx ?? (c.getContext("2d") as CanvasRenderingContext2D)),
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

function fakeCtx() {
  const calls: string[] = [];
  const ctx = {
    font: "", textBaseline: "alphabetic", direction: "ltr", textAlign: "left",
    fillStyle: "#000000", strokeStyle: "#000000", lineWidth: 1, lineJoin: "miter",
    shadowColor: "", shadowBlur: 0, shadowOffsetX: 0, shadowOffsetY: 0,
    letterSpacing: "0px",
    save: vi.fn(() => calls.push("save")),
    restore: vi.fn(() => calls.push("restore")),
    beginPath: vi.fn(), rect: vi.fn(), clip: vi.fn(), scale: vi.fn(), translate: vi.fn(), rotate: vi.fn(),
    measureText: vi.fn((s: string) => ({ width: s.length * 5 })),
    fillText: vi.fn(() => calls.push("fill")),
    strokeText: vi.fn(() => calls.push("stroke")),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  };
  const setter = {
    get fillStyle() { return ctx.fillStyle; },
    set fillStyle(v: string | CanvasGradient) { ctx.fillStyle = String(v); calls.push("fillstyle"); },
  };
  Object.defineProperty(ctx, "fillStyle", setter);
  return {
    ctx: ctx as unknown as CanvasRenderingContext2D,
    getStyle() { return ctx.fillStyle; },
    calls: () => calls,
    shaded: () => ctx.shadowColor !== "" || ctx.shadowBlur > 0 || ctx.shadowOffsetX !== 0 || ctx.shadowOffsetY !== 0,
    stroked: () => ctx.strokeStyle !== "#000000" || ctx.lineWidth > 1,
    lastFont: () => ctx.font,
  };
}

describe("text renderer", () => {
  it("fontString quotes multi-word families and keeps simple ones bare", () => {
    const base: TextStyle = { fontFamily: "Arial", fontSize: 24, fontWeight: 400, fontStyle: "normal", letterSpacing: 0, lineHeight: 1.2, direction: "ltr" };
    expect(fontString(base)).toBe("400 24px Arial");
    expect(fontString({ ...base, fontFamily: "Times New Roman", fontWeight: 700, fontStyle: "italic" })).toBe('italic 600 24px "Times New Roman"');
    expect(fontString({ ...base, fontFamily: "Noto Kufi Arabic" })).toBe('400 24px "Noto Kufi Arabic"');
  });

  it("drawTextLayer applies stroke outline and drop shadow during glyph passes", () => {
    const f = fakeCtx();
    const layer = { ...createTextLayer({ text: "Hi", x: 10, y: 10 }), stroke: "#ff0000", strokeWidth: 3, shadow: { offsetX: 2, offsetY: 3, blur: 4, color: "#000000", opacity: 1 } } as TextLayer;
    drawTextLayer(f.ctx, layer);
    expect(f.calls()).toContain("stroke");
    expect(f.calls()).toContain("fill");
    const i = f.ctx as typeof f.ctx & { strokeStyle: string; lineWidth: number; shadowColor: string; shadowBlur: number; shadowOffsetX: number; shadowOffsetY: number };
    expect(i.strokeStyle).toBe("#ff0000");
    expect(i.lineWidth).toBe(3);
    expect(i.shadowOffsetX).toBe(2);
    expect(i.shadowOffsetY).toBe(3);
    expect(i.shadowColor).toBe("#000000");
  });

  it("drawTextLayer without stroke/shadow issues no outline nor shadow", () => {
    const f = fakeCtx();
    const layer = { ...createTextLayer({ text: "Hi", x: 10, y: 10 }), stroke: null, strokeWidth: 0, shadow: null } as TextLayer;
    drawTextLayer(f.ctx, layer);
    expect(f.calls()).not.toContain("stroke");
    expect(f.calls()).toContain("fill");
  });
});

describe("text layer editing history", () => {
  let engine: EditorEngine;

  beforeEach(async () => {
    engine = new EditorEngine();
    runtime.engine = engine;
    runtime.canvas = canvasEngineStub();
    await engine.createNewDocument({ width: 64, height: 64, background: "#ffffff", name: "T" });
  });

  afterEach(() => {
    runtime.engine = null as unknown as EditorEngine;
    runtime.canvas = null as unknown as typeof runtime.canvas;
  });

  function addText(): string {
    const t = createTextLayer({ text: "Hello", x: 20, y: 20 });
    engine.addLayer(t, "Add text");
    return t.id;
  }

  it("updateTextLayer commits a single undoable entry", () => {
    const id = addText();
    const before = engine.history.items().length;
    engine.updateTextLayer(id, { fontSize: 64 });
    expect(engine.history.items().length).toBe(before + 1);
    expect((engine.doc()!.getLayer(id) as TextLayer).fontSize).toBe(64);
    engine.undo();
    expect((engine.doc()!.getLayer(id) as TextLayer).fontSize).toBe(48);
    engine.redo();
    expect((engine.doc()!.getLayer(id) as TextLayer).fontSize).toBe(64);
  });

  it("beginTextEdit + live updates + commitTextEdit produce exactly one history entry", () => {
    const id = addText();
    const before = engine.history.items().length;
    engine.beginTextEditSession(id);
    engine.updateTextLayerLive(id, { fontWeight: 700 });
    engine.updateTextLayerLive(id, { color: "#112233" });
    engine.updateTextLayerLive(id, { letterSpacing: 4 });
    engine.commitTextEditSession(id);
    expect(engine.history.items().length).toBe(before + 1);
    engine.undo();
    const l = engine.doc()!.getLayer(id) as TextLayer;
    expect(l.fontWeight).toBe(400);
    expect(l.color).toBe("#222222");
    expect(l.letterSpacing).toBe(0);
    engine.redo();
    const l2 = engine.doc()!.getLayer(id) as TextLayer;
    expect(l2.fontWeight).toBe(700);
    expect(l2.letterSpacing).toBe(4);
  });

  it("commitTextEdit without a preceding begin does nothing", () => {
    const id = addText();
    const before = engine.history.items().length;
    engine.updateTextLayerLive(id, { fontSize: 32 });
    engine.commitTextEditSession(id);
    expect(engine.history.items().length).toBe(before);
  });

  it("a stroke+shadow round-trip through the engine stays consistent", () => {
    const id = addText();
    engine.beginTextEditSession(id);
    engine.updateTextLayerLive(id, { stroke: "#ff0000", strokeWidth: 4, shadow: { offsetX: 3, offsetY: -2, blur: 6, color: "#00ff00", opacity: 0.5 } });
    engine.commitTextEditSession(id);
    const l = engine.doc()!.getLayer(id) as TextLayer;
    expect(l.stroke).toBe("#ff0000");
    expect(l.strokeWidth).toBe(4);
    expect(l.shadow?.blur).toBe(6);
  });
});