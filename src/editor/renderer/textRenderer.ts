import type { TextDirection, TextLayer } from "../core/types";
import { createCanvas, getContext2d } from "../../utils/canvas";
import { clamp } from "../../utils/math";

/** Convert a #rrggbb color plus opacity to an rgba() string for canvas shadows. */
function shadowColorWithOpacity(color: string, opacity: number): string {
  if (opacity >= 1 || !color || color[0] !== "#" || color.length < 7) return color;
  const r = parseInt(color.slice(1, 3), 16);
  const g = parseInt(color.slice(3, 5), 16);
  const b = parseInt(color.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${Math.max(0, Math.min(1, opacity))})`;
}

export interface TextStyle {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: "normal" | "italic";
  letterSpacing: number;
  lineHeight: number;
  direction: TextDirection;
  stroke?: { color: string; width: number };
  shadow?: { offsetX: number; offsetY: number; blur: number; color: string };
}

export function fontString(s: TextStyle): string {
  const weight = s.fontWeight >= 600 ? "600" : "400";
  const style = s.fontStyle === "italic" ? "italic " : "";
  let family = s.fontFamily || "sans-serif";
  if (/[^A-Za-z0-9_ -]/.test(family) || family.includes(" ")) {
    if (!family.includes('"') && !family.includes(",")) family = `"${family}"`;
  }
  return `${style}${weight} ${s.fontSize}px ${family}`;
}

/** Apply letterSpacing natively when the runtime supports it (keeps Arabic letter shaping intact). */
function nativeSpacing(ctx: CanvasRenderingContext2D, spacing: number): boolean {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if (c.letterSpacing === undefined) return false;
  c.letterSpacing = `${spacing}px`;
  return true;
}

function resetSpacing(ctx: CanvasRenderingContext2D): void {
  const c = ctx as CanvasRenderingContext2D & { letterSpacing?: string };
  if (c.letterSpacing !== undefined) c.letterSpacing = "0px";
}

/** Fill a text run with optional stroke outline and drop shadow. */
function drawRun(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
  fillColor: string,
  stroke?: { color: string; width: number },
  shadow?: { offsetX: number; offsetY: number; blur: number; color: string }
): void {
  ctx.save();
  if (shadow) {
    ctx.shadowColor = shadow.color;
    ctx.shadowBlur = shadow.blur;
    ctx.shadowOffsetX = shadow.offsetX;
    ctx.shadowOffsetY = shadow.offsetY;
  }
  if (stroke && stroke.width > 0) {
    ctx.strokeStyle = stroke.color;
    ctx.lineWidth = stroke.width;
    ctx.lineJoin = "round";
    ctx.strokeText(text, x, y);
  }
  ctx.fillStyle = fillColor;
  ctx.fillText(text, x, y);
  ctx.restore();
}

function fitWithin(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let low = 1;
  let high = text.length;
  while (low < high) {
    const mid = (low + high + 1) >> 1;
    if (ctx.measureText(text.slice(0, mid)).width <= maxWidth) low = mid;
    else high = mid - 1;
  }
  return text.slice(0, low);
}

export function linesOf(text: string, ctx: CanvasRenderingContext2D, style: TextStyle, maxWidth: number): string[] {
  const paragraphs = text.split("\n");
  const lines: string[] = [];
  for (const para of paragraphs) {
    if (para === "") {
      lines.push("");
      continue;
    }
    const words = para.split(" ");
    let current = "";
    for (const word of words) {
      const candidate = current ? `${current} ${word}` : word;
      if (ctx.measureText(candidate).width <= maxWidth || !current) current = candidate;
      else {
        lines.push(current);
        current = word;
      }
    }
    lines.push(current);
  }
  return lines;
}

export function measureTextBounds(
  text: string,
  style: TextStyle,
  maxWidth?: number
): { width: number; height: number } {
  const c = createCanvas(1, 1);
  const ctx = getContext2d(c);
  ctx.font = fontString(style);
  ctx.direction = style.direction;
  const w = maxWidth ?? Math.max(1, ctx.measureText(text).width || 1);
  const lines = linesOf(text, ctx, style, maxWidth ? w - 4 : Infinity);
  const maxLine = lines.reduce((m, l) => Math.max(m, ctx.measureText(l).width), 0);
  const lineH = style.fontSize * style.lineHeight;
  return {
    width: Math.max(1, maxWidth ? w : Math.ceil(maxLine)),
    height: Math.max(style.fontSize * 1.2, lines.length * lineH),
  };
}

/** Largest scale factor in [lo, 1] that still fits text+box. */
function computeAutoFitScale(text: string, style: TextStyle, w: number, h: number): number {
  if (!text) return 1;
  let lo = 0.05;
  let hi = 1;
  let best = 1;
  for (let i = 0; i < 14; i++) {
    const mid = (lo + hi) / 2;
    const bounds = measureTextBounds(text, { ...style, fontSize: style.fontSize * mid }, w);
    if (bounds.width <= w && bounds.height <= h) {
      best = mid;
      lo = mid;
    } else {
      hi = mid;
    }
  }
  return best;
}

export interface DrawTextOptions {
  fill: string;
  align: "left" | "center" | "right" | "justify";
}

function drawJustifiedLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  style: TextStyle,
  fillColor: string,
  xStart: number,
  y: number,
  availWidth: number
): void {
  const words = line.split(" ");
  const gaps = words.length - 1;
  if (gaps === 0) {
    drawRun(ctx, line, xStart, y, fillColor, style.stroke, style.shadow);
    return;
  }
  const lineWidth = ctx.measureText(line).width;
  const extra = Math.max(0, availWidth - lineWidth);
  const gap = extra / gaps;
  const spacing = style.letterSpacing || 0;
  let cx = xStart;
  for (let i = 0; i < words.length; i++) {
    const word = words[i];
    if (spacing > 0) {
      for (const ch of word) {
        drawRun(ctx, ch, cx, y, fillColor, style.stroke, style.shadow);
        cx += ctx.measureText(ch).width + spacing;
      }
      cx -= spacing;
    } else {
      drawRun(ctx, word, cx, y, fillColor, style.stroke, style.shadow);
      cx += ctx.measureText(word).width;
    }
    if (i < gaps) cx += gap;
  }
}

export function drawText(
  ctx: CanvasRenderingContext2D,
  text: string,
  style: TextStyle,
  options: DrawTextOptions,
  boxWidth: number,
  boxHeight: number,
  clip = false,
  scale = 1
): void {
  ctx.save();
  ctx.font = fontString(style);
  ctx.textBaseline = "alphabetic";
  ctx.direction = style.direction;
  ctx.fillStyle = options.fill;
  const w = Math.max(1, boxWidth);
  const lines = linesOf(text, ctx, style, w - 2);
  const lineH = style.fontSize * style.lineHeight;
  const totalH = lines.length * lineH;
  const startY = (boxHeight - totalH) / 2 + style.fontSize * 0.8;
  if (clip) {
    ctx.beginPath();
    ctx.rect(0, 0, boxWidth, boxHeight);
    ctx.clip();
  }
  const native = style.letterSpacing > 0 && nativeSpacing(ctx, style.letterSpacing);
  if (scale !== 1) ctx.scale(scale, scale);
  let y = startY;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    let x: number;
    const visual = style.direction === "rtl";
    const justify = options.align === "justify" && i < lines.length - 1;
    if (options.align === "center") x = w / 2;
    else if (options.align === "right") x = visual ? w - 2 : w;
    else x = visual ? w : 2;
    if (justify) {
      drawJustifiedLine(ctx, line, style, options.fill, visual ? w - 2 : 2, y, w - 4);
      y += lineH;
      continue;
    }
    if (style.letterSpacing > 0 && !native) {
      let cx = options.align === "center" ? x - ctx.measureText(line).width / 2 : options.align === "right" ? x - ctx.measureText(line).width : x;
      const step = style.letterSpacing;
      for (const ch of line) {
        drawRun(ctx, ch, cx, y, options.fill, style.stroke, style.shadow);
        cx += ctx.measureText(ch).width + step;
      }
    } else {
      ctx.textAlign = options.align === "center" ? "center" : options.align === "right" ? (visual ? "left" : "right") : visual ? "right" : "left";
      drawRun(ctx, line, x, y, options.fill, style.stroke, style.shadow);
    }
    y += lineH;
  }
  if (native) resetSpacing(ctx);
  ctx.restore();
}

// ── text on a path ──

interface PathSegment { x0: number; y0: number; dx: number; dy: number; len: number; angle: number; }

function buildPath(path: number[][]): { segs: PathSegment[]; total: number } | null {
  if (path.length < 2) return null;
  const segs: PathSegment[] = [];
  let total = 0;
  for (let i = 1; i < path.length; i++) {
    const x0 = path[i - 1][0];
    const y0 = path[i - 1][1];
    const dx = path[i][0] - x0;
    const dy = path[i][1] - y0;
    const len = Math.hypot(dx, dy);
    if (len < 0.001) continue;
    segs.push({ x0, y0, dx: dx / len, dy: dy / len, len, angle: Math.atan2(dy, dx) });
    total += len;
  }
  return segs.length ? { segs, total } : null;
}

function pathPos(data: { segs: PathSegment[]; total: number }, d: number): { x: number; y: number; angle: number } {
  const target = clamp(d, 0, data.total);
  let acc = 0;
  for (const s of data.segs) {
    if (acc + s.len >= target) {
      const t = (target - acc) / s.len;
      return { x: s.x0 + s.dx * s.len * t, y: s.y0 + s.dy * s.len * t, angle: s.angle };
    }
    acc += s.len;
  }
  const last = data.segs[data.segs.length - 1];
  return { x: last.x0 + last.dx * last.len, y: last.y0 + last.dy * last.len, angle: last.angle };
}

function drawTextOnPath(ctx: CanvasRenderingContext2D, layer: TextLayer, style: TextStyle, w: number, h: number): void {
  const data = buildPath(layer.textPath!.points);
  if (!data || layer.text.length === 0) return;
  const align = layer.align === "justify" ? "left" : layer.align;
  ctx.font = fontString(style);
  const spacing = style.letterSpacing || 0;
  const lineAdvance = style.fontSize * style.lineHeight * 1.6;
  const chars = layer.direction === "rtl" ? Array.from(layer.text).reverse() : Array.from(layer.text);
  const widths: number[] = [];
  for (const ch of chars) {
    if (ch === "\n") widths.push(0);
    else widths.push(ctx.measureText(ch).width);
  }
  let total = 0;
  for (let i = 0; i < chars.length; i++) {
    if (chars[i] === "\n") continue;
    total += widths[i] + (i < chars.length - 1 ? spacing : 0);
  }
  let start = 0;
  if (align === "right") start = data.total - total;
  else if (align === "center") start = (data.total - total) / 2;
  if (layer.overflowHidden) {
    ctx.beginPath();
    ctx.rect(0, 0, w, h);
    ctx.clip();
  }
  ctx.fillStyle = layer.color;
  ctx.textBaseline = "alphabetic";
  let d = start;
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (ch === "\n") {
      d += lineAdvance;
      continue;
    }
    const cw = widths[i];
    const p = pathPos(data, d + cw / 2);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.angle);
    ctx.textAlign = "center";
    drawRun(ctx, ch, 0, 0, layer.color, style.stroke, style.shadow);
    ctx.restore();
    d += cw + spacing;
  }
}

export function drawTextLayer(ctx: CanvasRenderingContext2D, layer: TextLayer): void {
  const style: TextStyle = {
    fontFamily: layer.fontFamily,
    fontSize: layer.fontSize,
    fontWeight: layer.fontWeight,
    fontStyle: layer.fontStyle,
    letterSpacing: layer.letterSpacing,
    lineHeight: layer.lineHeight,
    direction: layer.direction,
    stroke: layer.stroke && layer.strokeWidth > 0 ? { color: layer.stroke, width: layer.strokeWidth } : undefined,
    shadow: layer.shadow ? { offsetX: layer.shadow.offsetX, offsetY: layer.shadow.offsetY, blur: layer.shadow.blur, color: shadowColorWithOpacity(layer.shadow.color, layer.shadow.opacity) } : undefined,
  };
  const w = Math.max(1, layer.transform.width);
  const h = Math.max(1, layer.transform.height);
  const align = layer.align;
  ctx.save();
  ctx.globalAlpha = clamp(layer.opacity, 0, 1);
  if (layer.textPath && layer.textPath.points.length >= 2) {
    drawTextOnPath(ctx, layer, style, w, h);
  } else {
    const scale = layer.autoFit ? computeAutoFitScale(layer.text, style, layer.transform.width, layer.transform.height) : 1;
    drawText(
      ctx,
      layer.text,
      style,
      { fill: layer.color, align },
      w,
      h,
      layer.overflowHidden,
      scale
    );
  }
  ctx.restore();
}