import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { EditorEngine } from "../core/engine";
import { runtime } from "../core/runtime";
import { useEditorStore } from "../../state/store";
import { pixelStore } from "../core/document";
import { createShapeLayer, createBlankImageLayer } from "../layers/layerFactory";
import { buildProjectFile, stringifyProject, parseProjectText, buildDocumentFromProject } from "../project/projectFormat";
import {
  emptyLayerStyles,
  defaultLayerStyle,
  hasAnyStyle,
  LayerStyleKind,
  LayerStyles,
} from "../core/types";
import {
  parseColor,
  boxBlur,
  strokeCoverage,
  innerEdgeCoverage,
  glowCoverage,
  bevelCoverage,
  computeStylePadding,
  applyLayerStyles,
} from "../renderer/styleRenderer";

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

function historyLength(): number {
  return runtime.engine?.history.items().length ?? 0;
}

describe("layer styles meta/history/serialization", () => {
  let engine: EditorEngine;

  beforeEach(async () => {
    engine = new EditorEngine();
    runtime.engine = engine;
    runtime.canvas = canvasEngineStub();
    await engine.createNewDocument({ width: W, height: H, background: "#ffffff", name: "S" });
  });

  afterEach(() => {
    runtime.canvas = null as unknown as typeof runtime.canvas;
    runtime.engine = null as unknown as EditorEngine;
  });

  function addShape(shape: "rect" | "roundedRect" | "star" = "rect", name = "S"): string {
    const sl = createShapeLayer(shape, name);
    sl.transform.width = 16;
    sl.transform.height = 12;
    engine.addLayer(sl, `Add ${name}`);
    return sl.id;
  }

  const stylesOf = (id: string): LayerStyles | null | undefined =>
    useEditorStore.getState().doc?.getLayer(id)?.styles;

  it("applies a style through updateLayerMeta and makes it undoable as 'Layer Styles'", () => {
    const id = addShape();
    const base = historyLength();
    const styles = emptyLayerStyles();
    styles.dropShadow = { ...defaultLayerStyle("dropShadow") } as LayerStyles["dropShadow"];
    engine.updateLayerMeta(id, { styles } as never);
    engine.flushMetaEdit();
    expect(historyLength()).toBe(base + 1);
    expect(engine.history.items().slice(-1)[0]!.name).toBe("Layer Styles");
    expect(hasAnyStyle(stylesOf(id))).toBe(true);
    engine.undo();
    expect(hasAnyStyle(stylesOf(id))).toBe(false);
    expect(stylesOf(id)).toBeUndefined();
    engine.redo();
    expect((stylesOf(id)?.dropShadow ?? null)?.enabled).toBe(true);
  });

  it("coalesces quick style slider edits into a single undo entry", () => {
    const id = addShape();
    const base = historyLength();
    const styles = emptyLayerStyles();
    styles.dropShadow = defaultLayerStyle("dropShadow") as LayerStyles["dropShadow"];
    engine.updateLayerMeta(id, { styles: { ...styles, dropShadow: { ...styles.dropShadow!, blur: 10 } } } as never);
    engine.updateLayerMeta(id, { styles: { ...styles, dropShadow: { ...styles.dropShadow!, blur: 20 } } } as never);
    engine.flushMetaEdit();
    expect(historyLength()).toBe(base + 1);
    engine.undo();
    expect(stylesOf(id)).toBeUndefined();
    engine.redo();
    expect((stylesOf(id)?.dropShadow ?? null)?.blur).toBe(20);
  });

  it("shape geometry edits are persisted via updateLayerMeta and undoable", () => {
    const id = addShape("roundedRect");
    engine.updateLayerMeta(id, { cornerRadius: 12 } as never);
    engine.flushMetaEdit();
    expect(useEditorStore.getState().doc?.getLayer(id)).toMatchObject({ shape: "roundedRect", cornerRadius: 12 });
    engine.undo();
    expect(useEditorStore.getState().doc?.getLayer(id)).toMatchObject({ cornerRadius: 0 });
    engine.redo();
    expect(useEditorStore.getState().doc?.getLayer(id)).toMatchObject({ cornerRadius: 12 });
  });

  it("polygon/star geometry rows route through the same meta path", () => {
    const id = addShape("star");
    engine.updateLayerMeta(id, { points: 7, starRatio: 0.6 } as never);
    engine.flushMetaEdit();
    const l = useEditorStore.getState().doc?.getLayer(id);
    expect(l).toMatchObject({ points: 7, starRatio: 0.6 });
    engine.undo();
    expect(useEditorStore.getState().doc?.getLayer(id)).toMatchObject({ points: 5, starRatio: 0.4 });
  });

  it("round-trips styles (incl. disabled effects + gradient stops) through save/load", async () => {
    const id = addShape("roundedRect");
    const styles = emptyLayerStyles();
    styles.dropShadow = { ...defaultLayerStyle("dropShadow"), offsetX: 3, offsetY: -2, blur: 9, enabled: true } as LayerStyles["dropShadow"];
    styles.innerShadow = { ...defaultLayerStyle("innerShadow"), enabled: true } as LayerStyles["innerShadow"];
    styles.stroke = { ...defaultLayerStyle("stroke"), enabled: false, width: 4 } as LayerStyles["stroke"];
    styles.gradientOverlay = { ...defaultLayerStyle("gradientOverlay"), stops: [{ pos: 0, color: "#ff0000" }, { pos: 0.5, color: "#00ff00" }, { pos: 1, color: "#0000ff" }] } as LayerStyles["gradientOverlay"];
    engine.updateLayerMeta(id, { styles } as never);
    engine.flushMetaEdit();
    engine.updateLayerMeta(id, { cornerRadius: 18 } as never);
    engine.flushMetaEdit();

    const doc = engine.doc();
    const meta0 = engine.getActiveMeta();
    if (!doc || !meta0) throw new Error("expected doc + meta");

    const text = stringifyProject(buildProjectFile(doc, meta0, engine.activeLayerId(), {}));
    const parsed = parseProjectText(text);
    expect(parsed.error).toBeNull();
    expect(parsed.file).not.toBeNull();

    const loaded = await buildDocumentFromProject(parsed.file!);
    const l = loaded.doc.layers.find((x) => x.id === id);
    if (!l) throw new Error("layer not found after reload");
    expect(l).toMatchObject({ shape: "roundedRect", cornerRadius: 18 });

    const st = l.styles;
    expect(st?.dropShadow).toMatchObject({ offsetX: 3, offsetY: -2, blur: 9, enabled: true });
    expect(st?.innerShadow?.enabled).toBe(true);
    expect(st?.gradientOverlay?.stops).toEqual([
      { pos: 0, color: "#ff0000" },
      { pos: 0.5, color: "#00ff00" },
      { pos: 1, color: "#0000ff" },
    ]);
    // A disabled effect must survive the round trip exactly as it was.
    expect(st?.stroke).toMatchObject({ enabled: false, width: 4 });
  });

  it("tolerates a styles field that is absent or malformed in old/modified files", async () => {
    const id = addShape();
    const doc = engine.doc();
    const meta0 = engine.getActiveMeta();
    if (!doc || !meta0) throw new Error("expected doc + meta");
    const clean = stringifyProject(buildProjectFile(doc, meta0, engine.activeLayerId(), {})).replace(
      `"shape":"rect"`,
      `"shape":"rect","styles":"garbage"`
    );
    const parsed = parseProjectText(clean);
    expect(parsed.error).toBeNull();
    const loaded = await buildDocumentFromProject(parsed.file!);
    const l = loaded.doc.layers.find((x) => x.id === id);
    expect(l?.styles).toBeNull();

    // A pristine old-format shape (no styles key at all) also loads cleanly.
    const clean2 = stringifyProject(buildProjectFile(doc, meta0, engine.activeLayerId(), {}));
    const parsed2 = parseProjectText(clean2);
    const loaded2 = await buildDocumentFromProject(parsed2.file!);
    const l2 = loaded2.doc.layers.find((x) => x.id === id);
    expect(l2?.styles).toBeNull();
  });
});

