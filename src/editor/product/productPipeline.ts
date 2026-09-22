import { createCanvas, getContext2d } from "../../utils/canvas";
import { clamp } from "../../utils/math";
import { runProcess } from "../processing/processor";
import type { ProductLightingValues } from "../core/types";
import type { AISelection } from "../../ai/types";

/**
 * Product-Compositing pipeline — deterministic, real pixel math for placing a
 * product into a background scene. All algorithms here are local and honest:
 * lighting/color-match values are computed from actual pixel statistics, and
 * no function pretends to be AI.
 */

const clampU = (v: number): number => (v < 0 ? 0 : v > 255 ? 255 : v);

/** Typed-array safe ImageData constructor — avoids TS 5.7+ ArrayBufferLike mismatch. */
function makeImageData(data: Uint8ClampedArray, w: number, h: number): ImageData {
  const buf = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  return new ImageData(new Uint8ClampedArray(buf), w, h);
}

/* ─────────────────────────── Lighting ─────────────────────────── */

/**
 * Bake a full lighting adjustment set onto a canvas.
 *
 * Order: exposure → brightness → contrast → temperature → tint → saturation
 * → highlights → shadows. Alpha is always preserved. Returns a NEW canvas.
 */
export function applyProductLighting(src: HTMLCanvasElement, v: ProductLightingValues): HTMLCanvasElement {
  const w = src.width;
  const h = src.height;
  const ctx = getContext2d(src);
  const data = ctx.getImageData(0, 0, w, h).data;

  let out = runProcess("exposure", w, h, data, { amount: collapseZero(v.exposure) });
  out = runProcess("brightness", w, h, out, { amount: collapseZero(v.brightness) });
  out = runProcess("contrast", w, h, out, { amount: collapseZero(v.contrast) });
  out = runProcess("temperature", w, h, out, { amount: collapseZero(v.temperature) * 100 });
  out = tintShift(out, clamp(v.tint, -100, 100));
  out = runProcess("saturation", w, h, out, { amount: collapseZero(v.saturation) });
  out = toneSplit(out, clamp(v.highlights, -100, 100), clamp(v.shadows, -100, 100));

  const result = createCanvas(w, h);
  getContext2d(result).putImageData(makeImageData(out, w, h), 0, 0);
  return result;
}

function collapseZero(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

/** Red/green tint — positive shifts toward magenta, negative toward green. */
function tintShift(src: Uint8ClampedArray, tint: number): Uint8ClampedArray {
  if (tint === 0) return src;
  const t = tint / 100;
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    out[i] = clampU(src[i] + t * 34);
    out[i + 1] = clampU(src[i + 1] - t * 20);
    out[i + 2] = clampU(src[i + 2] + t * 34);
    out[i + 3] = src[i + 3];
  }
  return out;
}

/** Highlights lift/suppress (bright pixels) and shadows lift/compress (dark pixels). */
function toneSplit(src: Uint8ClampedArray, highlights: number, shadows: number): Uint8ClampedArray {
  if (highlights === 0 && shadows === 0) return src;
  const hA = highlights / 200;
  const sA = shadows / 200;
  const out = new Uint8ClampedArray(src.length);
  for (let i = 0; i < src.length; i += 4) {
    const r = src[i];
    const g = src[i + 1];
    const b = src[i + 2];
    const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    let delta = 0;
    if (hA !== 0) {
      const t = clamp((lum - 128) / 127, 0, 1);
      delta += hA * t;
    }
    if (sA !== 0) {
      const t = clamp((128 - lum) / 128, 0, 1);
      delta += sA * t;
    }
    const d = delta * 255;
    out[i] = clampU(r + d);
    out[i + 1] = clampU(g + d);
    out[i + 2] = clampU(b + d);
    out[i + 3] = src[i + 3];
  }
  return out;
}

/* ─────────────────────── Local pixel statistics ─────────────────────── */

export interface LocalImageStats {
  meanLuminance: number;
  stdLuminance: number;
  meanR: number;
  meanG: number;
  meanB: number;
  meanSaturation: number;
  /** Warm vs cool on a −100 (cool) … +100 (warm) axis. */
  temperature: number;
  /** Green vs magenta on a −100 … +100 axis. */
  tint: number;
  lightDirectionDeg: number;
}

