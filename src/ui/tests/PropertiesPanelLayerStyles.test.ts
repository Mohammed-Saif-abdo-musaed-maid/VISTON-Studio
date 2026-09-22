import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { PropertiesPanel, BLEND_MODES } from "../panels/PropertiesPanel";
import { EditorEngine } from "../../editor/core/engine";
import { runtime } from "../../editor/core/runtime";
import { useEditorStore } from "../../state/store";
import { pixelStore, maskStore } from "../../editor/core/document";
import { createShapeLayer, createGroupLayer } from "../../editor/layers/layerFactory";
import { emptyLayerStyles, defaultLayerStyle, LayerStyles } from "../../editor/core/types";

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

vi.mock("../../editor/renderer/compositor", () => ({
  compositeToCanvas: vi.fn(() => null),
  renderLayerToCanvas: vi.fn(() => null),
}));

const W = 600;
const H = 400;

// renderToString runs the zustand hook through its server snapshot (the
// store's initial state). We keep the snapshot mirroring the live state so
// the Properties panel can render real content under node.
interface StoreSurface {
  getInitialState: () => { doc: unknown; selectedIds: unknown; dirty: boolean };
}
const storeSurface = () => useEditorStore as unknown as StoreSurface;
const initState = () => storeSurface().getInitialState();

function mirrorInitForSsr(): void {
  const init = initState();
  const live = useEditorStore.getState();
  init.doc = live.doc;
  init.selectedIds = live.selectedIds;
}

const renderPanel = () => {
  mirrorInitForSsr();
  return renderToString(createElement(PropertiesPanel));
};

describe("PropertiesPanel phases 21–25 UI surface", () => {
  let engine: EditorEngine;

  beforeEach(async () => {
    vi.clearAllMocks();
    pixelStore.clear();
    maskStore.clear();
    engine = new EditorEngine();
    runtime.engine = engine;
    runtime.canvas = {
      fitToScreen: vi.fn(),
      resetCamera: vi.fn(),
      requestRender: vi.fn(),
      zoom100: vi.fn(),
      zoomAtVP: vi.fn(),
    } as unknown as typeof runtime.canvas;
    useEditorStore.setState({ doc: null, dirty: false, selectedIds: [], language: "en" });
    const init = initState();
    init.doc = null;
    init.selectedIds = [];
    init.dirty = false;
    await engine.createNewDocument({ width: W, height: H, background: "#ffffff", name: "Panel" });
  });

  afterEach(() => {
    useEditorStore.setState({ doc: null, dirty: false, selectedIds: [] });
  });

  function selectShape(shape: "rect" | "roundedRect" | "star", mutate?: (l: ReturnType<typeof createShapeLayer>) => void): string {
    const sl = createShapeLayer(shape, `Shape ${shape}`);
    sl.transform.width = 120;
    sl.transform.height = 80;
    mutate?.(sl);
    engine.addLayer(sl, "New Shape");
    useEditorStore.getState().setSelected([sl.id]);
    return sl.id;
  }

  it("exposes all 16 blend modes including the previously missing colour modes", () => {
    expect(BLEND_MODES).toHaveLength(16);
    expect(BLEND_MODES).toEqual(
      expect.arrayContaining(["hue", "saturation", "color", "luminosity"])
    );
    selectShape("rect");
    const html = renderPanel();
    for (const v of BLEND_MODES) {
      expect(html, v).toContain(`value="${v}"`);
    }
  });

  it("shows shape geometry editors only for the matching shape kind", () => {
    selectShape("rect");
    let html = renderPanel();
    expect(html).not.toContain("Radius");
    expect(html).not.toContain("Points");
    expect(html).not.toContain("Ratio");

    selectShape("roundedRect", (l) => void (l.cornerRadius = 14));
    html = renderPanel();
    expect(html).toContain("Radius");
    expect(html).toContain('value="14"');

    selectShape("star", (l) => {
      l.points = 8;
      l.starRatio = 0.55;
    });
    html = renderPanel();
    expect(html).toContain("Points");
    expect(html).toContain('value="8"');
    expect(html).toContain("Ratio");
    expect(html).toContain('value="0.55"');
  });

  it("offers non-destructive flip actions per layer", () => {
    selectShape("rect");
    const html = renderPanel();
    expect(html).toContain("Flip H");
    expect(html).toContain("Flip V");
  });

  it("renders the Layer Styles section with add/disable controls", () => {
    selectShape("rect");
    const html = renderPanel();
    expect(html).toContain("Layer Styles");
    expect(html).toContain("Drop Shadow");
    expect(html).toContain("Inner Shadow");
    expect(html).toContain("Outer Glow");
    expect(html).toContain("Inner Glow");
    expect(html).toContain("Stroke");
    expect(html).toContain("Color Overlay");
    expect(html).toContain("Gradient Overlay");
    expect(html).toContain("Bevel &amp; Emboss");
  });

  it("reveals effect editors once a style exists on the layer", () => {
    const id = selectShape("rect");
    const styles = emptyLayerStyles();
    styles.dropShadow = { ...defaultLayerStyle("dropShadow"), offsetX: 3, offsetY: 5 } as LayerStyles["dropShadow"];
    engine.updateLayerMeta(id, { styles } as never);
    engine.flushMetaEdit();
    const html = renderPanel();
    expect(html).toContain("Offset");
    expect(html).toContain('value="3"');
    expect(html).toContain('value="5"');
  });

  it("hides styles from group layers", () => {
    const group = createGroupLayer("Group");
    engine.addLayer(group, "Add Group");
    useEditorStore.getState().setSelected([group.id]);
    const html = renderPanel();
    expect(html).not.toContain("Layer Styles");
  });
});