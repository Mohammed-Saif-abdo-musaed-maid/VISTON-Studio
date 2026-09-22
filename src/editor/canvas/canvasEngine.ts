import { useEditorStore, type Guide } from "../../state/store";
import { EditorDocument, pixelStore } from "../core/document";
import { Camera, viewportFromEvent } from "./camera";
import { compositeDocument } from "../renderer/compositor";
import { drawShapeLayer } from "../renderer/shapeRenderer";
import type { ShapeLayer } from "../core/types";
import { selectionEngine } from "../selection/selectionEngine";
import { runtime } from "../core/runtime";
import { Vec, vec } from "./math2d";
import { gizmoInfo, gizmoHandleAt, resizeTransform, rotateTransform, skewTransform } from "../transform/transformGizmo";
import type { LayerTransform } from "../core/types";
import { checkerTiles } from "./checker";
import { createAntsTicker } from "./antsTicker";

const CHECKER_SIZE = 10;
const CHECKER_A = "#3a3d44";
const CHECKER_B = "#32353b";

function toolIdleCursor(tool: string): string {
  switch (tool) {
    case "brush":
    case "eraser":
    case "pencil":
    case "bucket":
    case "clone":
    case "heal":
    case "dodge":
    case "burn":
    case "smudge":
    case "selection":
    case "crop":
    case "shape":
    case "gradient":
    case "pen":
      return "crosshair";
    case "text":
      return "text";
    case "hand":
      return "grab";
    case "zoom":
      return "zoom-in";
    default:
      return "default";
  }
}

function stampToolSize(tool: string): number {
  const opts = useEditorStore.getState().toolOptions;
  switch (tool) {
    case "brush": return opts.brush.size;
    case "eraser": return opts.brush.size;
    case "pencil": return opts.pencil.size;
    case "clone": return opts.clone.size;
    case "heal": return opts.heal.size;
    case "dodge": return opts.dodge.size;
    case "burn": return opts.burn.size;
    default: return opts.smudge.size;
  }
}

const STAMP_TOOLS = ["brush", "eraser", "pencil", "clone", "heal", "dodge", "burn", "smudge"];

/**
 * Screen-anchored transparency checkerboard. The tile phase is derived from
 * the viewport position so the grid stays stationary while the document pans
 * or zooms beneath it — matching editor conventions instead of drifting with
 * the page. Parity is resolved from absolute cell indices so the pattern is
 * always perfectly alternating and seamless.
 */
function drawChecker(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number): void {
  const s = CHECKER_SIZE;
  ctx.save();
  ctx.beginPath();
  ctx.rect(Math.max(0, x), Math.max(0, y), Math.max(0, w), Math.max(0, h));
  ctx.clip();
  for (const t of checkerTiles(x, y, w, h, s)) {
    ctx.fillStyle = t.light ? CHECKER_A : CHECKER_B;
    ctx.fillRect(t.x, t.y, t.size + 0.5, t.size + 0.5);
  }
  ctx.restore();
}

export interface CanvasEngine {
  resize(): void;
  requestRender(): void;
  resetCamera(): void;
  element(): HTMLCanvasElement;
  zoomAtVP(vp: Vec, factor: number): void;
  zoomTo(factor: number): void;
  fitToScreen(): void;
  zoom100(): void;
  docFromVP(vp: Vec): Vec;
  vpFromDoc(doc: Vec): Vec;
  destroy(): void;
}

