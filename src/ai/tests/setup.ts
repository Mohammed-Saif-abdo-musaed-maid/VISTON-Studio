const mem = new Map<string, string>();

globalThis.localStorage = {
  getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
  setItem: (k: string, v: string) => void mem.set(k, String(v)),
  removeItem: (k: string) => void mem.delete(k),
  clear: () => mem.clear(),
  key: (i: number) => Array.from(mem.keys())[i] ?? null,
  get length() {
    return mem.size;
  },
} as unknown as Storage;

// Node has no browser ImageData global; the processing engine's sync fallback
// constructs `new ImageData(...)`. Provide a minimal spec-compatible polyfill.
if (typeof (globalThis as Record<string, unknown>).ImageData === "undefined") {
  class ImageDataPolyfill {
    width: number;
    height: number;
    data: Uint8ClampedArray;
    constructor(data: Uint8ClampedArray | number, w: number, h?: number) {
      if (typeof data === "number") {
        this.width = data;
        this.height = h ?? data;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.width = w;
        this.height = h ?? Math.floor(data.length / (Math.max(1, w) * 4));
        this.data = new Uint8ClampedArray(data);
      }
    }
  }
  (globalThis as Record<string, unknown>).ImageData = ImageDataPolyfill;
}