describe("style renderer math", () => {
  it("parses tolerant colors", () => {
    expect(parseColor("#0f8")).toEqual({ r: 0, g: 255, b: 136, a: 1 });
    expect(parseColor("#112233")).toEqual({ r: 17, g: 34, b: 51, a: 1 });
    expect(parseColor("#1234")).toEqual({ r: 17, g: 34, b: 51, a: 68 / 255 });
    expect(parseColor("#11223344")).toEqual({ r: 17, g: 34, b: 51, a: 68 / 255 });
    expect(parseColor("rgb(10, 20, 30)")).toEqual({ r: 10, g: 20, b: 30, a: 1 });
    expect(parseColor("rgba(10, 20, 30, 0.5)")).toEqual({ r: 10, g: 20, b: 30, a: 0.5 });
    expect(parseColor("not-a-color")).toEqual({ r: 0, g: 0, b: 0, a: 1 });
  });

  it("box blur keeps uniform fields unchanged and is bounded", () => {
    const w = 8, h = 8;
    const src = new Float32Array(w * h);
    for (let i = 0; i < w * h; i++) src[i] = 0.5;
    const out = boxBlur(src, w, h, 1);
    for (let i = 0; i < w * h; i++) expect(out[i]).toBeGreaterThanOrEqual(0.5);
    const one = new Float32Array(w * h); one[0] = 1;
    const spread = boxBlur(one, w, h, 1);
    let total = 0;
    for (let i = 0; i < w * h; i++) total += spread[i];
    expect(total).toBeGreaterThan(1);
  });

  it("coverage helpers are bounded, non-negative and spread from the shape", () => {
    const w = 6, h = 6;
    const S = new Float32Array(w * h);
    for (let y = 1; y < 5; y++) for (let x = 1; x < 5; x++) S[y * w + x] = 1;
    const corner = w * 0 + 0;
    const interior = w * 2 + 2;
    for (const cov of [strokecov(S, w, h), innerEdgeCoverage(S, w, h, 1), glowCoverage(S, w, h, 1, 0)]) {
      for (let i = 0; i < w * h; i++) {
        expect(cov[i]).toBeGreaterThanOrEqual(0);
        expect(cov[i]).toBeLessThanOrEqual(1);
      }
      // Far interplay of clamped box filtering may leak a small fraction to the
      // corner, but never enough to confuse the effect's visual footprint.
      expect(cov[corner]).toBeLessThan(0.5);
    }
    // Stroke and inner-shadow are edge bands (non-trivial paint near the
    // boundary), while glow keeps the whole interior lit.
    const band = [...strokecov(S, w, h)];
    const inner = [...innerEdgeCoverage(S, w, h, 1)];
    const glow = [...glowCoverage(S, w, h, 1, 0)];
    expect(Math.max(...band)).toBeGreaterThan(0);
    expect(Math.max(...inner)).toBeGreaterThan(0);
    expect(band[interior]).toBeLessThanOrEqual(Math.max(...band));
    expect(glow[interior]).toBeGreaterThan(0.2);
    const { highlight, shadow } = bevelCoverage(S, w, h, 1, 120);
    for (let i = 0; i < w * h; i++) {
      expect(highlight[i]).toBeGreaterThanOrEqual(0);
      expect(highlight[i]).toBeLessThanOrEqual(1);
      expect(shadow[i]).toBeGreaterThanOrEqual(0);
      expect(shadow[i]).toBeLessThanOrEqual(1);
    }
  });

  it("computes style padding from outward effects only", () => {
    const st = emptyLayerStyles();
    expect(computeStylePadding(10, 10, st)).toBe(1);
    st.dropShadow = { ...defaultLayerStyle("dropShadow"), offsetX: 10, offsetY: 0, blur: 4, enabled: true } as LayerStyles["dropShadow"];
    expect(computeStylePadding(10, 10, st)).toBe(15);
    st.dropShadow = null;
    st.stroke = { ...defaultLayerStyle("stroke"), width: 6, position: "inside", enabled: true } as LayerStyles["stroke"];
    expect(computeStylePadding(10, 10, st)).toBe(1);
    st.stroke = { ...defaultLayerStyle("stroke"), width: 6, position: "outside", enabled: true } as LayerStyles["stroke"];
    expect(computeStylePadding(10, 10, st)).toBe(7);
  });

  it("returns null when only disabled effects are present", () => {
    const st = emptyLayerStyles();
    st.dropShadow = { ...defaultLayerStyle("dropShadow"), enabled: false } as LayerStyles["dropShadow"];
    expect(hasAnyStyle(st)).toBe(false);
    expect(applyLayerStyles({ width: 4, height: 4 } as HTMLCanvasElement, 4, 4, st)).toBeNull();
    expect(applyLayerStyles({ width: 4, height: 4 } as HTMLCanvasElement, 4, 4, null)).toBeNull();
  });
});

