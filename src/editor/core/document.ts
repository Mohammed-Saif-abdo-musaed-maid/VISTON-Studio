import type { Layer } from "./types";

export class EditorDocument {
  width: number;
  height: number;
  layers: Layer[];

  constructor(width: number, height: number, layers: Layer[] = []) {
    this.width = width;
    this.height = height;
    this.layers = layers;
  }

  clone(): EditorDocument {
    return new EditorDocument(
      this.width,
      this.height,
      this.layers.map((l) => ({
        ...l,
        transform: { ...l.transform },
      }))
    );
  }

  getLayer(id: string): Layer | undefined {
    return this.layers.find((l) => l.id === id);
  }

  layerIndex(id: string): number {
    return this.layers.findIndex((l) => l.id === id);
  }
}

export class PixelStore {
  private canvases = new Map<string, HTMLCanvasElement>();

  set(id: string, canvas: HTMLCanvasElement): void {
    this.canvases.set(id, canvas);
  }

  get(id: string): HTMLCanvasElement | undefined {
    return this.canvases.get(id);
  }

  delete(id: string): void {
    this.canvases.delete(id);
  }

  has(id: string): boolean {
    return this.canvases.has(id);
  }

  clear(): void {
    this.canvases.clear();
  }
}

export const pixelStore = new PixelStore();

export const maskStore = new PixelStore();