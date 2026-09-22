import { createCanvas, getContext2d } from "../../utils/canvas";

export type CompareMode = "sbs" | "split" | "overlay";

export interface CompareCamera {
  x: number;
  y: number;
  zoom: number;
}

/** Padded margin used by fit-to-screen, mirroring the editor's Camera.apply. */
export const COMPARE_FIT_PAD = 48;

/** Below this viewport width, side-by-side automatically falls back to split. */
export const COMPARE_MIN_SBS_WIDTH = 520;

/** Upper bound for the stored "Before" reference (memory guard for huge docs). */
export const COMPARE_MAX_REF_DIM = 4096;

export const COMPARE_MIN_ZOOM = 0.02;
export const COMPARE_MAX_ZOOM = 64;

export function clampCompareZoom(zoom: number): number {
  return Math.max(COMPARE_MIN_ZOOM, Math.min(COMPARE_MAX_ZOOM, zoom));
}

export function compareFit(
  docW: number,
  docH: number,
  viewW: number,
  viewH: number,
  pad = COMPARE_FIT_PAD
): CompareCamera {
  if (docW <= 0 || docH <= 0 || viewW <= 0 || viewH <= 0 || !isFinite(docW) || !isFinite(docH)) {
    return { x: 0, y: 0, zoom: 1 };
  }
  const zoom = Math.min((viewW - pad * 2) / docW, (viewH - pad * 2) / docH);
  if (!isFinite(zoom) || zoom <= 0) return { x: 0, y: 0, zoom: 1 };
  return {
    x: (viewW - docW * zoom) / 2,
    y: (viewH - docH * zoom) / 2,
    zoom,
  };
}

/**
 * Fraction of the viewport width a split-view pane needs to fully contain the
 * document. Split shows two complete images side by side, so the reference fit
 * honors the narrower pane (never the wider one) to guarantee neither pane
 * crops its image. Clamped so an extreme divider position never collapses the
 * fit to zero width.
 */
export function splitPaneFraction(splitValue: number): number {
  const pct = clampSplitPercent(splitValue);
  return Math.max(0.05, Math.min(pct, 100 - pct) / 100);
}

/**
 * Fit-to-screen for a comparison mode. Side-by-side and split fit the document
 * into a single panel (half the viewport at a centered divider) so the full
 * image is visible in each panel without cropping.
 */
export function compareFitForMode(
  mode: CompareMode,
  docW: number,
  docH: number,
  viewW: number,
  viewH: number,
  pad = COMPARE_FIT_PAD,
  splitValue = 50
): CompareCamera {
  const eff = effectiveMode(mode, viewW);
  const fitW = eff === "sbs" ? viewW / 2 : eff === "split" ? viewW * splitPaneFraction(splitValue) : viewW;
  return compareFit(docW, docH, fitW, viewH, pad);
}

export function clampCompareCamera(
  cam: CompareCamera,
  docW: number,
  docH: number,
  viewW: number,
  viewH: number
): CompareCamera {
  const zoom = clampCompareZoom(cam.zoom);
  const xMax = Math.max(0, docW * zoom - viewW / 2);
  const yMax = Math.max(0, docH * zoom - viewH / 2);
  const xMin = Math.min(0, -viewW / 2 + docW * zoom);
  const yMin = Math.min(0, -viewH / 2 + docH * zoom);
  return {
    zoom,
    x: Math.max(xMin, Math.min(xMax, cam.x)),
    y: Math.max(yMin, Math.min(yMax, cam.y)),
  };
}

export function zoomCompareCamera(
  cam: CompareCamera,
  docW: number,
  docH: number,
  viewW: number,
  viewH: number,
  vpX: number,
  vpY: number,
  factor: number
): CompareCamera {
  const oldZoom = cam.zoom;
  const zoom = clampCompareZoom(oldZoom * factor);
  if (oldZoom === 0) return clampCompareCamera({ x: cam.x, y: cam.y, zoom }, docW, docH, viewW, viewH);
  const x = vpX - (vpX - cam.x) * (zoom / oldZoom);
  const y = vpY - (vpY - cam.y) * (zoom / oldZoom);
  return clampCompareCamera({ x, y, zoom }, docW, docH, viewW, viewH);
}

export function panCompareCamera(
  cam: CompareCamera,
  dx: number,
  dy: number,
  docW: number,
  docH: number,
  viewW: number,
  viewH: number
): CompareCamera {
  return clampCompareCamera({ x: cam.x + dx, y: cam.y + dy, zoom: cam.zoom }, docW, docH, viewW, viewH);
}

export function docFromVP(cam: CompareCamera, vpX: number, vpY: number): { x: number; y: number } {
  return { x: (vpX - cam.x) / cam.zoom, y: (vpY - cam.y) / cam.zoom };
}

export function vpFromDoc(cam: CompareCamera, docX: number, docY: number): { x: number; y: number } {
  return { x: docX * cam.zoom + cam.x, y: docY * cam.zoom + cam.y };
}

/** Side-by-side auto-falls back to split when the viewport is too narrow. */
export function effectiveMode(preferred: CompareMode, viewW: number): CompareMode {
  if (preferred === "sbs" && viewW < COMPARE_MIN_SBS_WIDTH) return "split";
  return preferred;
}

export function clampSplitPercent(value: number): number {
  return Math.max(0, Math.min(100, value));
}

export function clampOverlayOpacity(value: number): number {
  return Math.max(0, Math.min(100, value));
}

/**
 * Downscale a canvas so its longest side does not exceed `maxDim`.
 * Returns the same canvas when already within bounds (no extra copy).
 */