/**
 * Deterministic, real pixel statistics over a down-sampled copy (max 160px),
 * mirroring the app's existing "local stats" analysis. Used by the local
 * color-match heuristic; never presented as AI.
 */
export function sampleLocalStats(canvas: HTMLCanvasElement): LocalImageStats {
  const maxSide = 160;
  const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  const w = Math.max(1, Math.round(canvas.width * scale));
  const h = Math.max(1, Math.round(canvas.height * scale));
  const tmp = createCanvas(w, h);
  const tctx = getContext2d(tmp);
  tctx.imageSmoothingEnabled = true;
  tctx.drawImage(canvas, 0, 0, w, h);
  const data = tctx.getImageData(0, 0, w, h).data;
  const n = w * h;

  let sumL = 0;
  let sumR = 0;
  let sumG = 0;
  let sumB = 0;
  let sumSat = 0;
  let warmAxis = 0;
  let greenAxis = 0;
  let sumGradX = 0;
  let sumGradY = 0;
  let count = 0;
  let prevLum = 0;

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      const a = data[i + 3];
      if (a < 8) continue;
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      const maxC = Math.max(r, g, b);
      const minC = Math.min(r, g, b);
      const sat = maxC === 0 ? 0 : (maxC - minC) / maxC;
      sumL += lum;
      sumR += r;
      sumG += g;
      sumB += b;
      sumSat += sat;
      warmAxis += 2 * r - (g + b);
      greenAxis += g - (r + b) / 2;
      if (x > 0) {
        sumGradX += prevLum - lum;
      }
      if (y > 0) {
        const up = (y - 1) * w + x;
        const upLum = 0.2126 * data[up * 4] + 0.7152 * data[up * 4 + 1] + 0.0722 * data[up * 4 + 2];
        sumGradY += lum - upLum;
      }
      prevLum = lum;
      count++;
    }
  }
  if (count === 0) {
    return {
      meanLuminance: 128,
      stdLuminance: 0,
      meanR: 128,
      meanG: 128,
      meanB: 128,
      meanSaturation: 0,
      temperature: 0,
      tint: 0,
      lightDirectionDeg: 90,
    };
  }

  const meanL = sumL / count;
  let varSum = 0;
  const meanR = sumR / count;
  const meanG = sumG / count;
  const meanB = sumB / count;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (data[i + 3] < 8) continue;
      const lum = 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
      const d = lum - meanL;
      varSum += d * d;
    }
  }

  const std = Math.sqrt(varSum / count);
  const lightDirectionDeg = (Math.atan2(sumGradY, sumGradX) * 180) / Math.PI;

  return {
    meanLuminance: meanL,
    stdLuminance: std,
    meanR,
    meanG,
    meanB,
    meanSaturation: sumSat / count,
    temperature: clamp((warmAxis / count) / 2.55, -100, 100),
    tint: clamp((greenAxis / count) / 2.55, -100, 100),
    lightDirectionDeg: Number.isFinite(lightDirectionDeg) ? ((lightDirectionDeg % 360) + 360) % 360 : 90,
  };
}

/**
 * Local color-match heuristic: compares real background/product statistics and
 * derives adjustment values that pull the product closer to the scene. This is
 * a deterministic calculation, NOT AI — the panel labels it accordingly.
 */
export function suggestColorMatch(bg: HTMLCanvasElement, product: HTMLCanvasElement): ProductLightingValues {
  const s = sampleLocalStats(bg);
  const p = sampleLocalStats(product);

  const exposure = clamp((s.meanLuminance - p.meanLuminance) / 255 * 2, -3, 3);
  const temperature = clamp(s.temperature - p.temperature, -100, 100);
  const tint = clamp(s.tint - p.tint, -100, 100);
  const contrast = clamp((s.stdLuminance - p.stdLuminance) / 255 * 100, -100, 100);
  const saturation = clamp((s.meanSaturation - p.meanSaturation) * 100, -100, 100);

  return {
    brightness: 0,
    contrast,
    saturation,
    temperature,
    tint,
    exposure,
    highlights: 0,
    shadows: 0,
  };
}