export function createCanvasEngine(parent: HTMLElement): CanvasEngine {
  const canvas = document.createElement("canvas");
  canvas.className = "vs-canvas-element";
  parent.appendChild(canvas);
  const ctx = canvas.getContext("2d", { willReadFrequently: true })!;
  const camera = new Camera();
  let dpr = window.devicePixelRatio || 1;
  let needsRender = true;
  let renderRAF = 0;
  const antsTicker = createAntsTicker({
    requestFrame: requestAnimationFrame,
    cancelFrame: cancelAnimationFrame,
    shouldRun: () => getDoc() !== null && selectionEngine.hasSelection && !selectionEngine.isHidden(),
    onFrame: () => {
      needsRender = true;
      scheduleRender();
    },
  });
  let viewW = 800;
  let viewH = 600;
  let pendingCursor: { x: number; y: number; rgb: { r: number; g: number; b: number; a: number } | null } | null = null;
  let cursorScheduled = false;
  let compositeCache: HTMLCanvasElement | null = null;
  let compositeCacheVersion = -1;
  let lastRenderError: string | null = null;
  let isPanning = false;
  let panStart: Vec = { x: 0, y: 0 };
  let panCameraStart: Vec = { x: 0, y: 0 };
  let spaceHeld = false;
  let lastPointerVP: Vec = { x: 0, y: 0 };
  let brushPreviewVP: Vec = { x: 0, y: 0 };
  let brushPreviewVisible = false;
  let cropDrag: { handle: string; x: number; y: number; rect: { x: number; y: number; width: number; height: number } } | null = null;
  let gizmoDrag: { handle: string; id: string; before: LayerTransform } | null = null;
  let guideDrag: { id: string; orientation: "h" | "v"; fromRuler: boolean; startPos: number; beforeGuides: Guide[] } | null = null;

  const HANDLE_HIT_PX = 8;

  function cropHandleAt(docP: { x: number; y: number }): string | null {
    const rect = runtime.engine?.getCropRectForRender();
    if (!rect || rect.width <= 0 || rect.height <= 0) return null;
    const vp = vpFromDoc(docP);
    const coords = [
      ["nw", rect.x, rect.y], ["n", rect.x + rect.width / 2, rect.y], ["ne", rect.x + rect.width, rect.y],
      ["w", rect.x, rect.y + rect.height / 2], ["e", rect.x + rect.width, rect.y + rect.height / 2],
      ["sw", rect.x, rect.y + rect.height], ["s", rect.x + rect.width / 2, rect.y + rect.height], ["se", rect.x + rect.width, rect.y + rect.height],
    ];
    const best = { name: null as string | null, d: Infinity };
    for (const [name, dx, dy] of coords) {
      const p = vpFromDoc({ x: dx as number, y: dy as number });
      const dist = Math.hypot(p.x - vp.x, p.y - vp.y);
      if (dist < best.d) { best.name = name as string; best.d = dist; }
    }
    return best.d <= HANDLE_HIT_PX ? best.name : null;
  }

  const docFromVP = (vp: Vec) => camera.toDoc(vp.x, vp.y);
  const vpFromDoc = (doc: Vec) => camera.toViewport(doc.x, doc.y);

  function getDoc(): EditorDocument | null {
    return useEditorStore.getState().doc;
  }

  /**
   * Surface a compositing failure instead of silently leaving the viewport
   * black. A document whose drawing surfaces cannot be allocated (e.g. an
   * oversized canvas, or a transient GPU/context failure) used to throw inside
   * the rAF callback, which permanently wedged the render loop with no message.
   */
  function reportRenderError(message: string): void {
    if (lastRenderError === message) return;
    lastRenderError = message;
    useEditorStore.setState({ lastError: message, status: message });
  }

  function resize(): void {
    const rect = parent.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    viewW = Math.floor(rect.width);
    viewH = Math.floor(rect.height);
    canvas.width = Math.max(1, viewW * dpr);
    canvas.height = Math.max(1, viewH * dpr);
    canvas.style.width = viewW + "px";
    canvas.style.height = viewH + "px";
    needsRender = true;
    scheduleRender();
  }

  function resetCamera(): void {
    const doc = getDoc();
    if (!doc) return;
    camera.apply(doc.width, doc.height, viewW, viewH);
    useEditorStore.setState({ zoomDisplay: Math.round(camera.zoom * 10000) / 100 });
    needsRender = true;
    scheduleRender();
  }

  function fitToScreen(): void {
    resetCamera();
  }

  function zoom100(): void {
    const doc = getDoc();
    if (!doc) return;
    const vw = viewW;
    const vh = viewH;
    camera.zoom = 1;
    camera.x = (vw - doc.width) / 2;
    camera.y = (vh - doc.height) / 2;
    useEditorStore.setState({ zoomDisplay: 100 });
    needsRender = true;
    scheduleRender();
  }

  function zoomTo(factor: number): void {
    const doc = getDoc();
    if (!doc) return;
    const cx = viewW / 2;
    const cy = viewH / 2;
    const oldFactor = camera.zoom;
    camera.zoom = factor;
    camera.x = cx - (cx - camera.x) * (factor / oldFactor);
    camera.y = cy - (cy - camera.y) * (factor / oldFactor);
    camera.clamp(doc.width, doc.height, viewW, viewH);
    useEditorStore.setState({ zoomDisplay: Math.round(camera.zoom * 10000) / 100 });
    needsRender = true;
    scheduleRender();
  }

  function zoomAtVP(vp: Vec, factor: number): void {
    const doc = getDoc();
    if (!doc) return;
    const oldFactor = camera.zoom;
    camera.zoom = Math.max(0.02, Math.min(64, camera.zoom * factor));
    camera.x = vp.x - (vp.x - camera.x) * (camera.zoom / oldFactor);
    camera.y = vp.y - (vp.y - camera.y) * (camera.zoom / oldFactor);
    camera.clamp(doc.width, doc.height, viewW, viewH);
    useEditorStore.setState({ zoomDisplay: Math.round(camera.zoom * 10000) / 100 });
    needsRender = true;
    scheduleRender();
  }

  function scheduleRender(): void {
    if (renderRAF) return;
    renderRAF = requestAnimationFrame(render);
  }

  /**
   * Keeps the marching-ants selection overlay animated even while the user is
   * idle. Each frame refreshes the phase (performance.now()-driven dash offset)
   * and self-schedules until the selection is dismissed or the engine resets.
   * Managed by the idempotent antsTicker (single loop, self-stop, no leaks).
   */
  function startAntsLoop(): void {
    antsTicker.start();
  }

  function render(): void {
    renderRAF = 0;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewW, viewH);
    ctx.fillStyle = "#1b1e24";
    ctx.fillRect(0, 0, viewW, viewH);
    const doc = getDoc();
    if (!doc) { drawRulers(); return; }
    const docW = doc.width;
    const docH = doc.height;
    const s = camera.zoom;
    const tl = vpFromDoc({ x: 0, y: 0 });
    const br = vpFromDoc({ x: docW, y: docH });
    const bw = br.x - tl.x;
    const bh = br.y - tl.y;
    ctx.fillStyle = "#282c33";
    ctx.fillRect(tl.x, tl.y, bw, bh);
    if (bw > 0 && bh > 0) drawChecker(ctx, tl.x, tl.y, bw, bh);
    drawArtboardBackgrounds(s);
    const cacheVersion = runtime.engine?.version ?? -1;
    if (needsRender || compositeCacheVersion !== cacheVersion || !compositeCache || compositeCache.width !== docW || compositeCache.height !== docH) {
      if (!compositeCache || compositeCache.width !== docW || compositeCache.height !== docH) {
        compositeCache = document.createElement("canvas");
        compositeCache.width = Math.max(1, docW);
        compositeCache.height = Math.max(1, docH);
      }
      const cctx = compositeCache.getContext("2d", { willReadFrequently: false });
      if (!cctx) {
        reportRenderError("Unable to render the document: the browser could not allocate a drawing surface (the canvas may be too large).");
        needsRender = false;
        drawRulers();
        return;
      }
      try {
        cctx.setTransform(1, 0, 0, 1, 0, 0);
        cctx.clearRect(0, 0, docW, docH);
        compositeDocument(cctx, doc, { pixels: pixelStore }, true);
        compositeCacheVersion = cacheVersion;
        lastRenderError = null;
      } catch (err) {
        reportRenderError(`Unable to render the document: ${(err as Error).message}`);
        needsRender = false;
        drawRulers();
        return;
      }
    }
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(compositeCache, tl.x, tl.y, bw, bh);
    drawGrid(docW, docH, s);
    drawSelectionOverlay(docW, docH, s);
    drawShapeDraft(s);
    drawCropOverlay(docW, docH);
    drawTransformGizmo();
    drawPenPreview(docW, docH, s);
    drawGuides(docW, docH, s);
    drawArtboards(s);
    drawSnapLines(s);
    if (brushPreviewVisible) drawBrushPreview(docW, docH, s);
    drawRulers();
    if (selectionEngine.hasSelection && !selectionEngine.isHidden()) startAntsLoop();
    needsRender = false;
  }

  function drawGrid(docW: number, docH: number, zoom: number): void {
    const st = useEditorStore.getState();
    if (!st.showGrid) return;
    const settings = st.gridSettings;
    const minor = settings.spacing / Math.max(1, settings.subdivisions);
    // Keep lines legible: never draw a step smaller than ~6 screen px.
    const minScreenPx = 6;
    const majorStep = Math.max(settings.spacing, Math.ceil(minScreenPx / zoom));
    const minorStep = minor >= minScreenPx / zoom ? minor : majorStep;
    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(zoom, zoom);
    if (minorStep < majorStep) {
      ctx.beginPath();
      for (let x = minorStep; x < docW; x += minorStep) {
        if (Math.abs(x / majorStep - Math.round(x / majorStep)) < 1e-6) continue;
        ctx.moveTo(x, 0);
        ctx.lineTo(x, docH);
      }
      for (let y = minorStep; y < docH; y += minorStep) {
        if (Math.abs(y / majorStep - Math.round(y / majorStep)) < 1e-6) continue;
        ctx.moveTo(0, y);
        ctx.lineTo(docW, y);
      }
      ctx.strokeStyle = "rgba(255,255,255,0.05)";
      ctx.lineWidth = 1 / zoom;
      ctx.stroke();
    }
    ctx.beginPath();
    for (let x = 0; x <= docW; x += majorStep) { ctx.moveTo(x, 0); ctx.lineTo(x, docH); }
    for (let y = 0; y <= docH; y += majorStep) { ctx.moveTo(0, y); ctx.lineTo(docW, y); }
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 1 / zoom;
    ctx.stroke();
    ctx.restore();
  }

  function drawRulers(): void {
    if (!useEditorStore.getState().showRulers) return;
    const rulerW = 24;
    ctx.save();
    ctx.fillStyle = "#23272e";
    ctx.fillRect(0, 0, viewW, rulerW);
    ctx.fillRect(0, 0, rulerW, viewH);
    ctx.fillStyle = "#6b7280";
    ctx.font = "9px system-ui";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    const doc = getDoc();
    if (doc) {
      const interval = camera.zoom >= 4 ? 16 : camera.zoom >= 1 ? 32 : 64;
      for (let d = 0; d <= doc.width; d += interval) {
        const vp = vpFromDoc({ x: d, y: 0 });
        if (vp.x > rulerW && vp.x < viewW) {
          ctx.fillStyle = "#4b5563";
          ctx.fillRect(vp.x, 0, 1, rulerW);
          ctx.fillStyle = "#6b7280";
          ctx.fillText(String(d), vp.x, rulerW - 12);
        }
      }
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      for (let d = 0; d <= doc.height; d += interval) {
        const vp = vpFromDoc({ x: 0, y: d });
        if (vp.y > rulerW && vp.y < viewH) {
          ctx.fillStyle = "#4b5563";
          ctx.fillRect(0, vp.y, rulerW, 1);
          ctx.fillStyle = "#6b7280";
          ctx.save();
          ctx.translate(rulerW - 4, vp.y);
          ctx.rotate(-Math.PI / 2);
          ctx.fillText(String(d), 0, 0);
          ctx.restore();
        }
      }
    }
    ctx.fillStyle = "#374151";
    ctx.fillRect(rulerW - 1, 0, 1, viewH);
    ctx.fillRect(0, rulerW - 1, viewW, 1);
    ctx.restore();
  }

  function drawSelectionOverlay(docW: number, docH: number, zoom: number): void {
    if (!selectionEngine.hasSelection || selectionEngine.isHidden()) {
      drawLiveLasso(zoom);
      return;
    }
    const shape = selectionEngine.shape;
    const tracePath = () => {
      ctx.beginPath();
      if (!shape) return;
      if (shape.kind === "lasso" && shape.lassoPath && shape.lassoPath.length >= 2) {
        ctx.moveTo(shape.lassoPath[0][0], shape.lassoPath[0][1]);
        for (let i = 1; i < shape.lassoPath.length; i++) ctx.lineTo(shape.lassoPath[i][0], shape.lassoPath[i][1]);
        ctx.closePath();
      } else if (shape.kind === "rect") {
        ctx.rect(shape.x, shape.y, shape.width, shape.height);
      } else {
        ctx.ellipse(shape.x + shape.width / 2, shape.y + shape.height / 2, shape.width / 2, shape.height / 2, 0, 0, Math.PI * 2);
      }
    };
    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(zoom, zoom);
    const lineW = 1.5 / zoom;
    ctx.setLineDash([4 / zoom, 3 / zoom]);
    ctx.lineDashOffset = (performance.now() / 50) % 7 / zoom;
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = lineW;
    tracePath();
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.strokeStyle = "#000000";
    ctx.lineDashOffset = (performance.now() / 50 + 3.5) % 7 / zoom;
    ctx.setLineDash([4 / zoom, 3 / zoom]);
    tracePath();
    ctx.stroke();
    ctx.restore();
    void docW; void docH;
  }

  function drawLiveLasso(zoom: number): void {
    const tool = useEditorStore.getState().tool;
    if (tool !== "selection") return;
    const opts = useEditorStore.getState().toolOptions.selection;
    if (opts.useWand || opts.shape !== "lasso") return;
    const path = selectionEngine.shape?.kind === "lasso" ? selectionEngine.shape.lassoPath : null;
    if (!path || path.length < 2) return;
    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(zoom, zoom);
    ctx.beginPath();
    ctx.moveTo(path[0][0], path[0][1]);
    for (let i = 1; i < path.length; i++) ctx.lineTo(path[i][0], path[i][1]);
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([5 / zoom, 4 / zoom]);
    ctx.stroke();
    ctx.restore();
  }

  function drawShapeDraft(zoom: number): void {
    const draft = runtime.engine?.getShapeDraftRect();
    if (!draft) return;
    const opts = useEditorStore.getState().toolOptions.shape;
    const temp: ShapeLayer = {
      id: "__draft__",
      name: "Draft",
      type: "shape",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "normal",
      transform: { x: draft.x, y: draft.y, width: draft.width, height: draft.height, rotation: 0 } as LayerTransform,
      parentId: null,
      clipTo: null,
      mask: null,
      shape: draft.kind,
      fill: opts.fill,
      stroke: opts.stroke,
      strokeWidth: opts.strokeWidth,
      cornerRadius: opts.cornerRadius,
      points: opts.points,
      starRatio: opts.starRatio,
    };
    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(zoom, zoom);
    drawShapeLayer(ctx, temp);
    ctx.restore();
  }

  function drawCropOverlay(docW: number, docH: number): void {
  const rect = runtime.engine?.getCropRectForRender();
  if (!rect) return;
  const zoom = camera.zoom;
  const x = rect.x, y = rect.y, w = rect.width, h = rect.height;
  const x1 = x + w, y1 = y + h;
  void docW; void docH;
  ctx.save();
  ctx.translate(camera.x, camera.y);
  ctx.scale(zoom, zoom);

  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(-200000, -200000, w + 400000, Math.max(0, y));
  ctx.fillRect(-200000, y1, w + 400000, Math.max(0, 200000));
  ctx.fillRect(-200000, y, Math.max(0, x), h);
  ctx.fillRect(x1, y, Math.max(0, 200000), h);

  const lw = 1.5 / zoom;
  ctx.strokeStyle = "#ffffff";
  ctx.lineWidth = lw;
  ctx.strokeRect(x, y, w, h);

  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = lw / 2;
  ctx.beginPath();
  for (let f = 1; f <= 2; f++) {
    ctx.moveTo(x + (w * f) / 3, y); ctx.lineTo(x + (w * f) / 3, y1);
    ctx.moveTo(x, y + (h * f) / 3); ctx.lineTo(x1, y + (h * f) / 3);
  }
  ctx.stroke();

  const hs = 6 / zoom;
  const handles = [
    [x, y, "nw"], [x1, y, "ne"], [x, y1, "sw"], [x1, y1, "se"],
    [x + w / 2, y, "n"], [x + w / 2, y1, "s"], [x, y + h / 2, "w"], [x1, y + h / 2, "e"],
  ] as const;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#1b1e24";
  ctx.lineWidth = 1 / zoom;
  for (const [hx, hy] of handles) {
    ctx.beginPath();
    ctx.rect(hx - hs, hy - hs, hs * 2, hs * 2);
    ctx.fill();
    ctx.stroke();
  }
  ctx.restore();
}