export function downscaleCanvas(src: HTMLCanvasElement, maxDim = COMPARE_MAX_REF_DIM): HTMLCanvasElement {
  if (isNaN(src.width) || isNaN(src.height) || src.width <= 0 || src.height <= 0) return src;
  if (src.width <= maxDim && src.height <= maxDim) return src;
  const k = Math.min(maxDim / src.width, maxDim / src.height);
  const w = Math.max(1, Math.round(src.width * k));
  const h = Math.max(1, Math.round(src.height * k));
  const out = createCanvas(w, h);
  const ctx = getContext2d(out);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(src, 0, 0, w, h);
  return out;
}

export interface CompareDrawOptions {
  before: HTMLCanvasElement | null;
  after: HTMLCanvasElement | null;
  camera: CompareCamera;
  docW: number;
  docH: number;
  mode: CompareMode;
  /** 0..100 position of the split divider along the viewport width. */
  splitValue: number;
  /** 0..100 visibility of the Before image in overlay mode. */
  overlayOpacity: number;
  /**
   * Original document dimensions used by the Before reference. When the
   * Before canvas was downscaled for memory (see COMPARE_MAX_REF_DIM) or the
   * document was cropped, these keep Before aligned with After at the origin.
   */
  beforeW?: number;
  beforeH?: number;
  /** Backing-store scale factor (devicePixelRatio). Defaults to 1. */
  dpr?: number;
  viewW: number;
  viewH: number;
}

const CHECKER_A = "#3a3d44";
const CHECKER_B = "#32353b";

function drawCheckerDocSpace(ctx: CanvasRenderingContext2D, cam: CompareCamera, docW: number, docH: number): void {
  ctx.save();
  ctx.translate(cam.x, cam.y);
  ctx.scale(cam.zoom, cam.zoom);
  const s = Math.max(4, Math.ceil(10 / cam.zoom));
  const cols = Math.ceil(docW / s) + 1;
  const rows = Math.ceil(docH / s) + 1;
  ctx.fillStyle = CHECKER_A;
  ctx.fillRect(-1, -1, docW + 2, docH + 2);
  ctx.fillStyle = CHECKER_B;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if ((r + c) % 2 === 0) {
        ctx.fillRect(c * s, r * s, s, s);
      }
    }
  }
  ctx.restore();
}

function drawImageAtDoc(
  ctx: CanvasRenderingContext2D,
  img: HTMLCanvasElement | null,
  cam: CompareCamera,
  drawW: number,
  drawH: number
): void {
  if (!img) return;
  ctx.save();
  ctx.translate(cam.x, cam.y);
  ctx.scale(cam.zoom, cam.zoom);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, drawW, drawH);
  ctx.restore();
}

/** Render a single comparison frame into the target 2D context (CSS-pixel space). */
export function drawCompareFrame(ctx: CanvasRenderingContext2D, o: CompareDrawOptions): void {
  const dpr = o.dpr ?? 1;
  const beforeW = o.beforeW ?? o.docW;
  const beforeH = o.beforeH ?? o.docH;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, o.viewW, o.viewH);
  ctx.fillStyle = "#1b1e24";
  ctx.fillRect(0, 0, o.viewW, o.viewH);

  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, o.viewW, o.viewH);
  ctx.clip();

  const mode = effectiveMode(o.mode, o.viewW);
  if (mode === "split") {
    // Two complete panes: the full Before is fit into the left pane and the
    // full After into the right pane. The divider is only a separator; it
    // never crops either image. The shared camera fit honors the narrower
    // pane, and each pane re-centers the document within its own bounds.
    const splitX = (clampSplitPercent(o.splitValue) / 100) * o.viewW;
    const fitW = o.viewW * splitPaneFraction(o.splitValue);
    const leftCam: CompareCamera = { x: o.camera.x + (splitX - fitW) / 2, y: o.camera.y, zoom: o.camera.zoom };
    const rightCam: CompareCamera = { x: o.camera.x + (o.viewW + splitX - fitW) / 2, y: o.camera.y, zoom: o.camera.zoom };
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, splitX, o.viewH);
    ctx.clip();
    drawCheckerDocSpace(ctx, leftCam, beforeW, beforeH);
    drawImageAtDoc(ctx, o.before, leftCam, beforeW, beforeH);
    ctx.restore();
    ctx.save();
    ctx.beginPath();
    ctx.rect(splitX, 0, o.viewW - splitX, o.viewH);
    ctx.clip();
    drawCheckerDocSpace(ctx, rightCam, o.docW, o.docH);
    drawImageAtDoc(ctx, o.after, rightCam, o.docW, o.docH);
    ctx.restore();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.fillRect(Math.round(splitX) - 1, 0, 2, o.viewH);
  } else {
    drawCheckerDocSpace(ctx, o.camera, o.docW, o.docH);
    if (mode === "overlay") {
      drawImageAtDoc(ctx, o.after, o.camera, o.docW, o.docH);
      ctx.save();
      ctx.globalAlpha = clampOverlayOpacity(o.overlayOpacity) / 100;
      drawImageAtDoc(ctx, o.before, o.camera, beforeW, beforeH);
      ctx.restore();
    } else {
      // Side by side: each panel holds its own copy of the document so both the
      // full Before and the full After are visible at the same time.
      const half = o.viewW / 2;
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, half, o.viewH);
      ctx.clip();
      drawImageAtDoc(ctx, o.before, o.camera, beforeW, beforeH);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(half, 0, half, o.viewH);
      ctx.clip();
      drawImageAtDoc(ctx, o.after, { x: o.camera.x + half, y: o.camera.y, zoom: o.camera.zoom }, o.docW, o.docH);
      ctx.restore();
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = "rgba(255,255,255,0.9)";
      ctx.fillRect(Math.round(half) - 1, 0, 2, o.viewH);
    }
  }

  ctx.restore();
}