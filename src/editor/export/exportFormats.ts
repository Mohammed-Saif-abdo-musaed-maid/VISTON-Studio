/**
 * Phase 27 — Export format registry + honest encoder.
 *
 * Central place that describes which raster formats Vision Studio can actually
 * produce, and encodes a composed canvas into the requested format. It exists
 * so the UI, commands and engine all agree on format identity (mime,
 * extension, alpha support) and so unsupported formats fail loudly instead of
 * writing mislabelled bytes.
 *
 * Deliberately NOT here: TIFF / SVG / PDF. None can be produced correctly by
 * the current Canvas 2D architecture without inventing an encoder, so they are
 * not advertised as exportable.
 */

import { BMP_MIME, canvasToRgbaImage, encodeBmp } from "./bmpEncoder";

export type ExportFormat = "png" | "jpeg" | "webp" | "bmp";

export interface ExportFormatInfo {
  id: ExportFormat;
  label: string;
  extension: string;
  mime: string;
  /** Lossy formats honour the quality setting; lossless ones ignore it. */
  lossy: boolean;
  supportsAlpha: boolean;
}

export const EXPORT_FORMATS: readonly ExportFormatInfo[] = [
  { id: "png", label: "PNG", extension: "png", mime: "image/png", lossy: false, supportsAlpha: true },
  { id: "jpeg", label: "JPEG", extension: "jpg", mime: "image/jpeg", lossy: true, supportsAlpha: false },
  { id: "webp", label: "WebP", extension: "webp", mime: "image/webp", lossy: true, supportsAlpha: true },
  { id: "bmp", label: "BMP", extension: "bmp", mime: BMP_MIME, lossy: false, supportsAlpha: true },
];

export const DEFAULT_EXPORT_FORMAT: ExportFormat = "png";

export function isExportFormat(value: unknown): value is ExportFormat {
  return typeof value === "string" && EXPORT_FORMATS.some((f) => f.id === value);
}

export function exportFormatInfo(format: ExportFormat): ExportFormatInfo {
  const found = EXPORT_FORMATS.find((f) => f.id === format);
  return found ?? EXPORT_FORMATS[0]!;
}

export function exportFormatMime(format: ExportFormat): string {
  return exportFormatInfo(format).mime;
}

export function exportFormatExtension(format: ExportFormat): string {
  return exportFormatInfo(format).extension;
}

export function exportFormatSupportsAlpha(format: ExportFormat): boolean {
  return exportFormatInfo(format).supportsAlpha;
}

/** Lossless formats ignore a quality value; lossy formats clamp to 1..100. */
export function normalizeExportQuality(format: ExportFormat, quality?: number): number | undefined {
  if (!exportFormatInfo(format).lossy) return undefined;
  if (typeof quality !== "number" || !Number.isFinite(quality)) return 0.92;
  return Math.min(1, Math.max(0.01, quality > 1 ? quality / 100 : quality));
}

/** Probe whether this browser's canvas can actually encode the given mime. */
export function canvasCanEncode(canvas: HTMLCanvasElement, mime: string): boolean {
  try {
    return canvas.toDataURL(mime).startsWith(`data:${mime}`);
  } catch {
    return false;
  }
}

function toBlob(canvas: HTMLCanvasElement, mime: string, quality?: number): Promise<Blob | null> {
  return new Promise<Blob | null>((resolve) => {
    try {
      canvas.toBlob((blob) => resolve(blob), mime, quality);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Encode a composed canvas into a real file blob. Throws a user-facing error
 * for formats this browser cannot encode rather than returning fake bytes.
 */
export async function encodeCanvasToBlob(
  canvas: HTMLCanvasElement,
  format: ExportFormat,
  quality?: number
): Promise<Blob> {
  if (format === "bmp") {
    return encodeBmp(canvasToRgbaImage(canvas), { transparent: true });
  }
  const mime = exportFormatMime(format);
  if (format === "webp" && !canvasCanEncode(canvas, mime)) {
    throw new Error("WebP export is not supported by this browser.");
  }
  const blob = await toBlob(canvas, mime, normalizeExportQuality(format, quality));
  if (!blob) throw new Error(`${exportFormatInfo(format).label} export is not supported by this browser.`);
  // Guard against silent fallback (e.g. a WebP request returning PNG bytes).
  if (format !== "png" && blob.type && !blob.type.startsWith(mime)) {
    throw new Error(`${exportFormatInfo(format).label} export is not supported by this browser.`);
  }
  return blob;
}