/* ─────────────────── Background analysis (local, real) ─────────────────── */

export interface LocalBackgroundAnalysis {
  lighting: ProductLightingValues;
  background: {
    meanLuminance: number;
    contrast: number;
    saturation: number;
    lightDirectionDeg: number;
    floorYRatio: number;
    surface: string;
    surfaceType: string;
    suggestedShadow: { distance: number; angleDeg: number; opacity: number; blur: number; spread: number };
  };
}

/** Deterministic local scene analysis used for smart placement and shadow defaults. */
export function analyzeBackgroundLocal(canvas: HTMLCanvasElement): LocalBackgroundAnalysis {
  const s = sampleLocalStats(canvas);
  const floorYRatio = estimateFloorYRatio(canvas);
  const angleDeg = (s.lightDirectionDeg + 180) % 360;

  return {
    lighting: {
      brightness: 0,
      contrast: clamp((s.stdLuminance / 255) * 200, -100, 100),
      saturation: clamp(s.meanSaturation * 100, -100, 100),
      temperature: s.temperature,
      tint: s.tint,
      exposure: clamp((s.meanLuminance - 128) / 128, -1, 1),
      highlights: 0,
      shadows: 0,
    },
    background: {
      meanLuminance: s.meanLuminance,
      contrast: clamp(s.stdLuminance / 255, 0, 1),
      saturation: clamp(s.meanSaturation, 0, 1),
      lightDirectionDeg: s.lightDirectionDeg,
      floorYRatio,
      surface: "dominant surface (local estimate)",
      surfaceType: "ground",
      suggestedShadow: {
        distance: Math.max(20, Math.round(canvas.height * 0.04)),
        angleDeg,
        opacity: 0.5,
        blur: Math.max(6, Math.round(canvas.height * 0.008)),
        spread: 0,
      },
    },
  };
}

/** Crude horizon estimate: find the row with the strongest luminance transition in the lower half. */
function estimateFloorYRatio(canvas: HTMLCanvasElement): number {
  const maxSide = 96;
  const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  const w = Math.max(2, Math.round(canvas.width * scale));
  const h = Math.max(2, Math.round(canvas.height * scale));
  const tmp = createCanvas(w, h);
  getContext2d(tmp).drawImage(canvas, 0, 0, w, h);
  const data = getContext2d(tmp).getImageData(0, 0, w, h).data;
  const rowMean = new Float64Array(h);
  for (let y = 0; y < h; y++) {
    let sum = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
    }
    rowMean[y] = sum / w;
  }
  let best = -1;
  let bestScore = 12; // ignore weak gradients
  for (let y = Math.floor(h / 2); y < h - 1; y++) {
    const score = Math.abs(rowMean[y + 1] - rowMean[y] as number);
    if (score > bestScore) {
      bestScore = score;
      best = y;
    }
  }
  const ratio = best >= 0 ? (best + 1) / h : 0.72;
  return clamp(ratio, 0.1, 0.98);
}

/* ─────────────────────────── Contact shadow ─────────────────────────── */

export interface ContactShadowSettings {
  opacity: number;
  blur: number;
  distance: number;
  /** Direction the shadow is cast (degrees: 0 = right, 90 = down). */
  angle: number;
  /** Positive grows the silhouette, negative shrinks (px). */
  spread: number;
  /** 0..1 — how much to blacken vs. keep some product color bleed. */
  tinted: number;
}

export interface ShadowCanvasResult {
  canvas: HTMLCanvasElement;
  /** Where the result should be positioned relative to the product's top-left. */
  padX: number;
  padY: number;
}

/**
 * Render a soft contact shadow as its own raster layer. The silhouette alpha
 * of the (masked) product is contracted by `spread`, blurred by `blur`, offset
 * by distance/angle, and written as black with `opacity` into a padded canvas.
 */
