import { selectionEngine } from "../../editor/selection/selectionEngine";
import type { AISelection, AIMask } from "../types";

/** Extract a full-document raster mask from the current editor selection. */
export function aiSelectionFromEditor(): AISelection | null {
  if (!selectionEngine.hasSelection) return null;
  const mask = selectionEngine.getMask();
  if (!mask) return null;
  const [w, h] = selectionEngine.dims;
  return {
    kind: "raster-mask",
    bounds: computeMaskBounds(mask, w, h),
    mask: { width: w, height: h, data: new Uint8Array(mask), weight: 1 },
  };
}

/** Write an AI-provided mask/selection into the editor selection engine. */
export function applyAiSelectionToEditor(sel: AISelection | null): void {
  if (!sel) {
    selectionEngine.clear();
    return;
  }
  const [w, h] = selectionEngine.dims;
  if (w < 1 || h < 1) return;

  const full = new Uint8ClampedArray(w * h);
  const src = sel.mask;
  if (src && src.width === w && src.height === h && src.data.length === w * h) {
    for (let i = 0; i < full.length; i++) {
      full[i] = src.data[i] > 0 ? 1 : 0;
    }
  } else if (sel.bounds) {
    const b = sel.bounds;
    const x0 = Math.max(0, Math.round(b.x));
    const y0 = Math.max(0, Math.round(b.y));
    const x1 = Math.min(w, Math.round(b.x + b.width));
    const y1 = Math.min(h, Math.round(b.y + b.height));
    for (let y = y0; y < y1; y++) {
      for (let x = x0; x < x1; x++) {
        full[y * w + x] = 1;
        if (sel.kind === "ellipse") {
          const cx = b.x + b.width / 2;
          const cy = b.y + b.height / 2;
          const dx = (x - cx) / (b.width / 2);
          const dy = (y - cy) / (b.height / 2);
          if (dx * dx + dy * dy > 1) full[y * w + x] = 0;
        }
      }
    }
  } else {
    return;
  }
  selectionEngine.setMask(full);
}

/** Downsample our mask for sensing-frame transport (kept doc-sized elsewhere). */
export function aiMaskFromEngine(): AIMask | null {
  if (!selectionEngine.hasSelection) return null;
  const [w, h] = selectionEngine.dims;
  const mask = selectionEngine.getMask();
  if (!mask) return null;
  return { width: w, height: h, data: new Uint8Array(mask), weight: 1 };
}

function computeMaskBounds(mask: Uint8ClampedArray, w: number, h: number): { x: number; y: number; width: number; height: number } | null {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (minX === Infinity) return null;
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}