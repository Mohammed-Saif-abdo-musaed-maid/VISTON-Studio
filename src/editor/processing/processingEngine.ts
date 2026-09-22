import { createCanvas, getContext2d } from "../../utils/canvas";
import { runProcess, ProcessOp, ProcessParams } from "./processor";

interface PendingTask {
  resolve: (data: ImageData) => void;
  reject: (err: Error) => void;
}

const PREVIEW_MAX_DIM = 512;

export class ProcessingEngine {
  private worker: Worker | null = null;
  private workerError = false;
  private pending = new Map<number, PendingTask>();
  private seq = 0;

  private ensureWorker(): Worker | null {
    if (this.worker || this.workerError) return this.worker;
    try {
      const w = new Worker(new URL("./processWorker.ts", import.meta.url), { type: "module" });
      w.onmessage = (e: MessageEvent) => {
        const msg = e.data as { id: number; data?: ArrayBuffer; error?: string };
        const task = this.pending.get(msg.id);
        if (!task) return;
        this.pending.delete(msg.id);
        if (msg.error) task.reject(new Error(msg.error));
        else if (msg.data) {
          const w2 = (e.data as { width: number }).width;
          const h2 = (e.data as { height: number }).height;
          task.resolve(new ImageData(new Uint8ClampedArray(msg.data as ArrayBuffer) as Uint8ClampedArray<ArrayBuffer>, w2, h2));
        } else {
          task.reject(new Error("Worker returned no data."));
        }
      };
      w.onerror = () => {
        this.workerError = true;
        this.worker = null;
        for (const [, t] of this.pending) t.reject(new Error("Processing worker failed."));
        this.pending.clear();
      };
      this.worker = w;
      return w;
    } catch {
      this.workerError = true;
      return null;
    }
  }

  run(op: ProcessOp, width: number, height: number, data: Uint8ClampedArray, params: ProcessParams): Promise<ImageData> {
    const worker = this.ensureWorker();
    const id = ++this.seq;
    if (worker) {
      return new Promise<ImageData>((resolve, reject) => {
        this.pending.set(id, { resolve, reject });
        worker.postMessage(
          { id, op, width, height, data, params },
          { transfer: [data.buffer] }
        );
      });
    }
    const output = runProcess(op, width, height, data, params);
    return Promise.resolve(new ImageData(output as Uint8ClampedArray<ArrayBuffer>, width, height));
  }

  async processCanvas(
    op: ProcessOp,
    source: HTMLCanvasElement,
    params: ProcessParams,
    mask?: Uint8ClampedArray | null,
    maskWidth?: number,
    maskHeight?: number
  ): Promise<ImageData> {
    const ctx = getContext2d(source);
    const data = ctx.getImageData(0, 0, source.width, source.height);
    const result = await this.run(op, source.width, source.height, data.data, params);
    if (mask && maskWidth && maskHeight) {
      this.applyMask(result.data, mask, source.width, source.height, maskWidth, maskHeight, data.data);
    }
    return result;
  }

  private applyMask(
    result: Uint8ClampedArray,
    mask: Uint8ClampedArray,
    w: number,
    h: number,
    mw: number,
    mh: number,
    original: Uint8ClampedArray
  ): void {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const mx = Math.min(mw - 1, Math.round((x / w) * mw));
        const my = Math.min(mh - 1, Math.round((y / h) * mh));
        const sel = mask[my * mw + mx];
        const pi = (y * w + x) * 4;
        if (sel <= 0) {
          result[pi] = original[pi];
          result[pi + 1] = original[pi + 1];
          result[pi + 2] = original[pi + 2];
          result[pi + 3] = original[pi + 3];
        } else if (sel < 255) {
          // Linear blend supports grayscale / feathered masks.
          const f = sel / 255;
          result[pi] = result[pi] * f + original[pi] * (1 - f);
          result[pi + 1] = result[pi + 1] * f + original[pi + 1] * (1 - f);
          result[pi + 2] = result[pi + 2] * f + original[pi + 2] * (1 - f);
          result[pi + 3] = original[pi + 3];
        }
      }
    }
  }

  /** Tear down the worker and reject any in-flight tasks. */
  dispose(): void {
    const w = this.worker;
    this.worker = null;
    for (const [, t] of this.pending) t.reject(new Error("Processing engine disposed."));
    this.pending.clear();
    if (w) w.terminate();
  }

  async makePreviewCanvas(
    source: HTMLCanvasElement,
    maxDim = PREVIEW_MAX_DIM
  ): Promise<HTMLCanvasElement> {
    const scale = Math.min(1, maxDim / Math.max(source.width, source.height));
    if (scale >= 1) return source;
    const c = createCanvas(Math.max(1, Math.round(source.width * scale)), Math.max(1, Math.round(source.height * scale)));
    const ctx = getContext2d(c);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(source, 0, 0, c.width, c.height);
    return c;
  }

  get sharedPreviewMaxDim(): number {
    return PREVIEW_MAX_DIM;
  }
}

export const processingEngine = new ProcessingEngine();