export function createContactShadowCanvas(product: HTMLCanvasElement, settings: ContactShadowSettings): ShadowCanvasResult {
  const opacity = clamp(settings.opacity, 0, 1);
  const blur = Math.max(0, Number.isFinite(settings.blur) ? settings.blur : 0);
  const distance = Math.max(0, Number.isFinite(settings.distance) ? settings.distance : 0);
  const angleDeg = ((Number.isFinite(settings.angle) ? settings.angle : 90) % 360);
  const spread = clamp(settings.spread, -50, 50);
  const tinted = clamp(settings.tinted, 0, 1);
  const rad = (angleDeg * Math.PI) / 180;
  const dx = Math.cos(rad) * distance;
  const dy = Math.sin(rad) * distance;

  const w = Math.max(1, product.width);
  const h = Math.max(1, product.height);

  // 1. Silhouette (black, product alpha; tinted bleeds a little color).
  let silhouette: HTMLCanvasElement;
  if (tinted > 0) {
    silhouette = createCanvas(w, h);
    const sctx = getContext2d(silhouette);
    sctx.drawImage(product, 0, 0);
    sctx.globalCompositeOperation = "source-in";
    sctx.filter = "brightness(0.45)";
    sctx.fillStyle = "#000000";
    sctx.fillRect(0, 0, w, h);
    sctx.filter = "none";
    sctx.globalCompositeOperation = "source-over";
  } else {
    silhouette = createCanvas(w, h);
    const sctx = getContext2d(silhouette);
    sctx.drawImage(product, 0, 0);
    sctx.globalCompositeOperation = "source-in";
    sctx.fillStyle = "#000000";
    sctx.fillRect(0, 0, w, h);
    sctx.globalCompositeOperation = "source-over";
  }

  // 2. Spread (morphological contraction/expansion of the alpha channel).
  if (spread !== 0) {
    silhouette = morphAlpha(silhouette, Math.round(Math.abs(spread)), spread > 0);
  }

  // 3. Feather.
  if (blur > 0) {
    silhouette = gaussianBlurCanvas(silhouette, blur);
  }

  // 4. Offset into a padded output canvas.
  const pad = Math.max(4, Math.ceil(blur + distance + 2));
  const outW = w + pad * 2;
  const outH = h + pad * 2;
  const out = createCanvas(outW, outH);
  const octx = getContext2d(out);
  octx.clearRect(0, 0, outW, outH);
  octx.globalAlpha = opacity;
  octx.drawImage(silhouette, pad + dx, pad + dy);
  octx.globalAlpha = 1;

  return { canvas: out, padX: pad, padY: pad };
}

/** Dilate (expand = true) or erode the alpha channel by `radius` px (box window). */
function morphAlpha(canvas: HTMLCanvasElement, radius: number, expand: boolean): HTMLCanvasElement {
  const r = Math.min(24, Math.max(1, radius));
  const w = canvas.width;
  const h = canvas.height;
  const ctx = getContext2d(canvas);
  const data = ctx.getImageData(0, 0, w, h);
  const a = new Float64Array(w * h);
  for (let i = 0; i < w * h; i++) a[i] = data.data[i * 4 + 3];
  const outA = new Uint8ClampedArray(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let acc = 0;
      for (let dy = -r; dy <= r; dy++) {
        const yy = clamp(y + dy, 0, h - 1);
        for (let dx = -r; dx <= r; dx++) {
          const xx = clamp(x + dx, 0, w - 1);
          const v = a[yy * w + xx] as number;
          acc = expand ? Math.max(acc, v) : acc === 0 ? v : Math.min(acc, v);
          if (expand && acc >= 255) { dy = r; dx = r; }
          if (!expand && acc === 0) { dy = r; dx = r; }
        }
      }
      outA[y * w + x] = clampU(acc);
    }
  }
  for (let i = 0; i < w * h; i++) data.data[i * 4 + 3] = outA[i]!;
  ctx.putImageData(data, 0, 0);
  return canvas;
}

function gaussianBlurCanvas(canvas: HTMLCanvasElement, radius: number): HTMLCanvasElement {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = getContext2d(canvas);
  const src = ctx.getImageData(0, 0, w, h).data;
  const out = runProcess("gaussianBlur", w, h, src, { radius });
  const res = createCanvas(w, h);
  getContext2d(res).putImageData(makeImageData(out, w, h), 0, 0);
  return res;
}

/* ─────────────────────────── Reflection ─────────────────────────── */

