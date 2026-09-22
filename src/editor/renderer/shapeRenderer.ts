import type { PathPoint, ShapeLayer } from "../core/types";
import { clamp } from "../../utils/math";

export interface PathCmd {
  kind: "move" | "line" | "cubic";
  x: number;
  y: number;
  c1x?: number;
  c1y?: number;
  c2x?: number;
  c2y?: number;
}

/** Trace a shape's pathData into canvas commands plus a sampled polyline (for ray-casting selection). */
export function traceShapePath(points: PathPoint[], closed: boolean): { cmds: PathCmd[]; outline: number[][] } {
  const cmds: PathCmd[] = [];
  const outline: number[][] = [];
  if (points.length === 0) return { cmds, outline };
  const n = points.length;
  const last = points[n - 1];
  const closedReal = closed || (Math.hypot(points[0].x - last.x, points[0].y - last.y) < 1e-4);
  const segCount = (closedReal ? n : n - 1) || 0;
  for (let s = 0; s < segCount; s++) {
    const p0 = points[s];
    const p1 = points[(s + 1) % n];
    if (s === 0) {
      cmds.push({ kind: "move", x: p0.x, y: p0.y });
      outline.push([p0.x, p0.y]);
    }
    // c1 leaves p0 (out handle, or mirrored in-handle when smooth).
    let c1x = p0.x + p0.outX;
    let c1y = p0.y + p0.outY;
    let hasC0 = p0.outX !== 0 || p0.outY !== 0;
    if (!hasC0 && p0.smooth && (p0.inX !== 0 || p0.inY !== 0)) {
      c1x = p0.x - p0.inX;
      c1y = p0.y - p0.inY;
      hasC0 = true;
    }
    // c2 arrives at p1 (in handle, or mirrored out-handle when smooth).
    let c2x = p1.x + p1.inX;
    let c2y = p1.y + p1.inY;
    let hasC1 = p1.inX !== 0 || p1.inY !== 0;
    if (!hasC1 && p1.smooth && (p1.outX !== 0 || p1.outY !== 0)) {
      c2x = p1.x - p1.outX;
      c2y = p1.y - p1.outY;
      hasC1 = true;
    }
    if (hasC0 || hasC1) {
      cmds.push({ kind: "cubic", x: p1.x, y: p1.y, c1x, c1y, c2x, c2y });
      // Sample the cubic with a fixed subdivision grid.
      for (let k = 1; k <= 16; k++) {
        const t = k / 16;
        const mt = 1 - t;
        const cx = mt * mt * mt * p0.x + 3 * mt * mt * t * c1x + 3 * mt * t * t * c2x + t * t * t * p1.x;
        const cy = mt * mt * mt * p0.y + 3 * mt * mt * t * c1y + 3 * mt * t * t * c2y + t * t * t * p1.y;
        outline.push([cx, cy]);
      }
    } else {
      cmds.push({ kind: "line", x: p1.x, y: p1.y });
      outline.push([p1.x, p1.y]);
    }
  }
  return { cmds, outline };
}

function traceShapePathLayer(layer: ShapeLayer): { cmds: PathCmd[]; outline: number[][]; closed: boolean } {
  const pts = layer.pathData ?? [];
  const fallback = layer.pathPoints ?? [];
  const closed = pts.length >= 3;
  if (pts.length >= 2) {
    return { ...traceShapePath(pts, closed), closed };
  }
  const cmds: PathCmd[] = [];
  const outline: number[][] = [];
  if (fallback.length >= 2) {
    fallback.forEach((p, i) => cmds.push({ kind: i === 0 ? "move" : "line", x: p[0], y: p[1] }));
    fallback.forEach((p) => outline.push([p[0], p[1]]));
  }
  return { cmds, outline, closed: closed && fallback.length >= 3 };
}

function applyPathCmds(ctx: CanvasRenderingContext2D, cmds: PathCmd[], closed: boolean): void {
  ctx.beginPath();
  for (const c of cmds) {
    if (c.kind === "move") ctx.moveTo(c.x, c.y);
    else if (c.kind === "line") ctx.lineTo(c.x, c.y);
    else ctx.bezierCurveTo(c.c1x!, c.c1y!, c.c2x!, c.c2y!, c.x, c.y);
  }
  if (closed) ctx.closePath();
}

