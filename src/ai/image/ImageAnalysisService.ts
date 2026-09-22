import type { AIImageData, AIResult } from "../types";
import { AIError } from "../core/AIError";

export interface LocalAnalysisStats {
  dimensions: { width: number; height: number; megapixels: number };
  colorMode: string;
  dominantColors: Array<{ hex: string; ratio: number }>;
  colorCount: number;
  luminance: { mean: number; stddev: number; min: number; max: number };
  darkRatio: number;
  midRatio: number;
  lightRatio: number;
  brightness: string;
  contrast: string;
  edgeDensity: number;
  colorfulness: number;
  alphaCoverage: number | null;
  prompt: string | null;
  note: string;
}

async function samplePixels(canvas: HTMLCanvasElement): Promise<ImageData | null> {
  const maxSide = 256;
  const scale = Math.min(1, maxSide / Math.max(canvas.width, canvas.height));
  const w = Math.max(1, Math.round(canvas.width * scale));
  const h = Math.max(1, Math.round(canvas.height * scale));
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;
  ctx.imageSmoothingEnabled = true;
  ctx.drawImage(canvas, 0, 0, w, h);
  return ctx.getImageData(0, 0, w, h);
}

function rgbDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

/** Real, deterministic pixel statistics over a downsampled copy. */
export class ImageAnalysisService {
  async analyzeLocal(image: AIImageData): Promise<AIResult> {
    if (!image.canvas || image.canvas.width < 1 || image.canvas.height < 1) {
      throw new AIError("invalid-image", "No image available to analyze.", "analyzeImage");
    }

    const data = await samplePixels(image.canvas);
    const stats = this.computeStats(image, data);
    const structured: Record<string, unknown> = {
      kind: "local-stats",
      ...stats,
    };

    return {
      request: {
        id: `local-${Date.now()}`,
        operation: "analyzeImage",
        provider: "local",
        model: null,
        image,
        selection: null,
        params: {},
        createdAt: Date.now(),
        cacheKey: null,
      },
      canvas: null,
      text: `Local image statistics only ${stats.note}`,
      structured,
      selection: null,
      metadata: { origin: "local", note: stats.note },
      origin: "local",
      createdAt: Date.now(),
      provider: "local",
      model: null,
    };
  }