export interface ReflectionSettings {
  opacity: number;
  blur: number;
  /** Vertical offset (px) below the product bottom before the reflection fades. */
  offset: number;
  /** Fade height ratio relative to product height (0..1). */
  fade: number;
  /** Perspective of the reflection: 1 = same width, <1 tapers the far edge. */
  perspective: number;
}

/** Build a mirrored, blurred, vertically-fading reflection of the product pixels. */
export function createReflectionCanvas(product: HTMLCanvasElement, settings: ReflectionSettings): { canvas: HTMLCanvasElement } {
  const opacity = clamp(settings.opacity, 0, 1);
  const blur = Math.max(0, Number.isFinite(settings.blur) ? settings.blur : 0);
  const offset = Math.max(0, Number.isFinite(settings.offset) ? settings.offset : 0);
  const fade = clamp(settings.fade, 0.05, 1);
  const persp = clamp(settings.perspective, 0.5, 1);

  const w = Math.max(1, product.width);
  const h = Math.max(1, product.height);
  const slice = Math.max(1, Math.round(h * fade));
  const out = createCanvas(w, slice);

  const octx = getContext2d(out);
  octx.clearRect(0, 0, w, slice);
  octx.filter = blur > 0 ? `blur(${blur}px)` : "none";
  octx.globalAlpha = opacity;
  // Mirrored source anchored so the product bottom sits at the top of the slice.
  octx.translate(w / 2, 0);
  octx.scale(persp, 1);
  octx.translate(-w / 2, 0);
  octx.scale(1, -1);
  octx.drawImage(product, 0, -offset - slice);
  octx.scale(1, -1);

  // Vertical fade: transparent at the bottom of the slice.
  const data = getContext2d(out).getImageData(0, 0, w, slice);
  for (let y = 0; y < slice; y++) {
    const t = y / slice; // 0 top … 1 bottom
    const fadeA = Math.pow(1 - t, 1.4) * 255;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      const orig = data.data[i + 3];
      data.data[i + 3] = clampU((orig * fadeA) / 255);
    }
  }
  getContext2d(out).putImageData(data, 0, 0);
  return { canvas: out };
}

/* ─────────────────────────── Perspective warp ─────────────────────────── */

export interface Point2D {
  x: number;
  y: number;
}

/**
 * Perspective-warp `src` so its four source corners map to `dst` corners.
 * Real inverse homography with bilinear sampling. Output is sized to the
 * bounding box of the destination corners + `pad`.
 */
export function warpPerspective(
  src: HTMLCanvasElement,
  dst: [Point2D, Point2D, Point2D, Point2D],
  pad = 8
): { canvas: HTMLCanvasElement; offsetX: number; offsetY: number } {
  const w = Math.max(1, src.width);
  const h = Math.max(1, src.height);
  const srcCorners: [Point2D, Point2D, Point2D, Point2D] = [
    { x: 0, y: 0 },
    { x: w, y: 0 },
    { x: w, y: h },
    { x: 0, y: h },
  ];

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of dst) {
    minX = Math.min(minX, p.x);
    minY = Math.min(minY, p.y);
    maxX = Math.max(maxX, p.x);
    maxY = Math.max(maxY, p.y);
  }
  const outW = Math.max(1, Math.ceil(maxX - minX) + pad * 2);
  const outH = Math.max(1, Math.ceil(maxY - minY) + pad * 2);

  const H = homography(srcCorners, dst); // maps source -> dest
  const Hi = invert3x3(H); // maps dest -> source

  const out = createCanvas(outW, outH);
  const octx = getContext2d(out);
  const img = octx.createImageData(outW, outH);
  const srcCtx = getContext2d(src);
  const srcData = srcCtx.getImageData(0, 0, w, h).data;

  for (let oy = 0; oy < outH; oy++) {
    for (let ox = 0; ox < outW; ox++) {
      const dx = ox - pad + minX;
      const dy = oy - pad + minY;
      const rx = Hi[0] * dx + Hi[1] * dy + Hi[2];
      const ry = Hi[3] * dx + Hi[4] * dy + Hi[5];
      const rw = Hi[6] * dx + Hi[7] * dy + Hi[8];
      const u = rw === 0 ? -1 : rx / rw;
      const v = rw === 0 ? -1 : ry / rw;
      const o = (oy * outW + ox) * 4;
      if (u < 0 || v < 0 || u >= w - 1 || v >= h - 1) {
        img.data[o + 3] = 0;
        continue;
      }
      const x0 = Math.floor(u);
      const y0 = Math.floor(v);
      const tx = u - x0;
      const ty = v - y0;
      const i00 = (y0 * w + x0) * 4;
      const i10 = (y0 * w + x0 + 1) * 4;
      const i01 = ((y0 + 1) * w + x0) * 4;
      const i11 = ((y0 + 1) * w + x0 + 1) * 4;
      for (let c = 0; c < 4; c++) {
        const top = srcData[i00 + c] * (1 - tx) + srcData[i10 + c] * tx;
        const bot = srcData[i01 + c] * (1 - tx) + srcData[i11 + c] * tx;
        const val = top * (1 - ty) + bot * ty;
        if (c === 3) {
          img.data[o + c] = clampU(val);
        } else {
          const a = srcData[i00 + 3];
          img.data[o + c] = clampU(a === 0 ? 0 : val);
        }
      }
    }
  }
  octx.putImageData(img, 0, 0);
  return { canvas: out, offsetX: pad + minX, offsetY: pad + minY };
}

