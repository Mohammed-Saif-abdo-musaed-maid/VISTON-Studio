import { getContext2d } from "../../utils/canvas";

export interface HistogramData {
  luma: Uint32Array;
  red: Uint32Array;
  green: Uint32Array;
  blue: Uint32Array;
}

export function computeHistogram(canvas: HTMLCanvasElement, sampleLimit = 400_000): HistogramData {
  const luma = new Uint32Array(256);
  const red = new Uint32Array(256);
  const green = new Uint32Array(256);
  const blue = new Uint32Array(256);
  const w = canvas.width;
  const h = canvas.height;
  if (w === 0 || h === 0) return { luma, red, green, blue };
  const ctx = getContext2d(canvas);
  let data: ImageData;
  try {
    data = ctx.getImageData(0, 0, w, h);
  } catch {
    return { luma, red, green, blue };
  }
  const pix = data.data;
  const total = w * h;
  const step = Math.max(1, Math.ceil(total / sampleLimit));
  for (let i = 0; i < total; i += step) {
    const pi = i * 4;
    const r = pix[pi];
    const g = pix[pi + 1];
    const b = pix[pi + 2];
    luma[(0.2126 * r + 0.7152 * g + 0.0722 * b) | 0]++;
    red[r]++;
    green[g]++;
    blue[b]++;
  }
  return { luma, red, green, blue };
}

export function histogramPeak(h: Uint32Array): number {
  let max = 0;
  for (let i = 0; i < 256; i++) {
    const v = h[i] as number;
    if (v > max) max = v;
  }
  return max;
}