export function drawShapeLayer(ctx: CanvasRenderingContext2D, layer: ShapeLayer): void {
  const w = layer.transform.width;
  const h = layer.transform.height;
  const sw = layer.strokeWidth;
  ctx.save();
  ctx.globalAlpha = clamp(layer.opacity, 0, 1);
  if (layer.shape === "rect" || layer.shape === "roundedRect") {
    const hasFill = !!layer.fill;
    const hasStroke = !!layer.stroke;
    const radius = layer.shape === "roundedRect" ? Math.min(layer.cornerRadius ?? 0, w / 2, h / 2) : 0;
    const pathRounded = radius > 0;
    const drawPath = (): void => {
      if (pathRounded) {
        const r = radius;
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(w - r, 0);
        ctx.quadraticCurveTo(w, 0, w, r);
        ctx.lineTo(w, h - r);
        ctx.quadraticCurveTo(w, h, w - r, h);
        ctx.lineTo(r, h);
        ctx.quadraticCurveTo(0, h, 0, h - r);
        ctx.lineTo(0, r);
        ctx.quadraticCurveTo(0, 0, r, 0);
        ctx.closePath();
      } else {
        ctx.rect(0, 0, w, h);
      }
    };
    if (hasFill || hasStroke) {
      drawPath();
      if (hasFill) {
        ctx.fillStyle = layer.fill as string;
        ctx.fill();
      }
      if (hasStroke) {
        ctx.strokeStyle = layer.stroke as string;
        ctx.lineWidth = sw;
        ctx.stroke();
      }
    } else {
      ctx.lineWidth = 1;
      ctx.strokeStyle = "#000";
      drawPath();
      ctx.stroke();
    }
  } else if (layer.shape === "ellipse") {
    const hasFill = !!layer.fill;
    const hasStroke = !!layer.stroke;
    const cx = w / 2;
    const cy = h / 2;
    ctx.beginPath();
    ctx.ellipse(cx, cy, Math.max(0.5, w / 2 - (hasStroke ? sw : 0) / 2), Math.max(0.5, h / 2 - (hasStroke ? sw : 0) / 2), 0, 0, Math.PI * 2);
    if (hasFill) {
      ctx.fillStyle = layer.fill as string;
      ctx.fill();
    }
    if (hasStroke) {
      ctx.strokeStyle = layer.stroke as string;
      ctx.lineWidth = sw;
      ctx.stroke();
    }
    if (!hasFill && !hasStroke) {
      ctx.strokeStyle = "#000";
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  } else if (layer.shape === "path") {
    const t = traceShapePathLayer(layer);
    if (t.cmds.length >= 2) {
      applyPathCmds(ctx, t.cmds, t.closed);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      if (layer.fill && t.closed) {
        ctx.fillStyle = layer.fill as string;
        ctx.fill();
      }
      if (layer.stroke) {
        ctx.strokeStyle = layer.stroke as string;
        ctx.lineWidth = Math.max(0.5, layer.strokeWidth);
        ctx.stroke();
      } else if (!layer.fill) {
        ctx.strokeStyle = "#000";
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  } else {
    const hasStroke = !!layer.stroke;
    const stroke = hasStroke ? (layer.stroke as string) : "#000";
    ctx.strokeStyle = stroke;
    ctx.fillStyle = stroke;
    ctx.lineWidth = sw;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    if (layer.shape === "polygon" || layer.shape === "star") {
      const cx = w / 2;
      const cy = h / 2;
      const outerR = Math.min(w, h) / 2 - (hasStroke ? sw / 2 : 0);
      const innerR = layer.shape === "star" ? outerR * Math.max(0, Math.min(1, layer.starRatio ?? 0.4)) : outerR;
      const n = Math.max(3, Math.round(layer.points ?? 5));
      if (innerR > 0) {
        const count = layer.shape === "star" ? n * 2 : n;
        ctx.beginPath();
        for (let i = 0; i <= count; i++) {
          const r = layer.shape === "star" ? (i % 2 === 0 ? outerR : innerR) : outerR;
          const a = (i / count) * Math.PI * 2 - Math.PI / 2;
          const px = cx + r * Math.cos(a);
          const py = cy + r * Math.sin(a);
          if (i === 0) ctx.moveTo(px, py);
          else ctx.lineTo(px, py);
        }
        ctx.closePath();
        if (layer.fill) {
          const f = ctx.fillStyle;
          ctx.fillStyle = layer.fill;
          ctx.fill();
          ctx.fillStyle = f;
        }
        if (hasStroke) ctx.stroke();
        if (!layer.fill && !hasStroke) ctx.stroke();
      }
    } else if (layer.shape === "line") {
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(w, h);
      ctx.stroke();
    } else {
      const len = Math.hypot(w, h);
      if (len > 0) {
        const unitX = w / len;
        const unitY = h / len;
        const headLen = Math.max(8, sw * 3.5);
        const tipX = w;
        const tipY = h;
        const baseX = tipX - unitX * headLen;
        const baseY = tipY - unitY * headLen;
        const normalX = -unitY;
        const normalY = unitX;
        const headW = headLen * 0.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(baseX, baseY);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(tipX, tipY);
        ctx.lineTo(baseX + normalX * headW, baseY + normalY * headW);
        ctx.lineTo(baseX - normalX * headW, baseY - normalY * headW);
        ctx.closePath();
        ctx.fill();
      }
    }
  }
  ctx.restore();
}

export function drawLayerThumbnail(layer: ShapeLayer, size: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = size;
  c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return c;
  const scale = size / Math.max(layer.transform.width, layer.transform.height, 1);
  ctx.save();
  ctx.scale(scale, scale);
  drawShapeLayer(ctx, layer);
  ctx.restore();
  return c;
}