import { describe, it, expect, vi } from "vitest";
import {
  applyLayerStyles,
  computeStylePadding,
} from "../renderer/styleRenderer";
import { emptyLayerStyles, defaultLayerStyle, LayerStyles } from "../core/types";

/* Minimal software canvas so applyLayerStyles can run its real raster passes
 * (getImageData / putImageData / createImageData / drawImage) under node. */

class Sctx {
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  imageSmoothingEnabled = true;
  fillStyle: unknown = "#ffffff";
  strokeStyle = "#ffffff";
  filter = "none";
  constructor(private c: Sc) {}
  setTransform(): void {}
  save(): void {}
  restore(): void {}
  clearRect(x: number, y: number, w: number, h: number): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.c.width, Math.round(x + w));
    const y1 = Math.min(this.c.height, Math.round(y + h));
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * this.c.width + xx) * 4;
        this.c.data[i] = this.c.data[i + 1] = this.c.data[i + 2] = this.c.data[i + 3] = 0;
      }
    }
  }
  createImageData(w: number, h: number): { width: number; height: number; data: Uint8ClampedArray } {
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) };
  }
  getImageData(x: number, y: number, w: number, h: number): { width: number; height: number; data: Uint8ClampedArray } {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const out = new Uint8ClampedArray(w * h * 4);
    for (let yy = 0; yy < h; yy++) {
      const sy = y0 + yy;
      for (let xx = 0; xx < w; xx++) {
        const sx = x0 + xx;
        if (sy < 0 || sx < 0 || sy >= this.c.height || sx >= this.c.width) continue;
        const si = (sy * this.c.width + sx) * 4;
        const di = (yy * w + xx) * 4;
        for (let k = 0; k < 4; k++) out[di + k] = this.c.data[si + k];
      }
    }
    return { width: w, height: h, data: out };
  }
  putImageData(img: { width: number; height: number; data: Uint8ClampedArray }, x: number, y: number): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    for (let yy = 0; yy < img.height; yy++) {
      const sy = y0 + yy;
      if (sy < 0 || sy >= this.c.height) continue;
      for (let xx = 0; xx < img.width; xx++) {
        const sx = x0 + xx;
        if (sx < 0 || sx >= this.c.width) continue;
        const si = (yy * img.width + xx) * 4;
        const di = (sy * this.c.width + sx) * 4;
        for (let k = 0; k < 4; k++) this.c.data[di + k] = img.data[si + k];
      }
    }
  }
  drawImage(src: Sc, ...pos: number[]): void {
    let sx = 0, sy = 0, sw = src.width, sh = src.height, dx = 0, dy = 0, dw = src.width, dh = src.height;
    if (pos.length === 2) [dx, dy] = pos;
    else if (pos.length === 5) [dx, dy, dw, dh] = pos;
    else if (pos.length === 8) [sx, sy, sw, sh, dx, dy, dw, dh] = pos;
    else if (pos.length === 9) [sx, sy, sw, sh, dx, dy, dw, dh] = pos;
    for (let yy = 0; yy < Math.min(dh, this.c.height - dy); yy++) {
      const syy = sy + Math.min(src.height - 1, Math.floor((yy / dh) * sh));
      if (syy < 0 || syy >= src.height) continue;
      for (let xx = 0; xx < Math.min(dw, this.c.width - dx); xx++) {
        const sxx = sx + Math.min(src.width - 1, Math.floor((xx / dw) * sw));
        if (sxx < 0 || sxx >= src.width) continue;
        const si = (syy * src.width + sxx) * 4;
        const di = ((dy + yy) * this.c.width + (dx + xx)) * 4;
        if (this.globalCompositeOperation === "destination-in") {
          this.c.data[di + 3] = Math.round((this.c.data[di + 3] * src.data[si + 3]) / 255);
        } else {
          for (let k = 0; k < 4; k++) this.c.data[di + k] = src.data[si + k];
        }
      }
    }
  }
  fillRect(x: number, y: number, w: number, h: number): void {
    const x0 = Math.max(0, Math.round(x));
    const y0 = Math.max(0, Math.round(y));
    const x1 = Math.min(this.c.width, Math.round(x + w));
    const y1 = Math.min(this.c.height, Math.round(y + h));
    const s = typeof this.fillStyle === "string" ? (this.fillStyle as string).trim() : "#000000";
    const rgb = /^#?([0-9a-f]{6})$/i.exec(s);
    const r = rgb ? parseInt(rgb[1]!.slice(0, 2), 16) : 0;
    const g = rgb ? parseInt(rgb[1]!.slice(2, 4), 16) : 0;
    const b = rgb ? parseInt(rgb[1]!.slice(4, 6), 16) : 0;
    for (let yy = y0; yy < y1; yy++) {
      for (let xx = x0; xx < x1; xx++) {
        const i = (yy * this.c.width + xx) * 4;
        this.c.data[i] = r;
        this.c.data[i + 1] = g;
        this.c.data[i + 2] = b;
        this.c.data[i + 3] = 255;
      }
    }
  }
  get canvas(): Sc {
    return this.c;
  }
}

