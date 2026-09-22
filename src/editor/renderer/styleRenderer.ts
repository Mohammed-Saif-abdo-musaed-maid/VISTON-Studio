import { createCanvas, getContext2d } from "../../utils/canvas";
import {
  LayerStyles,
  hasAnyStyle,
} from "../core/types";

/**
 * Non-destructive layer-style rasteriser.
 *
 * Every effect is rendered at the layer's natural resolution onto a padded
 * offscreen canvas (the padding hosts outward effects such as drop shadows
 * that bleed past the layer box). No effect is ever baked into the layer
 * pixels — the compositor draws the styled output at composite time, exactly
 * like it already does for masks and blend modes. All raster math uses
 * explicit per-pixel passes so results are deterministic and do not depend on
 * browser-specific canvas filters.
 */

export interface StyledOutput {
  canvas: HTMLCanvasElement;
  pad: number;
}

const MAX_PADDING = 512;

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Tolerant colour parser for style colours (#rgb/#rgba/#rrggbb/#rrggbbaa,
 *  rgb()/rgba()). Unknown values fall back to black. */
export function parseColor(color: string): RGBA {
  const s = (color ?? "").trim().toLowerCase();
  const fallback: RGBA = { r: 0, g: 0, b: 0, a: 1 };
  if (!s) return fallback;
  const hex = /^#([0-9a-f]+)$/.exec(s);
  if (hex) {
    const h = hex[1];
    if (h.length === 3 || h.length === 4) {
      const lift = (v: string) => parseInt(v + v, 16);
      return { r: lift(h[0]), g: lift(h[1]), b: lift(h[2]), a: h.length === 4 ? lift(h[3]) / 255 : 1 };
    }
    if (h.length === 6 || h.length === 8) {
      return { r: parseInt(h.slice(0, 2), 16), g: parseInt(h.slice(2, 4), 16), b: parseInt(h.slice(4, 6), 16), a: h.length === 8 ? parseInt(h.slice(6, 8), 16) / 255 : 1 };
    }
    return fallback;
  }
  const rgba = /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)/.exec(s);
  if (rgba) {
    const n = (v: string) => Math.max(0, Math.min(255, Number(v)));
    return { r: n(rgba[1]), g: n(rgba[2]), b: n(rgba[3]), a: rgba[4] !== undefined ? Math.max(0, Math.min(1, Number(rgba[4]))) : 1 };
  }
  return fallback;
}

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

/** Separable box blur (3 passes) over a Float32 alpha/coverage map. */
export function boxBlur(src: Float32Array, w: number, h: number, radius: number): Float32Array {
  const r = Math.max(1, Math.round(radius));
  const iterations = 3;
  let cur = new Float32Array(src);
  let next = new Float32Array(w * h);
  const tmp = new Float32Array(w * h);
  const norm = 1 / (2 * r + 1);
  for (let it = 0; it < iterations; it++) {
    for (let y = 0; y < h; y++) {
      const off = y * w;
      let sum = 0;
      for (let x = -r; x <= r; x++) sum += cur[off + Math.max(0, Math.min(w - 1, x))];
      for (let x = 0; x < w; x++) {
        tmp[off + x] = sum * norm;
        sum += cur[off + Math.max(0, Math.min(w - 1, x + r + 1))] - cur[off + Math.max(0, Math.min(w - 1, x - r))];
      }
    }
    for (let x = 0; x < w; x++) {
      let sum = 0;
      for (let y = -r; y <= r; y++) sum += tmp[Math.max(0, Math.min(h - 1, y)) * w + x];
      for (let y = 0; y < h; y++) {
        next[y * w + x] = sum * norm;
        sum += tmp[Math.max(0, Math.min(h - 1, y + r + 1)) * w + x] - tmp[Math.max(0, Math.min(h - 1, y - r)) * w + x];
      }
    }
    const swap = cur;
    cur = next;
    next = swap;
  }
  return cur;
}

/** Glow coverage: the shape alpha blurred by radius+spread. */
export function glowCoverage(S: Float32Array, w: number, h: number, radius: number, spread: number): Float32Array {
  return boxBlur(S, w, h, Math.max(1, radius + Math.max(0, spread)));
}

