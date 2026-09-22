import { describe, it, expect } from "vitest";
import {
  EXPORT_FORMATS,
  exportFormatExtension,
  exportFormatInfo,
  exportFormatMime,
  exportFormatSupportsAlpha,
  isExportFormat,
  normalizeExportQuality,
} from "../export/exportFormats";
import { encodeBmp, BMP_MIME, type RgbaImage } from "../export/bmpEncoder";

function bytesOf(blob: Blob): Promise<Uint8Array> {
  return blob.arrayBuffer().then((b) => new Uint8Array(b));
}

function px(data: number[][]): RgbaImage {
  const h = data.length;
  const w = data[0]!.length / 4;
  return { width: w, height: h, data: new Uint8ClampedArray(data.flat()) };
}

describe("Export format registry (Phase 27)", () => {
  it("advertises exactly the formats the app can really produce", () => {
    expect(EXPORT_FORMATS.map((f) => f.id)).toEqual(["png", "jpeg", "webp", "bmp"]);
    expect(isExportFormat("png")).toBe(true);
    expect(isExportFormat("tiff")).toBe(false);
    expect(isExportFormat("svg")).toBe(false);
    expect(isExportFormat("pdf")).toBe(false);
  });

  it("reports mime / extension / alpha per format", () => {
    expect(exportFormatMime("jpeg")).toBe("image/jpeg");
    expect(exportFormatExtension("jpeg")).toBe("jpg");
    expect(exportFormatExtension("bmp")).toBe("bmp");
    expect(exportFormatSupportsAlpha("png")).toBe(true);
    expect(exportFormatSupportsAlpha("jpeg")).toBe(false);
    expect(exportFormatInfo("webp").lossy).toBe(true);
  });

  it("ignores quality for lossless formats and clamps lossy ones", () => {
    expect(normalizeExportQuality("png", 50)).toBeUndefined();
    expect(normalizeExportQuality("jpeg", 92)).toBeCloseTo(0.92, 5);
    expect(normalizeExportQuality("jpeg", 0.5)).toBe(0.5);
    expect(normalizeExportQuality("webp", 1000)).toBe(1);
    expect(normalizeExportQuality("webp", -5)).toBe(0.01);
  });
});

describe("Real BMP encoder (Phase 27)", () => {
  it("writes a genuine BMP file header and DIB header", async () => {
    const image = px([
      [255, 0, 0, 255, 0, 255, 0, 255],
      [0, 0, 255, 255, 255, 255, 255, 128],
    ]);
    const blob = encodeBmp(image);
    expect(blob.type).toBe(BMP_MIME);
    const b = await bytesOf(blob);

    expect(b[0]).toBe(0x42);
    expect(b[1]).toBe(0x4d);
    const view = new DataView(b.buffer, b.byteOffset, b.byteLength);
    expect(view.getUint32(2, true)).toBe(b.length);
    expect(view.getUint32(10, true)).toBe(14 + 108);
    expect(view.getUint32(14, true)).toBe(108);
    expect(view.getInt32(18, true)).toBe(2);
    expect(view.getInt32(22, true)).toBe(2);
    expect(view.getUint16(26, true)).toBe(1);
    expect(view.getUint16(28, true)).toBe(32);
    expect(view.getUint32(30, true)).toBe(3);
    expect(view.getUint32(54, true)).toBe(0x00ff0000);
    expect(view.getUint32(66, true)).toBe(0xff000000);
  });

  it("stores BGRA, bottom-up, preserving alpha", async () => {
    const image = px([
      [10, 20, 30, 40, 50, 60, 70, 80],
      [90, 100, 110, 120, 130, 140, 150, 160],
    ]);
    const b = await bytesOf(encodeBmp(image));
    const start = 14 + 108;
    // bottom row first: (90,100,110,120) then (130,140,150,160) as BGRA
    expect(Array.from(b.slice(start, start + 4))).toEqual([110, 100, 90, 120]);
    expect(Array.from(b.slice(start + 4, start + 8))).toEqual([150, 140, 130, 160]);
    expect(Array.from(b.slice(start + 8, start + 12))).toEqual([30, 20, 10, 40]);
  });

  it("flattens alpha over a background when transparency is disabled", async () => {
    const image = px([[255, 0, 0, 0, 0, 0, 0, 0]]);
    const b = await bytesOf(encodeBmp(image, { transparent: false, background: "#ffffff" }));
    const start = 14 + 108;
    expect(Array.from(b.slice(start, start + 4))).toEqual([255, 255, 255, 255]);
  });

  it("never emits PNG signature bytes", async () => {
    const b = await bytesOf(encodeBmp(px([[1, 2, 3, 255]])));
    expect(Array.from(b.slice(0, 8))).not.toEqual([137, 80, 78, 71, 13, 10, 26, 10]);
  });
});