  private computeStats(image: AIImageData, data: ImageData | null): LocalAnalysisStats {
    const w = image.width;
    const h = image.height;
    const dimensions = { width: w, height: h, megapixels: (w * h) / 1_000_000 };

    const colorMode = data?.data.some((_, i) => i % 4 === 3 && data.data[i] < 255)
      ? "RGBA with transparency"
      : "RGB (opaque)";

    let alphaCoverage: number | null = null;
    if (data) {
      let transparent = 0;
      for (let i = 3; i < data.data.length; i += 4) if (data.data[i] < 255) transparent++;
      alphaCoverage = data.data.length > 0 ? transparent / (data.data.length / 4) : 0;
    }

    if (!data) {
      const empty: LocalAnalysisStats = {
        dimensions,
        colorMode,
        dominantColors: [],
        colorCount: 0,
        luminance: { mean: 0, stddev: 0, min: 0, max: 0 },
        darkRatio: 0,
        midRatio: 0,
        lightRatio: 0,
        brightness: "unknown",
        contrast: "unknown",
        edgeDensity: 0,
        colorfulness: 0,
        alphaCoverage,
        prompt: null,
        note: "sampling failed",
      };
      return empty;
    }

    const px = data.data;
    const n = px.length / 4;

    const buckets = new Map<number, { count: number; r: number; g: number; b: number }>();
    const addBucket = (r: number, g: number, b: number): void => {
      const qr = Math.min(7, Math.floor(r / 32));
      const qg = Math.min(7, Math.floor(g / 32));
      const qb = Math.min(7, Math.floor(b / 32));
      const key = (qr << 6) | (qg << 3) | qb;
      const rec = buckets.get(key);
      if (rec) {
        rec.count += 1;
        rec.r += r;
        rec.g += g;
        rec.b += b;
      } else {
        buckets.set(key, { count: 1, r, g, b });
      }
    };

    let lumSum = 0;
    let dark = 0;
    let mid = 0;
    let light = 0;
    let colorfulness = 0;

    for (let i = 0; i < px.length; i += 4) {
      const r = px[i];
      const g = px[i + 1];
      const b = px[i + 2];
      addBucket(r, g, b);
      const lum = 0.2126 * r + 0.7152 * g + 0.0722 * b;
      lumSum += lum;
      if (lum < 60) dark++;
      else if (lum < 200) mid++;
      else light++;
      colorfulness += Math.max(r, g, b) - Math.min(r, g, b);
    }

    const meanLum = lumSum / n;
    let varSum = 0;
    for (let i = 0; i < px.length; i += 4) {
      const lum = 0.2126 * px[i] + 0.7152 * px[i + 1] + 0.0722 * px[i + 2];
      varSum += (lum - meanLum) ** 2;
    }
    const stddev = Math.sqrt(varSum / n);

    const colorful = colorfulness / n;

    const ranked = Array.from(buckets.entries())
      .map(([key, c]) => ({
        key,
        count: c.count,
        r: c.r / c.count,
        g: c.g / c.count,
        b: c.b / c.count,
      }))
      .sort((a, b) => b.count - a.count);

    const dominantColors = ranked.slice(0, 6).map((c) => ({
      hex: this.toHex(c),
      ratio: c.count / Math.max(1, n),
    }));

    const edgeDensity = this.computeEdgeDensity(px, data.width, data.height);

    const brightnessLabel = meanLum < 80 ? "dark" : meanLum < 175 ? "neutral" : "bright";
    const contrastLabel = stddev < 35 ? "low" : stddev < 75 ? "moderate" : "high";

    return {
      dimensions,
      colorMode,
      dominantColors,
      colorCount: buckets.size,
      luminance: { mean: Math.round(meanLum), stddev: Math.round(stddev), min: 0, max: 255 },
      darkRatio: dark / n,
      midRatio: mid / n,
      lightRatio: light / n,
      brightness: brightnessLabel,
      contrast: contrastLabel,
      edgeDensity,
      colorfulness: Math.round(colorful * 10) / 10,
      alphaCoverage: alphaCoverage !== null ? Math.round(alphaCoverage * 100) / 100 : null,
      prompt: null,
      note: "Produced locally by deterministic per-pixel statistics (no AI model involved).",
    };
  }

  private toHex(c: { r: number; g: number; b: number }): string {
    const clamp = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));
    return `#${[clamp(c.r), clamp(c.g), clamp(c.b)].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
  }

  private computeEdgeDensity(px: Uint8ClampedArray | Uint8Array, width: number, height: number): number {
    if (width < 3 || height < 3) return 0;
    let edges = 0;
    let total = 0;
    const stride = width * 4;
    for (let y = 1; y < height - 1; y++) {
      for (let x = 1; x < width - 1; x++) {
        const i = (y * width + x) * 4;
        const l = 0.2126 * px[i - 4] + 0.7152 * px[i - 3] + 0.0722 * px[i - 2];
        const r = 0.2126 * px[i + 4] + 0.7152 * px[i + 5] + 0.0722 * px[i + 6];
        const u = 0.2126 * px[i - stride] + 0.7152 * px[i - stride + 1] + 0.0722 * px[i - stride + 2];
        const d = 0.2126 * px[i + stride] + 0.7152 * px[i + stride + 1] + 0.0722 * px[i + stride + 2];
        const gx = r - l;
        const gy = d - u;
        const mag = Math.sqrt(gx * gx + gy * gy);
        if (mag > 40) edges++;
        total++;
      }
    }
    return total > 0 ? edges / total : 0;
  }
}