/** Inner edge-darkening band used by inner shadow / inner glow: most opaque
 *  right at the shape boundary and fading toward the interior. */
export function innerEdgeCoverage(S: Float32Array, w: number, h: number, radius: number): Float32Array {
  const B = boxBlur(S, w, h, Math.max(1, radius));
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) {
    out[i] = clamp01((0.5 - B[i]) * 4) * S[i];
  }
  return out;
}

/** Stroke band: a band that hugs the alpha boundary of the shape. */
export function strokeCoverage(
  S: Float32Array,
  w: number,
  h: number,
  width: number,
  mode: "inside" | "center" | "outside"
): Float32Array {
  const out = new Float32Array(w * h);
  if (mode === "outside") {
    const B = boxBlur(S, w, h, Math.max(1, width));
    for (let i = 0; i < w * h; i++) {
      if (S[i] <= 0.01 && B[i] > 0.01) out[i] = clamp01(B[i] * 2);
    }
    return out;
  }
  if (mode === "inside") {
    const B = boxBlur(S, w, h, Math.max(1, width));
    for (let i = 0; i < w * h; i++) {
      if (S[i] > 0.01) out[i] = clamp01((1 - B[i]) * 2);
    }
    return out;
  }
  const half = Math.max(1, width / 2);
  const Bi = boxBlur(S, w, h, half);
  const Bo = boxBlur(S, w, h, half);
  for (let i = 0; i < w * h; i++) {
    const inner = S[i] > 0.01 ? clamp01((1 - Bi[i]) * 2) : 0;
    const outer = S[i] <= 0.01 && Bo[i] > 0.01 ? clamp01(Bo[i] * 2) * 0.5 : 0;
    out[i] = Math.max(inner, outer);
  }
  return out;
}

/** Bevel shading: directional light estimate from the blurred alpha gradient.
 *  Returns the light-facing coverage and the opposing (shaded) coverage. */
export function bevelCoverage(
  S: Float32Array,
  w: number,
  h: number,
  size: number,
  angleDeg: number
): { highlight: Float32Array; shadow: Float32Array } {
  const B = boxBlur(S, w, h, Math.max(1, size / 2));
  const rad = (angleDeg * Math.PI) / 180;
  const lx = Math.cos(rad);
  const ly = Math.sin(rad);
  const step = Math.max(1, Math.round(size / 2));
  const highlight = new Float32Array(w * h);
  const shadow = new Float32Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = y * w + x;
      if (S[i] <= 0.01) continue;
      const ax = Math.max(0, Math.min(w - 1, Math.round(x + lx * step)));
      const ay = Math.max(0, Math.min(h - 1, Math.round(y + ly * step)));
      const bx = Math.max(0, Math.min(w - 1, Math.round(x - lx * step)));
      const by = Math.max(0, Math.min(h - 1, Math.round(y - ly * step)));
      const grad = B[ay * w + ax] - B[by * w + bx];
      highlight[i] = clamp01(grad * 3) * S[i];
      shadow[i] = (1 - clamp01(grad * 3)) * 0.5 * S[i];
    }
  }
  return { highlight, shadow };
}

/** How much the styled output must bleed past the layer box (outward effects). */
export function computeStylePadding(w: number, h: number, styles: LayerStyles): number {
  let pad = 0;
  if (styles.dropShadow?.enabled) {
    const s = styles.dropShadow;
    pad = Math.max(pad, Math.max(0, Math.abs(s.offsetX), Math.abs(s.offsetY)) + s.blur);
  }
  if (styles.outerGlow?.enabled) {
    const g = styles.outerGlow;
    pad = Math.max(pad, g.blur + Math.max(0, g.spread));
  }
  if (styles.stroke?.enabled) {
    const st = styles.stroke;
    if (st.position !== "inside") pad = Math.max(pad, st.width);
  }
  if (styles.bevel?.enabled) pad = Math.max(pad, styles.bevel.size);
  return Math.min(MAX_PADDING, Math.ceil(pad + 1));
}