function getSelectedTransform(): LayerTransform | null {
  const ids = useEditorStore.getState().selectedIds;
  const id = ids[0];
  if (!id) return null;
  const eng = runtime.engine;
  if (!eng) return null;
  const doc = eng.doc();
  return (doc && doc.getLayer(id)?.transform) ?? null;
}

function drawTransformGizmo(): void {
  const tool = useEditorStore.getState().tool;
  if (tool !== "move" || gizmoDrag) return;
  const t = getSelectedTransform();
  if (!t) return;
  const zoom = camera.zoom;
  const info = gizmoInfo(t);
  const rh = (() => {
    const { points, center, axisV } = info;
    const dist = Math.max(Math.hypot(points.ne.x - points.nw.x, points.ne.y - points.nw.y), 40);
    return {
      x: center.x - axisV.x * (dist / 2 + 26),
      y: center.y - axisV.y * (dist / 2 + 26),
    };
  })();
  ctx.save();
  ctx.translate(camera.x, camera.y);
  ctx.scale(zoom, zoom);
  const lw = 1.5 / zoom;
  const names = ["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const;
  ctx.strokeStyle = "#4a9eff";
  ctx.lineWidth = lw;
  ctx.beginPath();
  const pts = names.map((n) => info.points[n]);
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.stroke();
  const hs = 5 / zoom;
  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "#1b1e24";
  ctx.lineWidth = 1 / zoom;
  for (const n of names) {
    const p = info.points[n];
    ctx.beginPath();
    ctx.rect(p.x - hs, p.y - hs, hs * 2, hs * 2);
    ctx.fill();
    ctx.stroke();
  }
  const top = info.points.n;
  ctx.beginPath();
  ctx.moveTo(top.x, top.y);
  ctx.lineTo(rh.x, rh.y);
  ctx.stroke();
  const rs = 5 / zoom;
  ctx.beginPath();
  ctx.arc(rh.x, rh.y, rs, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  const skewGlyph = (p: { x: number; y: number }, hor: boolean) => {
    const half = 2 / zoom;
    ctx.fillStyle = "#ffb04a";
    ctx.strokeStyle = "#1b1e24";
    ctx.lineWidth = 1 / zoom;
    const tri = (tipX: number, tipY: number, b1x: number, b1y: number, b2x: number, b2y: number) => {
      ctx.beginPath();
      ctx.moveTo(tipX, tipY);
      ctx.lineTo(b1x, b1y);
      ctx.lineTo(b2x, b2y);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    };
    if (hor) {
      tri(p.x + half + half, p.y, p.x + half - half, p.y - half, p.x + half - half, p.y + half);
      tri(p.x - half - half, p.y, p.x - half + half, p.y - half, p.x - half + half, p.y + half);
    } else {
      tri(p.x, p.y + half + half, p.x - half, p.y + half - half, p.x + half, p.y + half - half);
      tri(p.x, p.y - half - half, p.x - half, p.y - half + half, p.x + half, p.y - half + half);
    }
  };
  skewGlyph(info.points.n, true);
  skewGlyph(info.points.s, true);
  skewGlyph(info.points.w, false);
  skewGlyph(info.points.e, false);
  ctx.restore();
}

  function drawBrushPreview(_docW: number, _docH: number, zoom: number): void {
    const tool = useEditorStore.getState().tool;
    if (!STAMP_TOOLS.includes(tool) || tool === "smudge") { brushPreviewVisible = false; return; }
    const size = stampToolSize(tool);
    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(zoom, zoom);
    const doc = docFromVP(brushPreviewVP);
    ctx.beginPath();
    ctx.arc(doc.x, doc.y, size / 2, 0, Math.PI * 2);
    ctx.strokeStyle = tool === "eraser" ? "rgba(255,100,100,0.7)" : "rgba(255,255,255,0.7)";
    ctx.lineWidth = 1 / zoom;
    ctx.stroke();
    ctx.restore();
  }

  function drawPenPreview(_docW: number, _docH: number, zoom: number): void {
    const tool = useEditorStore.getState().tool;
    if (tool !== "pen") return;
    const pts = runtime.engine?.getPenPreview();
    if (!pts || pts.length === 0) return;
    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(zoom, zoom);
    ctx.beginPath();
    ctx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1]);
    const hover = docFromVP(brushPreviewVP);
    ctx.lineTo(hover.x, hover.y);
    ctx.strokeStyle = "rgba(255,255,255,0.85)";
    ctx.lineWidth = 1.5 / zoom;
    ctx.setLineDash([6 / zoom, 4 / zoom]);
    ctx.stroke();
    ctx.setLineDash([]);
    for (let i = 0; i < pts.length; i++) {
      ctx.beginPath();
      ctx.arc(pts[i][0], pts[i][1], 2.5 / zoom, 0, Math.PI * 2);
      ctx.fillStyle = i === 0 ? "#ff4a4a" : "#4a9eff";
      ctx.fill();
      ctx.strokeStyle = "#1b1e24";
      ctx.lineWidth = 1 / zoom;
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawGuides(docW: number, docH: number, zoom: number): void {
    const st = useEditorStore.getState();
    if (!st.showGuides || st.guides.length === 0) return;
    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(zoom, zoom);
    ctx.strokeStyle = "rgba(255,59,92,0.9)";
    ctx.lineWidth = 1 / zoom;
    ctx.beginPath();
    for (const g of st.guides) {
      if (g.orientation === "v") {
        ctx.moveTo(g.position, 0);
        ctx.lineTo(g.position, docH);
      } else {
        ctx.moveTo(0, g.position);
        ctx.lineTo(docW, g.position);
      }
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawArtboardBackgrounds(zoom: number): void {
    const abs = useEditorStore.getState().artboards;
    if (abs.length === 0) return;
    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(zoom, zoom);
    for (const ab of abs) {
      if (!ab.visible || !ab.background) continue;
      ctx.fillStyle = ab.background;
      ctx.fillRect(ab.x, ab.y, ab.width, ab.height);
    }
    ctx.restore();
  }

  function drawArtboards(zoom: number): void {
    const st = useEditorStore.getState();
    if (st.artboards.length === 0) return;
    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(zoom, zoom);
    ctx.font = `${Math.max(10, 12 / zoom)}px system-ui`;
    ctx.textBaseline = "bottom";
    for (const ab of st.artboards) {
      if (!ab.visible) continue;
      const isActive = ab.id === st.activeArtboardId;
      ctx.strokeStyle = isActive ? "#4a9eff" : "rgba(120,170,255,0.7)";
      ctx.lineWidth = (isActive ? 2 : 1) / zoom;
      ctx.strokeRect(ab.x, ab.y, ab.width, ab.height);
      ctx.fillStyle = isActive ? "#4a9eff" : "rgba(120,170,255,0.9)";
      ctx.fillText(ab.name, ab.x, ab.y - 3 / zoom);
    }
    ctx.restore();
  }

  function drawSnapLines(zoom: number): void {
    const lines = runtime.engine?.snapLines ?? [];
    if (lines.length === 0) return;
    ctx.save();
    ctx.translate(camera.x, camera.y);
    ctx.scale(zoom, zoom);
    ctx.strokeStyle = "#ff3b5c";
    ctx.lineWidth = 1 / zoom;
    ctx.setLineDash([4 / zoom, 3 / zoom]);
    ctx.beginPath();
    for (const l of lines) {
      if (l.axis === "x") {
        ctx.moveTo(l.position, l.from);
        ctx.lineTo(l.position, l.to);
      } else {
        ctx.moveTo(l.from, l.position);
        ctx.lineTo(l.to, l.position);
      }
    }
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  // ── Pointer handling ──

  function handlePointerDown(e: PointerEvent): void {
    const vp = viewportFromEvent(e, canvas);
    const docP = docFromVP(vp);
    lastPointerVP = vp;
    const tool = useEditorStore.getState().tool;
    if (e.button === 1 || spaceHeld || tool === "hand") {
      isPanning = true;
      panStart = { x: e.clientX, y: e.clientY };
      panCameraStart = { x: camera.x, y: camera.y };
      canvas.style.cursor = "grabbing";
      return;
    }
    const engine = runtime.engine;
    if (tool === "zoom") {
      if (e.shiftKey || e.button === 2) zoomAtVP(vp, 1 / 1.3);
      else zoomAtVP(vp, 1.3);
      return;
    }
    if (tool === "crop") {
      const handle = cropHandleAt(docP);
      const rect = runtime.engine?.getCropRectForRender();
      if (handle && rect) {
        cropDrag = { handle, x: docP.x, y: docP.y, rect: { ...rect } };
        return;
      }
      cropDrag = null;
    }
    if (tool === "move") {
      const t = getSelectedTransform();
      if (t) {
        const handle = gizmoHandleAt(t, docP, 8, camera.zoom);
        if (handle) {
          const ids = useEditorStore.getState().selectedIds;
          const id = ids[0];
          if (id) {
            gizmoDrag = { handle, id, before: { ...t } };
            return;
          }
        }
      }
    }
    if (useEditorStore.getState().showRulers) {
      const RULER_W = 24;
      const inTop = vp.y <= RULER_W && vp.x > RULER_W;
      const inLeft = vp.x <= RULER_W && vp.y > RULER_W;
      if ((inTop || inLeft) && !spaceHeld) {
        const orientation: "h" | "v" = inTop ? "h" : "v";
        const pos = orientation === "h" ? docP.y : docP.x;
        const existing = useEditorStore.getState().guides.find((g) =>
          Math.abs(g.position - pos) < 8 && g.orientation === orientation
        );
        useEditorStore.setState({ showGuides: true });
        const beforeGuides = useEditorStore.getState().guides.map((g) => ({ ...g }));
        const id = existing ? existing.id : useEditorStore.getState().addGuide(orientation, pos);
        guideDrag = { id, orientation, fromRuler: !existing, startPos: pos, beforeGuides };
        return;
      }
    }
    if (engine) engine.handlePointerDown(tool, vp, docP, e);
  }

  function handlePointerMove(e: PointerEvent): void {
    const vp = viewportFromEvent(e, canvas);
    const docP = docFromVP(vp);
    lastPointerVP = vp;
    brushPreviewVP = vp;
    brushPreviewVisible = STAMP_TOOLS.includes(useEditorStore.getState().tool);
    if (isPanning) {
      camera.x = panCameraStart.x + (e.clientX - panStart.x);
      camera.y = panCameraStart.y + (e.clientY - panStart.y);
      needsRender = true;
      scheduleRender();
      return;
    }
    if (cropDrag) {
      const r0 = cropDrag.rect;
      const h = cropDrag.handle;
      const dx = docP.x - cropDrag.x;
      const dy = docP.y - cropDrag.y;
      let x0 = r0.x, y0 = r0.y, x1 = r0.x + r0.width, y1 = r0.y + r0.height;
      if (h === "nw" || h === "w" || h === "sw") x0 = r0.x + dx;
      if (h === "ne" || h === "e" || h === "se") x1 = r0.x + r0.width + dx;
      if (h === "nw" || h === "n" || h === "ne") y0 = r0.y + dy;
      if (h === "sw" || h === "s" || h === "se") y1 = r0.y + r0.height + dy;
      const minS = 4;
      if (x1 - x0 < minS) x1 = x0 + minS;
      if (y1 - y0 < minS) y1 = y0 + minS;
      const aspect = useEditorStore.getState().toolOptions.crop.aspect;
      if (aspect === "1:1") {
        const m = Math.max(x1 - x0, y1 - y0);
        x1 = x0 + m; y1 = y0 + m;
      } else if (aspect === "4:3") {
        const m = Math.max((x1 - x0) / 4, (y1 - y0) / 3);
        x1 = x0 + m * 4; y1 = y0 + m * 3;
      } else if (aspect === "16:9") {
        const m = Math.max((x1 - x0) / 16, (y1 - y0) / 9);
        x1 = x0 + m * 16; y1 = y0 + m * 9;
      }
      if (x0 < 0) { x1 -= x0; x0 = 0; }
      if (y0 < 0) { y1 -= y0; y0 = 0; }
      const docD = getDoc();
      if (docD && x1 > docD.width) { x0 -= (x1 - docD.width); x1 = docD.width; if (x0 < 0) x0 = 0; }
      if (docD && y1 > docD.height) { y0 -= (y1 - docD.height); y1 = docD.height; if (y0 < 0) y0 = 0; }
      runtime.engine?.setCropRect({ x: x0, y: y0, width: x1 - x0, height: y1 - y0 });
      return;
    }
    if (gizmoDrag) {
      const d = getDoc();
      const layer = d?.getLayer(gizmoDrag.id);
      if (layer) {
        const shift = e.shiftKey;
        const usingSkew = e.altKey && (gizmoDrag.handle === "n" || gizmoDrag.handle === "s" || gizmoDrag.handle === "e" || gizmoDrag.handle === "w");
        const nt = gizmoDrag.handle === "rotate"
          ? rotateTransform(layer.transform, docP)
          : usingSkew
            ? skewTransform(layer.transform, gizmoDrag.handle, docP)
            : resizeTransform(layer.transform, gizmoDrag.handle, docP, shift);
        runtime.engine?.updateLayerTransformLive(gizmoDrag.id, nt as LayerTransform);
      }
      return;
    }
    if (guideDrag) {
      const pos = guideDrag.orientation === "h" ? docP.y : docP.x;
      useEditorStore.getState().moveGuide(guideDrag.id, pos);
      needsRender = true;
      scheduleRender();
      return;
    }
    const tool = useEditorStore.getState().tool;
    if (e.buttons === 0) {
      if (spaceHeld) {
        canvas.style.cursor = "grab";
      } else if (tool === "crop") {
        const handle = cropHandleAt(docP);
        const cursorMap: Record<string, string> = { nw: "nw-resize", n: "n-resize", ne: "ne-resize", w: "w-resize", e: "e-resize", sw: "sw-resize", s: "s-resize", se: "se-resize" };
        canvas.style.cursor = handle ? (cursorMap[handle] ?? "crosshair") : "crosshair";
      } else if (tool === "move") {
        const t = getSelectedTransform();
        const handle = t ? gizmoHandleAt(t, docP, 8, camera.zoom) : null;
        const cursorMap: Record<string, string> = { nw: "nw-resize", n: "n-resize", ne: "ne-resize", w: "w-resize", e: "e-resize", sw: "sw-resize", s: "s-resize", se: "se-resize", rotate: "grab" };
        canvas.style.cursor = handle ? (cursorMap[handle] ?? "default") : "default";
      } else {
        const idle = toolIdleCursor(tool);
        canvas.style.cursor = idle ?? "";
      }
    }
    runtime.engine?.handlePointerMove(tool, vp, docP, e);
    const doc = getDoc();
    if (doc) {
      const px = Math.round(docP.x);
      const py = Math.round(docP.y);
      const rgb = runtime.engine?.samplePixelInDoc(docP.x, docP.y) ?? null;
      pendingCursor = { x: px, y: py, rgb };
      if (!cursorScheduled) {
        cursorScheduled = true;
        requestAnimationFrame(() => {
          cursorScheduled = false;
          if (pendingCursor) {
            useEditorStore.setState({ cursor: pendingCursor });
            pendingCursor = null;
          }
        });
      }
    }
  }

  function handlePointerUp(e: PointerEvent): void {
    if (cropDrag) { cropDrag = null; }
    if (guideDrag) {
      const g = useEditorStore.getState().guides.find((x) => x.id === guideDrag?.id);
      if (guideDrag.fromRuler && g && Math.abs(g.position - guideDrag.startPos) < 1) {
        useEditorStore.getState().removeGuide(g.id);
      }
      runtime.engine?.commitGuideEdit(guideDrag.beforeGuides);
      guideDrag = null;
      needsRender = true;
      scheduleRender();
    }
    if (gizmoDrag) {
      const name = gizmoDrag.handle === "rotate" ? "Rotate Layer" : "Resize Layer";
      runtime.engine?.commitLayerTransform(gizmoDrag.id, gizmoDrag.before, name);
      gizmoDrag = null;
      needsRender = true;
      scheduleRender();
      return;
    }
    if (isPanning) {
      isPanning = false;
      canvas.style.cursor = "";
      return;
    }
    const vp = viewportFromEvent(e, canvas);
    const docP = docFromVP(vp);
    const tool = useEditorStore.getState().tool;
    runtime.engine?.handlePointerUp(tool, vp, docP, e);
  }

  function handleWheel(e: WheelEvent): void {
    e.preventDefault();
    const vp = viewportFromEvent(e, canvas);
    const factor = e.deltaY < 0 ? 1.08 : 1 / 1.08;
    zoomAtVP(vp, factor);
  }

  function handlePointerLeave(): void {
    if (!isPanning && !cropDrag && !gizmoDrag) canvas.style.cursor = "";
  }

  function handleKeyDown(e: KeyboardEvent): void {
    if (e.code === "Space" && !spaceHeld) {
      spaceHeld = true;
      canvas.style.cursor = "grab";
    }
    if (e.code === "Escape" && !useEditorStore.getState().dialog) {
      selectionEngine.clear();
      useEditorStore.setState({ selectedIds: [] });
      runtime.engine?.cancelCrop();
      runtime.engine?.cancelPen();
      if (guideDrag) {
        useEditorStore.getState().setGuides(guideDrag.beforeGuides);
        guideDrag = null;
      }
      needsRender = true;
      scheduleRender();
    }
  }

  function handleKeyUp(e: KeyboardEvent): void {
    if (e.code === "Space") {
      spaceHeld = false;
      canvas.style.cursor = "";
    }
  }

  function handleDblClick(e: MouseEvent): void {
    const tool = useEditorStore.getState().tool;
    if (tool === "pen") return;
    const vp = viewportFromEvent(e, canvas);
    const docP = docFromVP(vp);
    runtime.engine.handleDblClick(docP);
  }

  // Attach listeners
  canvas.addEventListener("pointerdown", handlePointerDown);
  canvas.addEventListener("pointermove", handlePointerMove);
  canvas.addEventListener("pointerup", handlePointerUp);
  canvas.addEventListener("pointercancel", handlePointerUp);
  canvas.addEventListener("wheel", handleWheel, { passive: false });
  canvas.addEventListener("dblclick", handleDblClick);
  canvas.addEventListener("pointerleave", handlePointerLeave);
  window.addEventListener("keydown", handleKeyDown);
  window.addEventListener("keyup", handleKeyUp);
  const unsubTool = useEditorStore.subscribe((state, prev) => {
    if (state.tool !== prev.tool && !spaceHeld && !isPanning && !gizmoDrag && !cropDrag) {
      canvas.style.cursor = toolIdleCursor(state.tool);
    }
    if (state.showGrid !== prev.showGrid || state.showRulers !== prev.showRulers ||
        state.showGuides !== prev.showGuides || state.guides !== prev.guides) {
      needsRender = true;
      scheduleRender();
    }
  });
  const ro = new ResizeObserver(() => resize());
  ro.observe(parent);

  resize();

  const engine: CanvasEngine = {
    resize,
    requestRender: () => { needsRender = true; scheduleRender(); },
    resetCamera,
    element: () => canvas,
    zoomAtVP,
    zoomTo,
    fitToScreen,
    zoom100,
    docFromVP,
    vpFromDoc,
    destroy() {
      if (renderRAF) cancelAnimationFrame(renderRAF);
      renderRAF = 0;
      antsTicker.stop();
      if (cursorScheduled && pendingCursor) {
        useEditorStore.setState({ cursor: pendingCursor });
        pendingCursor = null;
        cursorScheduled = false;
      }
      unsubTool();
      ro.disconnect();
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointermove", handlePointerMove);
      canvas.removeEventListener("pointerup", handlePointerUp);
      canvas.removeEventListener("pointercancel", handlePointerUp);
      canvas.removeEventListener("wheel", handleWheel);
      canvas.removeEventListener("dblclick", handleDblClick);
      canvas.removeEventListener("pointerleave", handlePointerLeave);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      canvas.remove();
      if (runtime.canvas === engine) runtime.canvas = null;
    },
  };

  runtime.canvas = engine;

  return engine;
}