/** 8-point DLT homography (source -> destination), returned as row-major 3x3. */
function homography(
  src: [Point2D, Point2D, Point2D, Point2D],
  dst: [Point2D, Point2D, Point2D, Point2D]
): number[] {
  const A: number[][] = [];
  const b: number[] = [];
  for (let i = 0; i < 4; i++) {
    const s = src[i]!;
    const d = dst[i]!;
    A.push([s.x, s.y, 1, 0, 0, 0, -s.x * d.x, -s.y * d.x]);
    b.push(d.x);
    A.push([0, 0, 0, s.x, s.y, 1, -s.x * d.y, -s.y * d.y]);
    b.push(d.y);
  }
  const h = solve8x8(A, b);
  if (!h) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  return [...h, 1];
}

function invert3x3(m: number[]): number[] {
  const [a, b, c, d, e, f, g, hq, i2] = m as number[];
  const A = e * i2 - f * hq;
  const B = c * hq - b * i2;
  const C = b * f - c * e;
  const D = f * g - d * i2;
  const E = a * i2 - c * g;
  const F = c * d - a * f;
  const G = d * hq - e * g;
  const H = b * g - a * hq;
  const I = a * e - b * d;
  const det = a * A + b * D + c * G;
  if (Math.abs(det) < 1e-9) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const inv = 1 / det;
  return [A * inv, B * inv, C * inv, D * inv, E * inv, F * inv, G * inv, H * inv, I * inv];
}

/** Gaussian elimination on an 8-row augmented system (A 8x8, b 8x1). */
function solve8x8(A: number[][], b: number[]): number[] | null {
  const n = 8;
  const m = A.map((row, r) => [...row, b[r]!]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r]![col]!) > Math.abs(m[piv]![col]!)) piv = r;
    }
    if (Math.abs(m[piv]![col]!) < 1e-12) return null;
    [m[col], m[piv]] = [m[piv]!, m[col]!];
    const pv = m[col]![col]!;
    for (let j = col; j <= n; j++) m[col]![j] = (m[col]![j] as number) / pv;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const f = m[r]![col]!;
      if (Math.abs(f) < 1e-15) continue;
      for (let j = col; j <= n; j++) m[r]![j] = (m[r]![j] as number) - f * (m[col]![j] as number);
    }
  }
  return m.map((row) => row[n] as number);
}

/* ─────────────────────────── Mask helpers ─────────────────────────── */

/**
 * Build a layer mask canvas (alpha-encoded: 255 = keep, 0 = cut) from an
 * AI selection, sized to the layer's transform box.
 */