// ── low-level canvas helpers ──────────────────────────────────────────

function readAlpha(canvas: HTMLCanvasElement): Float32Array {
  const w = canvas.width;
  const h = canvas.height;
  const ctx = getContext2d(canvas);
  const data = ctx.getImageData(0, 0, w, h).data;
  const out = new Float32Array(w * h);
  for (let i = 0; i < w * h; i++) out[i] = data[i * 4 + 3] / 255;
  return out;
}

function tintAlpha(canvas: HTMLCanvasElement, color: string): void {
  const ctx = getContext2d(canvas);
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalCompositeOperation = "source-in";
  ctx.globalAlpha = 1;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();
}

function coverageCanvas(w: number, h: number, coverage: Float32Array, color: string): HTMLCanvasElement {
  const c = createCanvas(w, h);
  const ctx = getContext2d(c);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, w, h);
  const img = ctx.createImageData(w, h);
  const col = parseColor(color);
  for (let i = 0; i < w * h; i++) {
    const a = clamp01(coverage[i]) * col.a;
    img.data[i * 4] = col.r;
    img.data[i * 4 + 1] = col.g;
    img.data[i * 4 + 2] = col.b;
    img.data[i * 4 + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);
  return c;
}

/**
 * Apply all enabled style effects to `content` (the layer's natural-size
 * raster) and return the padded styled canvas. Returns null when no enabled
 * effect is present so callers keep their existing fast compositing path.
 */