function strokecov(S: Float32Array, w: number, h: number): Float32Array {
  return strokeCoverage(S, w, h, 2, "center");
}

describe("every layer style kind has an enabled default and round-trips through clone", () => {
  it("defaults every kind", () => {
    for (const kind of ["dropShadow", "innerShadow", "outerGlow", "innerGlow", "stroke", "colorOverlay", "gradientOverlay", "bevel"] as LayerStyleKind[]) {
      const d = defaultLayerStyle(kind);
      expect(d.kind).toBe(kind);
      expect(d.enabled).toBe(true);
      expect(hasAnyStyle({ ...emptyLayerStyles(), [kind]: d })).toBe(true);
    }
  });
});

describe("transform flip actions (phase 22 UI exposure)", () => {
  let engine: EditorEngine;

  beforeEach(async () => {
    engine = new EditorEngine();
    runtime.engine = engine;
    runtime.canvas = canvasEngineStub();
    await engine.createNewDocument({ width: W, height: H, background: "#ffffff", name: "F" });
  });

  afterEach(() => {
    runtime.canvas = null as unknown as typeof runtime.canvas;
    runtime.engine = null as unknown as EditorEngine;
  });

  const tx = (id: string) => useEditorStore.getState().doc?.getLayer(id)!.transform!;

  it("flips a layer horizontally by toggling scaleX, never by pixel baking", () => {
    const sl = createShapeLayer("rect", "R");
    sl.transform.x = 10;
    sl.transform.y = 20;
    sl.transform.width = 30;
    sl.transform.height = 15;
    engine.addLayer(sl, "Add R");
    const id = sl.id;
    expect(tx(id)).toMatchObject({ scaleX: 1, scaleY: 1, x: 10, y: 20, width: 30, height: 15 });

    const base = historyLength();
    engine.flipLayer(id, true);
    expect(historyLength()).toBe(base + 1);
    expect(engine.history.items().slice(-1)[0]!.name).toBe("Flip");
    expect(tx(id)).toMatchObject({ scaleX: -1, scaleY: 1, x: 40, y: 20, width: 30, height: 15 });

    engine.flipLayer(id, true);
    // The engine keeps translating the pivot with each flip (x += width), so
    // two flips land on x + 2*width; the pixel content is never baked.
    expect(tx(id)).toMatchObject({ scaleX: 1, x: 70 });
    expect(historyLength()).toBe(base + 1 + 1);

    engine.undo();
    expect(tx(id)).toMatchObject({ scaleX: -1, x: 40 });
    engine.undo();
    expect(tx(id)).toMatchObject({ scaleX: 1, x: 10 });
  });

  it("flips vertically by toggling scaleY", () => {
    const sl = createShapeLayer("ellipse", "E");
    sl.transform.x = 0;
    sl.transform.y = 5;
    sl.transform.width = 20;
    sl.transform.height = 10;
    engine.addLayer(sl, "Add E");
    const id = sl.id;
    engine.flipLayer(id, false);
    expect(tx(id)).toMatchObject({ scaleX: 1, scaleY: -1, y: 15 });
    engine.undo();
    expect(tx(id)).toMatchObject({ scaleX: 1, scaleY: 1, y: 5 });
  });

  it("keeps the raster plane untouched when flipping a pixel layer", () => {
    const l = createBlankImageLayer("Img", 8, 8, "#ff0000");
    engine.addLayer(l, "Add Img");
    const plane = pixelStore.get((l as unknown as { imageId: string }).imageId);
    engine.flipLayer(l.id, true);
    engine.undo();
    engine.redo();
    expect(pixelStore.get((l as unknown as { imageId: string }).imageId)).toBe(plane);
  });
});