export function maskCanvasFromAiSelection(sel: AISelection, w: number, h: number): HTMLCanvasElement | null {
  const out = createCanvas(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)));
  const octx = getContext2d(out);
  octx.clearRect(0, 0, out.width, out.height);

  if (sel.mask && sel.mask.width > 0 && sel.mask.height > 0) {
    const mw = sel.mask.width;
    const mh = sel.mask.height;
    const tmp = createCanvas(mw, mh);
    const tctx = getContext2d(tmp);
    const img = tctx.createImageData(mw, mh);
    for (let i = 0; i < mw * mh; i++) {
      const v = clampU(sel.mask.data[i]);
      img.data[i * 4] = 255;
      img.data[i * 4 + 1] = 255;
      img.data[i * 4 + 2] = 255;
      img.data[i * 4 + 3] = v;
    }
    tctx.putImageData(img, 0, 0);
    octx.imageSmoothingEnabled = true;
    octx.drawImage(tmp, 0, 0, mw, mh, 0, 0, out.width, out.height);
    return out;
  }

  if (sel.bounds) {
    const b = sel.bounds;
    octx.fillStyle = "#ffffff";
    const x0 = Math.max(0, Math.round(b.x));
    const y0 = Math.max(0, Math.round(b.y));
    const x1 = Math.min(out.width, Math.round(b.x + b.width));
    const y1 = Math.min(out.height, Math.round(b.y + b.height));
    octx.fillRect(x0, y0, x1 - x0, y1 - y0);
    if (sel.kind === "ellipse") {
      octx.globalCompositeOperation = "destination-out";
      octx.beginPath();
      octx.ellipse(b.x + b.width / 2, b.y + b.height / 2, b.width / 2, b.height / 2, 0, 0, Math.PI * 2);
      octx.fill();
      octx.globalCompositeOperation = "source-over";
    }
    return out;
  }
  return null;
}

export interface MaskRefineSettings {
  feather: number;
  smooth: number;
  spread: number;
}

/**
 * Refine a layer-mask canvas: feather (gaussian blur of values), smooth (box
 * blur), and spread (contract/expand). All operations preserve the 0..255 beta
 * encoding. Deterministic, real pixel math.
 */
export function refineMaskCanvas(mask: HTMLCanvasElement, settings: MaskRefineSettings): HTMLCanvasElement {
  const w = mask.width;
  const h = mask.height;
  const ctx = getContext2d(mask);
  const src: Uint8ClampedArray = ctx.getImageData(0, 0, w, h).data as Uint8ClampedArray;

  let out = new Uint8ClampedArray(src);
  const feather = Math.max(0, clamp(Number.isFinite(settings.feather) ? settings.feather : 0, 0, 100));
  const smooth = Math.max(0, clamp(Number.isFinite(settings.smooth) ? settings.smooth : 0, 0, 24));

  if (smooth > 0) out = new Uint8ClampedArray(runProcess("gaussianBlur", w, h, out, { radius: smooth }));
  if (feather > 0) out = new Uint8ClampedArray(runProcess("gaussianBlur", w, h, out, { radius: feather }));

  // Spread on the alpha channel (values channel for masks).
  const spread = clamp(settings.spread, -24, 24);
  if (spread !== 0) {
    const r = Math.abs(Math.round(spread));
    const data = new Uint8ClampedArray(out.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let acc = spread > 0 ? 0 : 255;
        for (let dy = -r; dy <= r; dy++) {
          const yy = clamp(y + dy, 0, h - 1);
          for (let dx = -r; dx <= r; dx++) {
            const xx = clamp(x + dx, 0, w - 1);
            const v = out[(yy * w + xx) * 4 + 3];
            acc = spread > 0 ? Math.max(acc, v) : Math.min(acc, v);
          }
        }
        data[(y * w + x) * 4] = acc;
        data[(y * w + x) * 4 + 1] = acc;
        data[(y * w + x) * 4 + 2] = acc;
        data[(y * w + x) * 4 + 3] = acc;
      }
    }
    out = data;
  }

  const res = createCanvas(w, h);
  getContext2d(res).putImageData(makeImageData(out, w, h), 0, 0);
  return res;
}

/* ─────────────────────────── Misc helpers ─────────────────────────── */

export function isRectCanvasBlank(canvas: HTMLCanvasElement): boolean {
  const ctx = getContext2d(canvas);
  try {
    const d = ctx.getImageData(0, 0, Math.min(canvas.width, 64), Math.min(canvas.height, 64)).data;
    for (let i = 3; i < d.length; i += 4) if (d[i] !== 0) return false;
  } catch {
    return false;
  }
  return true;
}