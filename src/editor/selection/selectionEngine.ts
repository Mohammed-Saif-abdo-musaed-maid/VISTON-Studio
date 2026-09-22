export type SelectionShapeKind = "rect" | "ellipse" | "lasso";

export interface SelectionShape {
  kind: SelectionShapeKind;
  x: number;
  y: number;
  width: number;
  height: number;
  lassoPath?: number[][];
}

export type SelectionMode = "replace" | "add" | "subtract" | "intersect";

function clampU(v: number): number {
  return v < 0 ? 0 : v > 255 ? 255 : v;
}

function pointInPoly(px: number, py: number, path: number[][]): boolean {
  let inside = false;
  for (let i = 0, j = path.length - 1; i < path.length; j = i++) {
    const xi = path[i][0], yi = path[i][1];
    const xj = path[j][0], yj = path[j][1];
    if (
      ((yi > py) !== (yj > py)) &&
      (px < ((xj - xi) * (py - yi)) / (yj - yi) + xi)
    ) {
      inside = !inside;
    }
  }
  return inside;
}

export class SelectionEngine {
  private mask: Uint8ClampedArray | null = null;
  private width = 0;
  private height = 0;
  private visibleShape: SelectionShape | null = null;
  private hidden = false;
  private listeners = new Set<() => void>();

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    for (const fn of this.listeners) fn();
  }

  resize(width: number, height: number): void {
    if (this.width !== width || this.height !== height) {
      this.mask = null;
      this.width = width;
      this.height = height;
    }
  }

  get hasSelection(): boolean {
    if (!this.mask) return false;
    for (let i = 0; i < this.mask.length; i++) if (this.mask[i] > 0) return true;
    return false;
  }

  get dims(): [number, number] {
    return [this.width, this.height];
  }

  get shape(): SelectionShape | null {
    return this.visibleShape;
  }

  setShape(shape: SelectionShape | null): void {
    this.visibleShape = shape;
    this.notify();
  }

  aspectRect(w: number, h: number): SelectionShape {
    return { kind: "rect", x: w / 2 - 100, y: h / 2 - 100, width: 200, height: 200 };
  }

  setRect(kind: SelectionShapeKind, x: number, y: number, w: number, h: number, mode: SelectionMode): void {
    const shape: SelectionShape = { kind, x, y, width: w, height: h };
    this.visibleShape = shape;
    this.applyShape(shape, mode);
    this.notify();
  }

  setLasso(points: number[][], mode: SelectionMode): void {
    if (points.length < 3) return;
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of points) {
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
    }
    const shape: SelectionShape = {
      kind: "lasso",
      x: minX,
      y: minY,
      width: maxX - minX || 1,
      height: maxY - minY || 1,
      lassoPath: points,
    };
    this.visibleShape = shape;
    this.applyShape(shape, mode);
  }

  selectMagicWand(imageData: ImageData, tolerance: number, startX: number, startY: number, mode: SelectionMode): void {
    const { width: w, height: h } = this;
    const src = imageData.data;
    const newMask = new Uint8ClampedArray(w * h);
    const sx = Math.max(0, Math.min(w - 1, Math.round(startX)));
    const sy = Math.max(0, Math.min(h - 1, Math.round(startY)));
    const si = (sy * w + sx) * 4;
    const sr = src[si];
    const sg = src[si + 1];
    const sb = src[si + 2];
    const tol2 = tolerance * tolerance;
    const stack: [number, number][] = [[sx, sy]];
    const visited = new Uint8Array(w * h);
    while (stack.length > 0) {
      const [x, y] = stack.pop()!;
      const idx = y * w + x;
      if (visited[idx]) continue;
      visited[idx] = 1;
      const pi = idx * 4;
      const dr = src[pi] - sr;
      const dg = src[pi + 1] - sg;
      const db = src[pi + 2] - sb;
      if (dr * dr + dg * dg + db * db > tol2) continue;
      newMask[idx] = 1;
      if (x > 0) stack.push([x - 1, y]);
      if (x < w - 1) stack.push([x + 1, y]);
      if (y > 0) stack.push([x, y - 1]);
      if (y < h - 1) stack.push([x, y + 1]);
    }
    this.visibleShape = null;
    const mask = this.fillMask();
    if (mode === "replace") {
      this.mask = newMask;
    } else if (mode === "add") {
      for (let i = 0; i < mask.length; i++) mask[i] = mask[i] > 0 || newMask[i] > 0 ? 1 : 0;
    } else if (mode === "intersect") {
      for (let i = 0; i < mask.length; i++) mask[i] = mask[i] > 0 && newMask[i] > 0 ? 1 : 0;
    } else {
      for (let i = 0; i < mask.length; i++) mask[i] = mask[i] > 0 && newMask[i] === 0 ? 1 : 0;
    }
  }

  private mergeSimilar(mode: SelectionMode, add: Uint8ClampedArray): void {
    const mask = this.fillMask();
    if (mode === "replace") {
      this.mask = new Uint8ClampedArray(add);
    } else if (mode === "add") {
      for (let i = 0; i < mask.length; i++) mask[i] = mask[i] > 0 || add[i] > 0 ? 1 : 0;
    } else if (mode === "intersect") {
      for (let i = 0; i < mask.length; i++) mask[i] = mask[i] > 0 && add[i] > 0 ? 1 : 0;
    } else {
      for (let i = 0; i < mask.length; i++) mask[i] = mask[i] > 0 && add[i] === 0 ? 1 : 0;
    }
  }

  /**
   * Select every pixel in the document whose color is within `tolerance` of the
   * sampled color at (startX, startY) — the "Select > Similar" behavior across
   * the whole image, unlike the wand which is contiguous. `mode` composes with
   * the existing mask exactly like the wand modes.
   */
  selectSimilar(imageData: ImageData, tolerance: number, startX: number, startY: number, mode: SelectionMode): void {
    const { width: w, height: h } = this;
    const src = imageData.data;
    if (!src || w <= 0 || h <= 0) return;
    const sx = Math.max(0, Math.min(w - 1, Math.round(startX)));
    const sy = Math.max(0, Math.min(h - 1, Math.round(startY)));
    const si = (sy * w + sx) * 4;
    const sr = src[si];
    const sg = src[si + 1];
    const sb = src[si + 2];
    const tol2 = tolerance * tolerance;
    const newMask = new Uint8ClampedArray(w * h);
    let n = w * h;
    for (let i = 0; i < n; i++) {
      const pi = i * 4;
      const dr = src[pi] - sr;
      const dg = src[pi + 1] - sg;
      const db = src[pi + 2] - sb;
      if (dr * dr + dg * dg + db * db <= tol2) newMask[i] = 1;
    }
    this.visibleShape = null;
    this.mergeSimilar(mode, newMask);
    this.notify();
  }

  /**
   * Reduce the selection to a ring of the given width around its boundary
   * (Select > Border). Operates on the raster mask.
   */
  border(width: number): void {
    if (!this.mask || width <= 0) return;
    const w = this.width;
    const h = this.height;
    const r = Math.round(width);
    const tmp = new Uint8ClampedArray(this.mask.length);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        if (this.mask[row + x] === 0) continue;
        let keep = 0;
        outer: for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy > r * r) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h || this.mask[ny * w + nx] === 0) {
              keep = 1;
              break outer;
            }
          }
        }
        tmp[row + x] = keep;
      }
    }
    this.mask = tmp;
    this.notify();
  }

  /**
   * Smooth selection edges: box blur the mask then re-threshold at 50%
   * (Select > Refine / Smooth). Removes stray single pixels and jagged edges.
   */
  smooth(radius: number): void {
    if (!this.mask || radius <= 0) return;
    const w = this.width;
    const h = this.height;
    const r = Math.max(1, Math.round(radius));
    const k = r * 2 + 1;
    const tmp = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      const row = y * w;
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let ky = -r; ky <= r; ky++) {
          const sy = y + ky < 0 ? 0 : y + ky >= h ? h - 1 : y + ky;
          const srow = sy * w;
          for (let kx = -r; kx <= r; kx++) {
            const sx = x + kx < 0 ? 0 : x + kx >= w ? w - 1 : x + kx;
            s += this.mask[srow + sx] > 0 ? 1 : 0;
          }
        }
        tmp[row + x] = s / (k * k);
      }
    }
    const out = new Uint8ClampedArray(w * h);
    for (let i = 0; i < out.length; i++) out[i] = tmp[i] >= 0.5 ? 255 : 0;
    this.mask = out;
    this.notify();
  }

  feather(radius: number): void {
    if (!this.mask || radius <= 0) return;
    const r = Math.round(Math.min(radius, 100));
    const k = r * 2 + 1;
    const sigma = Math.max(0.6, r / 2);
    const kernel = new Float32Array(k);
    let sum = 0;
    for (let i = 0; i < k; i++) {
      const x = i - r;
      kernel[i] = Math.exp(-(x * x) / (2 * sigma * sigma));
      sum += kernel[i];
    }
    for (let i = 0; i < k; i++) kernel[i] /= sum;
    const w = this.width;
    const h = this.height;
    const temp = new Float32Array(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let i = 0; i < k; i++) {
          const sx = x + i - r;
          const cx = sx < 0 ? 0 : sx >= w ? w - 1 : sx;
          s += this.mask[y * w + cx] * kernel[i];
        }
        temp[y * w + x] = s;
      }
    }
    const out = new Uint8ClampedArray(w * h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let s = 0;
        for (let i = 0; i < k; i++) {
          const sy = y + i - r;
          const cy = sy < 0 ? 0 : sy >= h ? h - 1 : sy;
          s += temp[cy * w + x] * kernel[i];
        }
        out[y * w + x] = clampU(Math.round(s));
      }
    }
    this.mask = out;
    this.notify();
  }

  expand(px: number): void {
    if (!this.mask || px <= 0) return;
    const w = this.width;
    const h = this.height;
    const r = Math.round(px);
    const tmp = new Uint8ClampedArray(this.mask.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let hit = 0;
        outer: for (let dy = -r; dy <= r; dy++) {
          for (let dx = -r; dx <= r; dx++) {
            if (dx * dx + dy * dy > r * r) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx >= 0 && nx < w && ny >= 0 && ny < h && this.mask[ny * w + nx] > 0) {
              hit = 1;
              break outer;
            }
          }
        }
        tmp[y * w + x] = hit;
      }
    }
    this.mask = tmp;
    this.notify();
  }

  contract(px: number): void {
    if (!this.mask || px <= 0) return;
    const w = this.width;
    const h = this.height;
    const r = Math.round(px);
    const tmp = new Uint8ClampedArray(this.mask.length);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (this.mask[y * w + x] === 0) continue;
        let all = 1;
        for (let dy = -r; dy <= r && all === 1; dy++) {
          for (let dx = -r; dx <= r && all === 1; dx++) {
            if (dx * dx + dy * dy > r * r) continue;
            const nx = x + dx;
            const ny = y + dy;
            if (nx < 0 || nx >= w || ny < 0 || ny >= h || this.mask[ny * w + nx] === 0) all = 0;
          }
        }
        tmp[y * w + x] = all;
      }
    }
    this.mask = tmp;
    this.notify();
  }

  applyShapeMask(shape: SelectionShape, mode: SelectionMode): void {
    this.applyShape(shape, mode);
  }

  /** Set/add/subtract/intersect a selection from an arbitrary polygon outline
   *  whose coordinates are in *layer-local* space, offset by (offsetX, offsetY). */
  applyPolygon(path: number[][], offsetX: number, offsetY: number, mode: SelectionMode = "replace"): void {
    const { width, height } = this;
    if (path.length < 3) return;
    const mask = this.fillMask();
    for (let y = 0; y < height; y++) {
      for (let x = 0; x < width; x++) {
        const inside = pointInPoly(x + 0.5 - offsetX, y + 0.5 - offsetY, path);
        const idx = y * width + x;
        if (mode === "add") {
          if (inside) mask[idx] = 1;
        } else if (mode === "subtract") {
          if (inside) mask[idx] = 0;
        } else if (mode === "intersect") {
          if (!inside) mask[idx] = 0;
        } else {
          mask[idx] = inside ? 1 : 0;
        }
      }
    }
    this.mask = mask;
    this.visibleShape = null;
    this.notify();
  }

  private applyShape(shape: SelectionShape, mode: SelectionMode): void {
    const { width, height } = this;
    const mask = this.fillMask();
    if (shape.kind === "lasso") {
      const path = shape.lassoPath ?? [];
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const inside = path.length >= 3 && pointInPoly(x + 0.5, y + 0.5, path);
          const idx = y * width + x;
          if (mode === "add") {
            if (inside) mask[idx] = 1;
          } else if (mode === "subtract") {
            if (inside) mask[idx] = 0;
          } else if (mode === "intersect") {
            if (!inside) mask[idx] = 0;
          } else {
            mask[idx] = inside ? 1 : 0;
          }
        }
      }
    } else {
      const x0 = Math.round(shape.x);
      const y0 = Math.round(shape.y);
      const x1 = Math.round(shape.x + shape.width);
      const y1 = Math.round(shape.y + shape.height);
      const cx = x0 + (x1 - x0) / 2;
      const cy = y0 + (y1 - y0) / 2;
      const rx = Math.max(0, (x1 - x0) / 2);
      const ry = Math.max(0, (y1 - y0) / 2);
      const isEllipse = shape.kind !== "rect";
      if (mode === "replace") mask.fill(0);
      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const inside =
            isEllipse
              ? ((x - cx + 0.5) / Math.max(1, rx)) ** 2 + ((y - cy + 0.5) / Math.max(1, ry)) ** 2 <= 1
              : x >= x0 && x < x1 && y >= y0 && y < y1;
          const idx = y * width + x;
          if (mode === "add") {
            if (inside) mask[idx] = 1;
          } else if (mode === "subtract") {
            if (inside) mask[idx] = 0;
          } else if (mode === "intersect") {
            if (!inside) mask[idx] = 0;
          } else {
            mask[idx] = inside ? 1 : 0;
          }
        }
      }
    }
    this.mask = mask;
    this.notify();
  }

  private fillMask(): Uint8ClampedArray {
    if (this.mask && this.mask.length === this.width * this.height) return this.mask;
    this.mask = new Uint8ClampedArray(this.width * this.height);
    return this.mask;
  }

  invert(): void {
    if (!this.mask) return;
    for (let i = 0; i < this.mask.length; i++) {
      this.mask[i] = this.mask[i] > 0 ? 0 : 1;
    }
    this.notify();
  }

  clear(mode: SelectionMode = "replace"): void {
    this.mask = null;
    this.visibleShape = null;
    void mode;
    this.notify();
  }

  makeAll(): void {
    this.mask = new Uint8ClampedArray(this.width * this.height).fill(1);
    this.visibleShape = null;
    this.notify();
  }

  getMask(width?: number, height?: number): Uint8ClampedArray | null {
    if ((width && width !== this.width) || (height && height !== this.height)) return null;
    return this.mask ? new Uint8ClampedArray(this.mask) : null;
  }

  setMask(mask: Uint8ClampedArray): void {
    if (mask.length === this.width * this.height) {
      this.mask = new Uint8ClampedArray(mask);
      this.visibleShape = null;
      this.notify();
    }
  }

  toggleVisibility(hidden: boolean): void {
    this.hidden = hidden;
  }

  isHidden(): boolean {
    return this.hidden;
  }

  selectionToCanvas(): HTMLCanvasElement | null {
    if (!this.mask) return null;
    const c = document.createElement("canvas");
    c.width = this.width;
    c.height = this.height;
    const ctx = c.getContext("2d");
    if (!ctx) return null;
    const img = ctx.createImageData(this.width, this.height);
    for (let i = 0; i < this.mask.length; i++) {
      const pi = i * 4;
      img.data[pi] = 0;
      img.data[pi + 1] = 0;
      img.data[pi + 2] = 0;
      img.data[pi + 3] = this.mask[i];
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }
}

export const selectionEngine = new SelectionEngine();
