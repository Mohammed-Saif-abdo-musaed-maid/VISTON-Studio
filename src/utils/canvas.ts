export function createCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(width));
  c.height = Math.max(1, Math.round(height));
  return c;
}

export function getContext2d(canvas: HTMLCanvasElement): CanvasRenderingContext2D {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("2D canvas context is unavailable");
  return ctx;
}

export function canvasToDataURL(canvas: HTMLCanvasElement, mime = "image/png", quality?: number): string {
  return canvas.toDataURL(mime, quality);
}

export function dataURLToCanvas(dataUrl: string): HTMLCanvasElement | null {
  const img = new Image();
  try {
    const decoded = atob(dataUrl.split(",")[1] ?? "");
    if (!decoded) return null;
  } catch {
    return null;
  }
  // Image decode is async; store synchronously-created canvas and attach onload.
  const c = createCanvas(1, 1);
  img.onload = () => {
    c.width = img.width;
    c.height = img.height;
    c.getContext("2d")?.drawImage(img, 0, 0);
  };
  img.src = dataUrl;
  return c;
}

export async function dataURLToCanvasAsync(dataUrl: string): Promise<HTMLCanvasElement> {
  const img = new Image();
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error("Failed to decode image data."));
    img.src = dataUrl;
  });
  const c = createCanvas(img.width, img.height);
  getContext2d(c).drawImage(img, 0, 0);
  return c;
}

export type Snapshot = { kind: "data"; imageData: ImageData } | { kind: "url"; url: string };

const SNAPSHOT_DATA_BYTE_LIMIT = 48 * 1024 * 1024;

export function snapshotCanvas(
  canvas: HTMLCanvasElement,
  rect: { x: number; y: number; width: number; height: number }
): Snapshot {
  const r = {
    x: Math.max(0, Math.floor(rect.x)),
    y: Math.max(0, Math.floor(rect.y)),
    width: Math.min(canvas.width - Math.max(0, Math.floor(rect.x)), Math.ceil(rect.width)),
    height: Math.min(canvas.height - Math.max(0, Math.floor(rect.y)), Math.ceil(rect.height)),
  };
  if (r.width <= 0 || r.height <= 0) {
    return { kind: "data", imageData: new ImageData(1, 1) };
  }
  const bytes = r.width * r.height * 4;
  if (bytes <= SNAPSHOT_DATA_BYTE_LIMIT) {
    const ctx = getContext2d(canvas);
    const data = ctx.getImageData(r.x, r.y, r.width, r.height);
    return { kind: "data", imageData: data };
  }
  const tmp = createCanvas(r.width, r.height);
  const tctx = getContext2d(tmp);
  tctx.drawImage(canvas, r.x, r.y, r.width, r.height, 0, 0, r.width, r.height);
  return { kind: "url", url: tmp.toDataURL("image/png") };
}

export async function restoreSnapshot(
  canvas: HTMLCanvasElement,
  rect: { x: number; y: number; width: number; height: number },
  snap: Snapshot
): Promise<void> {
  const r = {
    x: Math.max(0, Math.floor(rect.x)),
    y: Math.max(0, Math.floor(rect.y)),
    width: Math.max(0, Math.ceil(rect.width)),
    height: Math.max(0, Math.ceil(rect.height)),
  };
  if (r.width <= 0 || r.height <= 0) return;
  const ctx = getContext2d(canvas);
  if (snap.kind === "data") {
    ctx.putImageData(snap.imageData, r.x, r.y);
  } else {
    const src = await dataURLToCanvasAsync(snap.url);
    ctx.clearRect(r.x, r.y, r.width, r.height);
    ctx.drawImage(src, r.x, r.y, r.width, r.height);
  }
}

export async function imageFileToCanvas(file: File | Blob): Promise<HTMLCanvasElement> {
  const { canvas } = await decodeImageFileSafe(file);
  return canvas;
}

export interface DecodedImage {
  canvas: HTMLCanvasElement;
  naturalWidth: number;
  naturalHeight: number;
}

/**
 * Largest supported dimension for a single decoded image/document canvas.
 * Decoding above this limit would allocate unbounded GPU/CPU buffers and can
 * crash the browser, so oversized sources are eagerly (but safely) rescaled.
 */
export const MAX_DECODED_IMAGE_DIMENSION = 20000;

/**
 * Render-safe pixel-area cap for a single decoded image / document canvas.
 * The per-side cap alone can still admit bitmaps whose total area exceeds what
 * browsers allow a single 2D drawing surface to be: Firefox refuses to create
 * a context above ~124.9M px² (Chromium hard-caps each side at 16384). A canvas
 * whose surface cannot be allocated used to leave the viewport permanently
 * black after import, so decoded bitmaps are also capped by total area while
 * the aspect ratio is preserved.
 */
export const MAX_DECODED_IMAGE_AREA = 124_000_000;

/**
 * Decode a raster image file using the browser's native image decoder.
 *
 * - Preserves the original pixel dimensions by default.
 * - If a side exceeds {@link MAX_DECODED_IMAGE_DIMENSION}, the bitmap is
 *   downscaled while preserving the aspect ratio so the editor never grows
 *   to an unrenderable size. The original (natural) dimensions are reported
 *   so callers can keep provenance info.
 * - Rejects with a clear, user-facing message instead of leaving a blank layer.
 */
export async function decodeImageFileSafe(file: File | Blob): Promise<DecodedImage> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Unable to decode the image. The file may be corrupted or unsupported."));
      img.src = url;
    });
    const naturalWidth = img.naturalWidth || img.width;
    const naturalHeight = img.naturalHeight || img.height;
    if (!Number.isFinite(naturalWidth) || !Number.isFinite(naturalHeight) || naturalWidth <= 0 || naturalHeight <= 0) {
      throw new Error("The image file has no usable pixel dimensions.");
    }
    let w = naturalWidth;
    let h = naturalHeight;
    if (w > MAX_DECODED_IMAGE_DIMENSION || h > MAX_DECODED_IMAGE_DIMENSION) {
      const scale = MAX_DECODED_IMAGE_DIMENSION / Math.max(w, h);
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));
    }
    if (w * h > MAX_DECODED_IMAGE_AREA) {
      const scale = Math.sqrt(MAX_DECODED_IMAGE_AREA / (w * h));
      w = Math.max(1, Math.round(w * scale));
      h = Math.max(1, Math.round(h * scale));
      while (w > 1 && h > 1 && w * h > MAX_DECODED_IMAGE_AREA) {
        if (w >= h) w -= 1; else h -= 1;
      }
    }
    const c = createCanvas(w, h);
    getContext2d(c).drawImage(img, 0, 0, w, h);
    return { canvas: c, naturalWidth, naturalHeight };
  } finally {
    URL.revokeObjectURL(url);
  }
}