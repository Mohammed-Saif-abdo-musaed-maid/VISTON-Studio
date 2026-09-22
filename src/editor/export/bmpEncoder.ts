/**
 * Phase 27 — Real BMP encoder.
 *
 * The previous BMP export path called `canvas.toBlob("image/bmp")`. No browser
 * implements a BMP encoder, so `toBlob` silently falls back to PNG bytes that
 * were then written with a `.bmp` extension — a fake file. This module writes a
 * genuine BMP from raw RGBA pixels.
 *
 * Format written: Windows BITMAPV4HEADER, 32-bit BGRA, BI_BITFIELDS with
 * explicit RGBA channel masks and an sRGB colour-space tag. That layout keeps
 * the alpha channel intact while remaining readable by common image tools.
 */

import { hexToRgba } from "../../utils/color";

export interface RgbaImage {
  width: number;
  height: number;
  data: Uint8ClampedArray | Uint8Array;
}

export interface BmpEncodeOptions {
  /** Keep the alpha channel (32-bit BGRA). When false the image is flattened. */
  transparent?: boolean;
  /** Background colour used when flattening. Defaults to opaque white. */
  background?: string | null;
}

const FILE_HEADER_SIZE = 14;
const V4_HEADER_SIZE = 108;
const PIXEL_OFFSET = FILE_HEADER_SIZE + V4_HEADER_SIZE;
const BI_BITFIELDS = 3;
/** LCS_sRGB, stored little-endian as bytes "BGRs". */
const LCS_SRGB = 0x73524742;

export const BMP_MIME = "image/bmp";

/** Encode raw RGBA pixels into a real, spec-compliant BMP blob. */
export function encodeBmp(image: RgbaImage, opts: BmpEncodeOptions = {}): Blob {
  const width = Math.max(1, Math.round(image.width));
  const height = Math.max(1, Math.round(image.height));
  const transparent = opts.transparent !== false;
  const bg = transparent ? null : hexToRgba(opts.background ?? "#ffffff");

  const rowSize = width * 4;
  const imageSize = rowSize * height;
  const buffer = new ArrayBuffer(PIXEL_OFFSET + imageSize);
  const view = new DataView(buffer);

  // BITMAPFILEHEADER
  view.setUint8(0, 0x42); // 'B'
  view.setUint8(1, 0x4d); // 'M'
  view.setUint32(2, buffer.byteLength, true);
  view.setUint32(6, 0, true);
  view.setUint32(10, PIXEL_OFFSET, true);

  // BITMAPV4HEADER
  view.setUint32(14, V4_HEADER_SIZE, true);
  view.setInt32(18, width, true);
  view.setInt32(22, height, true); // positive => bottom-up rows
  view.setUint16(26, 1, true); // planes
  view.setUint16(28, 32, true); // bits per pixel
  view.setUint32(30, BI_BITFIELDS, true);
  view.setUint32(34, imageSize, true);
  view.setInt32(38, 2835, true); // ~72 DPI
  view.setInt32(42, 2835, true);
  view.setUint32(46, 0, true); // colours used
  view.setUint32(50, 0, true); // important colours
  view.setUint32(54, 0x00ff0000, true); // red mask
  view.setUint32(58, 0x0000ff00, true); // green mask
  view.setUint32(62, 0x000000ff, true); // blue mask
  view.setUint32(66, 0xff000000, true); // alpha mask
  view.setUint32(70, LCS_SRGB, true);
  // Endpoints + gamma values (offsets 74..121) intentionally stay zero.

  const src = image.data;
  let o = PIXEL_OFFSET;
  for (let y = height - 1; y >= 0; y--) {
    let s = y * width * 4;
    for (let x = 0; x < width; x++) {
      let r = src[s] ?? 0;
      let g = src[s + 1] ?? 0;
      let b = src[s + 2] ?? 0;
      let a = src[s + 3] ?? 255;
      if (bg) {
        const af = a / 255;
        r = Math.round(r * af + bg.r * (1 - af));
        g = Math.round(g * af + bg.g * (1 - af));
        b = Math.round(b * af + bg.b * (1 - af));
        a = 255;
      }
      view.setUint8(o, b);
      view.setUint8(o + 1, g);
      view.setUint8(o + 2, r);
      view.setUint8(o + 3, a);
      o += 4;
      s += 4;
    }
  }

  return new Blob([buffer], { type: BMP_MIME });
}

/** Read RGBA pixels from a canvas for encoding. */
export function canvasToRgbaImage(canvas: HTMLCanvasElement): RgbaImage {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas context is unavailable");
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}