export function applyLayerStyles(content: HTMLCanvasElement, w: number, h: number, styles: LayerStyles | null | undefined): StyledOutput | null {
  const cw = Math.max(1, Math.round(w));
  const ch = Math.max(1, Math.round(h));
  if (cw < 1 || ch < 1) return null;
  if (!styles || !hasAnyStyle(styles)) return null;

  const pad = computeStylePadding(cw, ch, styles);
  const W = cw + pad * 2;
  const H = ch + pad * 2;
  const out = createCanvas(W, H);
  const octx = getContext2d(out);
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.clearRect(0, 0, W, H);

  const place = (tgt: CanvasRenderingContext2D, src: HTMLCanvasElement, x = 0, y = 0, opacity = 1) => {
    tgt.save();
    tgt.setTransform(1, 0, 0, 1, 0, 0);
    tgt.globalCompositeOperation = "source-over";
    tgt.globalAlpha = opacity;
    tgt.drawImage(src, x, y);
    tgt.restore();
  };

  // Filled content copy used to derive per-pixel alpha maps.
  const contentMap = createCanvas(W, H);
  const cmctx = getContext2d(contentMap);
  cmctx.setTransform(1, 0, 0, 1, 0, 0);
  cmctx.clearRect(0, 0, W, H);
  cmctx.drawImage(content, pad, pad, cw, ch);
  const S = readAlpha(contentMap);

  // 1. drop shadow (behind everything)
  if (styles.dropShadow?.enabled) {
    const s = styles.dropShadow;
    const cov = boxBlur(S, W, H, Math.max(0.5, s.blur));
    place(octx, coverageCanvas(W, H, cov, s.color), pad + s.offsetX, pad + s.offsetY, clamp01(s.opacity));
  }

  // 2. outer glow (behind content, after shadow)
  if (styles.outerGlow?.enabled) {
    const g = styles.outerGlow;
    const cov = glowCoverage(S, W, H, Math.max(0.5, g.blur), Math.max(0, g.spread));
    place(octx, coverageCanvas(W, H, cov, g.color), 0, 0, clamp01(g.opacity));
  }

  // 3. the layer content itself
  place(octx, content, pad, pad, 1);

  // 4. color overlay
  if (styles.colorOverlay?.enabled) {
    const o = styles.colorOverlay;
    const oc = createCanvas(W, H);
    const octtx = getContext2d(oc);
    octtx.setTransform(1, 0, 0, 1, 0, 0);
    octtx.clearRect(0, 0, W, H);
    octtx.drawImage(contentMap, 0, 0);
    tintAlpha(oc, o.color);
    place(octx, oc, 0, 0, clamp01(o.opacity));
  }

  // 5. gradient overlay
  if (styles.gradientOverlay?.enabled) {
    const g = styles.gradientOverlay;
    const gc = createCanvas(W, H);
    const gctx = getContext2d(gc);
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.clearRect(0, 0, W, H);
    gctx.drawImage(contentMap, 0, 0);
    gctx.save();
    gctx.globalCompositeOperation = "source-in";
    gctx.globalAlpha = 1;
    const sorted = [...g.stops].sort((a, b) => a.pos - b.pos);
    if (sorted.length === 0) {
      gctx.fillStyle = "#000000";
      gctx.fillRect(0, 0, W, H);
    } else if (sorted.length === 1) {
      gctx.fillStyle = sorted[0].color;
      gctx.fillRect(0, 0, W, H);
    } else {
      let grad: CanvasGradient;
      if (g.gradient === "radial") {
        const cx = pad + cw / 2;
        const cy = pad + ch / 2;
        grad = gctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(cw, ch) / 2 + pad);
      } else {
        const rad = (g.angle * Math.PI) / 180;
        const dx = Math.cos(rad);
        const dy = Math.sin(rad);
        const cx = pad + cw / 2;
        const cy = pad + ch / 2;
        const len = (Math.abs(dx * cw) + Math.abs(dy * ch)) / 2 + pad;
        grad = gctx.createLinearGradient(cx - dx * len, cy - dy * len, cx + dx * len, cy + dy * len);
      }
      for (const stop of sorted) grad.addColorStop(clamp01(stop.pos), stop.color);
      gctx.fillStyle = grad;
      gctx.fillRect(0, 0, W, H);
    }
    gctx.restore();
    place(octx, gc, 0, 0, clamp01(g.opacity));
  }

  // 6. inner shadow / inner glow (edge band tint)
  const innerShadow = styles.innerShadow;
  const innerGlow = styles.innerGlow;
  if (innerShadow?.enabled || innerGlow?.enabled) {
    const radius = Math.max(0.5, innerShadow?.blur ?? innerGlow?.blur ?? 5);
    const band = innerEdgeCoverage(S, W, H, radius);
    if (innerShadow?.enabled) {
      const is = innerShadow;
      const shifted = new Float32Array(W * H);
      for (let y = 0; y < H; y++) {
        for (let x = 0; x < W; x++) {
          const sx = Math.max(0, Math.min(W - 1, x + is.offsetX));
          const sy = Math.max(0, Math.min(H - 1, y + is.offsetY));
          shifted[y * W + x] = band[sy * W + sx];
        }
      }
      place(octx, coverageCanvas(W, H, shifted, is.color), 0, 0, clamp01(is.opacity));
    }
    if (innerGlow?.enabled) {
      const ig = innerGlow;
      place(octx, coverageCanvas(W, H, band, ig.color), 0, 0, clamp01(ig.opacity));
    }
  }

  // 7. bevel & emboss
  if (styles.bevel?.enabled) {
    const b = styles.bevel;
    const { highlight, shadow } = bevelCoverage(S, W, H, Math.max(1, b.size), b.angle);
    octx.save();
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.globalCompositeOperation = "source-over";
    octx.globalAlpha = clamp01(b.opacity) * (1 - clamp01(b.depth));
    octx.drawImage(coverageCanvas(W, H, highlight, b.highlightColor), 0, 0);
    octx.globalAlpha = clamp01(b.opacity) * (0.2 + 0.8 * clamp01(b.depth));
    octx.drawImage(coverageCanvas(W, H, shadow, b.shadowColor), 0, 0);
    octx.restore();
  }

  // 8. stroke (on top)
  if (styles.stroke?.enabled) {
    const st = styles.stroke;
    const cov = strokeCoverage(S, W, H, Math.max(0.5, st.width), st.position);
    place(octx, coverageCanvas(W, H, cov, st.color), 0, 0, clamp01(st.opacity));
  }

  return { canvas: out, pad };
}