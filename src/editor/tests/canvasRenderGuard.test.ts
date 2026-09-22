import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { EditorDocument } from "../core/document";
import { runtime } from "../core/runtime";
import { useEditorStore } from "../../state/store";
import type { EditorEngine } from "../core/engine";

/**
 * Regression coverage for the "black canvas" failure mode: if the browser
 * cannot allocate the composite drawing surface (oversized canvas, or a
 * transient GPU/context failure), `render()` must not throw out of the rAF
 * callback and permanently wedge the viewport black with no message. It must
 * surface an honest error and keep the render loop alive.
 */

class FakeCtx {
  fillStyle = "";
  strokeStyle = "";
  lineWidth = 1;
  globalAlpha = 1;
  globalCompositeOperation = "source-over";
  filter = "none";
  font = "";
  textAlign = "";
  textBaseline = "";
  imageSmoothingEnabled = false;
  imageSmoothingQuality = "low";
  fillRectCalls = 0;
  setTransform(): void {}
  clearRect(): void {}
  fillRect(): void { this.fillRectCalls++; }
  drawImage(): void {}
  save(): void {}
  restore(): void {}
  beginPath(): void {}
  rect(): void {}
  clip(): void {}
  scale(): void {}
  translate(): void {}
  rotate(): void {}
  stroke(): void {}
  setLineDash(): void {}
  arc(): void {}
  moveTo(): void {}
  lineTo(): void {}
  closePath(): void {}
  ellipse(): void {}
  strokeRect(): void {}
  fill(): void {}
  fillText(): void {}
  getImageData(): ImageData { return { width: 1, height: 1, data: new Uint8ClampedArray(4) } as ImageData; }
  putImageData(): void {}
  createImageData(w: number, h: number): ImageData {
    return { width: w, height: h, data: new Uint8ClampedArray(w * h * 4) } as ImageData;
  }
}

let created = 0;
let mainCtx: FakeCtx | null = null;

function makeCanvas(): unknown {
  created += 1;
  const index = created;
  const ctx = new FakeCtx();
  if (index === 1) mainCtx = ctx;
  return {
    width: 0,
    height: 0,
    className: "",
    style: {},
    getContext: vi.fn(() => (index === 2 ? null : ctx)),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    remove: vi.fn(),
    appendChild: vi.fn(),
    getBoundingClientRect: () => ({ width: 800, height: 600, left: 0, top: 0 }),
    toDataURL: () => "data:,",
  };
}

let rafQueue: FrameRequestCallback[] = [];

function flushRaf(): void {
  const q = rafQueue;
  rafQueue = [];
  for (const cb of q) cb(0);
}

describe("canvas render guard", () => {
  beforeEach(() => {
    created = 0;
    mainCtx = null;
    rafQueue = [];
    const g = globalThis as unknown as Record<string, unknown>;
    g.document = { createElement: () => makeCanvas() };
    g.window = {
      devicePixelRatio: 1,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };
    g.requestAnimationFrame = (cb: FrameRequestCallback) => { rafQueue.push(cb); return rafQueue.length; };
    g.cancelAnimationFrame = () => undefined;
    g.ResizeObserver = class { observe(): void {} disconnect(): void {} };
    useEditorStore.setState({ doc: null, lastError: null, status: "Ready", selectedIds: [] });
  });

  afterEach(() => {
    runtime.canvas?.destroy();
    runtime.canvas = null;
    const g = globalThis as unknown as Record<string, unknown>;
    delete g.document;
    delete g.window;
    delete g.requestAnimationFrame;
    delete g.cancelAnimationFrame;
    delete g.ResizeObserver;
  });

  it("surfaces an honest error instead of throwing when the composite surface cannot be allocated", async () => {
    const { createCanvasEngine } = await import("../canvas/canvasEngine");
    const parent = { appendChild: vi.fn(), getBoundingClientRect: () => ({ width: 800, height: 600 }) };
    const engine = createCanvasEngine(parent as unknown as HTMLElement);
    runtime.engine = { version: 1 } as unknown as EditorEngine;
    useEditorStore.setState({ doc: new EditorDocument(400, 300, []) });

    expect(() => { engine.requestRender(); flushRaf(); }).not.toThrow();
    expect(useEditorStore.getState().lastError).toContain("Unable to render");
    expect(mainCtx?.fillRectCalls ?? 0).toBeGreaterThan(0);

    expect(() => { engine.requestRender(); flushRaf(); }).not.toThrow();
  });
});
