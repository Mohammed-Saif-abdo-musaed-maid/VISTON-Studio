/**
 * Phase 28 — Import format capabilities.
 *
 * This is an *honest* capability descriptor, not a parser. Raster decoding is
 * delegated to the browser's built-in image decoder (via `decodeImageFileSafe`),
 * so anything the browser can decode works natively. Formats the browser cannot
 * decode are reported as unsupported instead of being silently mis-labelled.
 */

export type ImportSupport = "native" | "rasterized" | "unsupported";

export interface ImportFormatInfo {
  id: string;
  label: string;
  /** MIME types the file picker should accept for this format. */
  mimes: string[];
  /** Lower-case extensions (with dot) the file picker should accept. */
  extensions: string[];
  support: ImportSupport;
  /** Human-readable note shown in the audit / UI. */
  note: string;
}

export const IMPORT_FORMATS: ImportFormatInfo[] = [
  { id: "png", label: "PNG", mimes: ["image/png"], extensions: [".png"], support: "native", note: "Decoded by the browser; alpha preserved." },
  { id: "jpeg", label: "JPEG", mimes: ["image/jpeg"], extensions: [".jpg", ".jpeg"], support: "native", note: "Decoded by the browser (EXIF orientation applied by the browser decoder)." },
  { id: "webp", label: "WebP", mimes: ["image/webp"], extensions: [".webp"], support: "native", note: "Decoded by the browser when supported." },
  { id: "gif", label: "GIF", mimes: ["image/gif"], extensions: [".gif"], support: "native", note: "First frame is imported; animation is not preserved." },
  { id: "bmp", label: "BMP", mimes: ["image/bmp"], extensions: [".bmp"], support: "native", note: "Decoded by the browser when supported." },
  { id: "svg", label: "SVG", mimes: ["image/svg+xml"], extensions: [".svg"], support: "rasterized", note: "Rasterized at the SVG's intrinsic size; it becomes a raster layer." },
  { id: "tiff", label: "TIFF", mimes: ["image/tiff"], extensions: [".tif", ".tiff"], support: "unsupported", note: "Browsers cannot decode TIFF without a dedicated decoder, which this build does not include." },
];

/** `accept` attribute value for an image file input. */
export function importAcceptString(): string {
  const mimes = new Set<string>();
  const exts = new Set<string>();
  for (const f of IMPORT_FORMATS) {
    for (const m of f.mimes) mimes.add(m);
    for (const e of f.extensions) exts.add(e);
  }
  return [...mimes, ...exts].join(",");
}

function extensionOf(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i).toLowerCase() : "";
}

export function importFormatFor(file: { name: string; type?: string }): ImportFormatInfo | null {
  const ext = extensionOf(file.name);
  const mime = (file.type ?? "").toLowerCase();
  return (
    IMPORT_FORMATS.find((f) => f.extensions.includes(ext)) ??
    IMPORT_FORMATS.find((f) => mime !== "" && f.mimes.includes(mime)) ??
    null
  );
}

/**
 * Throws a clear error for formats this build genuinely cannot decode.
 * Unknown formats are allowed through so the browser decoder can try (and fail
 * with its own honest error) rather than being rejected by a stale allow-list.
 */
export function assertImportable(file: { name: string; type?: string }): ImportFormatInfo | null {
  const info = importFormatFor(file);
  if (info && info.support === "unsupported") {
    throw new Error(`${info.label} import is not supported: ${info.note}`);
  }
  return info;
}