class Sc {
  _ctx: Sctx | null = null;
  data: Uint8ClampedArray;
  constructor(public width: number, public height: number) {
    this.width = Math.max(1, Math.round(width));
    this.height = Math.max(1, Math.round(height));
    this.data = new Uint8ClampedArray(this.width * this.height * 4);
  }
  getContext(): Sctx {
    if (!this._ctx) this._ctx = new Sctx(this);
    return this._ctx;
  }
  toDataURL(): string {
    return "data:image/png;base64,fake";
  }
}

vi.mock("../../utils/canvas", () => ({
  createCanvas: vi.fn((w: number, h: number) => new Sc(w, h)),
  getContext2d: vi.fn((c: Sc) => c.getContext()),
  decodeImageFileSafe: vi.fn(),
  imageFileToCanvas: vi.fn(),
  dataURLToCanvasAsync: vi.fn(),
  snapshotCanvas: vi.fn(() => null),
  restoreSnapshot: vi.fn(),
}));

function solidContent(w: number, h: number): Sc {
  const c = new Sc(w, h);
  const ctx = c.getContext();
  ctx.fillStyle = "#4f8cff";
  ctx.fillRect(0, 0, w, h);
  return c;
}

function alphaAt(c: Sc, x: number, y: number): number {
  if (x < 0 || y < 0 || x >= c.width || y >= c.height) return 0;
  return c.data[(y * c.width + x) * 4 + 3];
}

describe("layer style raster pipeline (software canvas)", () => {
  it("renders a drop shadow into the padding area without touching pixels at the seam", () => {
    const cw = 8, ch = 6;
    const src = solidContent(cw, ch);
    const styles = emptyLayerStyles();
    styles.dropShadow = { ...defaultLayerStyle("dropShadow"), offsetX: 2, offsetY: 3, blur: 0, opacity: 0.8 } as LayerStyles["dropShadow"];

    const pad = computeStylePadding(cw, ch, styles);
    expect(pad).toBe(4);

    const out = applyLayerStyles(src as unknown as HTMLCanvasElement, cw, ch, styles)!;
    const sc = out.canvas as unknown as Sc;

    // A pixel that ONLY the down-right shadow reaches is painted.
    expect(alphaAt(sc, pad + cw + 1, pad + ch / 2 + 3)).toBeGreaterThan(0);
    expect(alphaAt(sc, pad + 2 + cw - 1, pad + 3 + ch - 1)).toBeGreaterThan(0);
    // Content itself is still drawn in the centre of the padded box.
    expect(alphaAt(sc, pad + cw / 2, pad + ch / 2)).toBeGreaterThan(0);
    // A pixel that only the (down-right) shadow covers is painted.
    expect(alphaAt(sc, pad + cw, pad + ch + 1)).toBeGreaterThan(0);
    // The extreme, empty corners of the padded box stay clear (pad covers the
// blur/offsets); a faint blur impulse may reach the far corner but never the
// surrounding empty top/left/right margins.
expect(alphaAt(sc, 0, 0)).toBe(0);
expect(alphaAt(sc, sc.width - 1, 0)).toBe(0);
expect(alphaAt(sc, 0, sc.height - 1)).toBe(0);
expect(alphaAt(sc, sc.width - 1, sc.height - 1)).toBeLessThan(64);
  });

  it("keeps outward effects inside the computed padding", () => {
    const cw = 10, ch = 10;
    const src = solidContent(cw, ch);
    const styles = emptyLayerStyles();
    styles.outerGlow = { ...defaultLayerStyle("outerGlow"), blur: 2, spread: 1, opacity: 0.6 } as LayerStyles["outerGlow"];
    const out = applyLayerStyles(src as unknown as HTMLCanvasElement, cw, ch, styles)!;
    expect(out.pad).toBe(computeStylePadding(cw, ch, styles));
    const sc = out.canvas as unknown as Sc;
    // Glow reaches a point just past the content box boundary inside the pad.
    expect(alphaAt(sc, out.pad + cw + 1, out.pad + 1)).toBeGreaterThan(0);
    expect(alphaAt(sc, cw / 2 + out.pad, ch / 2 + out.pad)).toBeGreaterThan(0); // content present
  });

  it("an outside stroke spills past the content into the padding", () => {
    const cw = 8, ch = 8;
    const src = solidContent(cw, ch);
    const styles = emptyLayerStyles();
    styles.stroke = { ...defaultLayerStyle("stroke"), width: 2, position: "outside", color: "#ff0000" } as LayerStyles["stroke"];
    const out = applyLayerStyles(src as unknown as HTMLCanvasElement, cw, ch, styles)!;
    const sc = out.canvas as unknown as Sc;
    // Just outside the content box but within the pad: stroke paint present.
    const p = out.pad;
    expect(alphaAt(sc, p + cw + 1, p + 1)).toBeGreaterThan(0);
  });
});