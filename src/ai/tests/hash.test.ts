import { describe, it, expect } from "vitest";
import { sourceHash, selectionHash } from "../core/AIRequest";
import { AIError } from "../core/AIError";
import { buildAIRequest } from "../core/AIRequest";
import type { AISelection } from "../types";

function makeCanvas(w: number, h: number, fill: number): HTMLCanvasElement {
  // Minimal canvas-like object sufficient for sourceHash's getImageData path.
  return {
    width: w,
    height: h,
    getContext: () => {
      const data = new Uint8ClampedArray(w * h * 4).fill(fill);
      return {
        getImageData: () => ({ data, width: w, height: h }),
      };
    },
  } as unknown as HTMLCanvasElement;
}

describe("sourceHash", () => {
  it("is deterministic for identical pixels", () => {
    const a = sourceHash({ canvas: makeCanvas(8, 8, 42), layerId: null, name: "a", width: 8, height: 8 });
    const b = sourceHash({ canvas: makeCanvas(8, 8, 42), layerId: null, name: "a", width: 8, height: 8 });
    expect(a).toBe(b);
  });

  it("changes when pixels change", () => {
    const a = sourceHash({ canvas: makeCanvas(8, 8, 10), layerId: null, name: "a", width: 8, height: 8 });
    const b = sourceHash({ canvas: makeCanvas(8, 8, 200), layerId: null, name: "a", width: 8, height: 8 });
    expect(a).not.toBe(b);
  });
});

describe("selectionHash", () => {
  it("distinguishes bounds", () => {
    const sel = (x: number): AISelection => ({
      kind: "rectangle",
      bounds: { x, y: 0, width: 10, height: 10 },
      mask: null,
    });
    expect(selectionHash(sel(0))).not.toBe(selectionHash(sel(5)));
  });
});

describe("buildAIRequest", () => {
  it("rejects missing image for image-required ops", () => {
    expect(() =>
      buildAIRequest({ operation: "removeBackground", image: null })
    ).toThrowError(AIError);
  });

  it("rejects missing prompt for prompt-required ops", () => {
    expect(() =>
      buildAIRequest({
        operation: "generateImage",
        image: { canvas: makeCanvas(4, 4, 0), layerId: null, name: "a", width: 4, height: 4 },
        params: {},
      })
    ).toThrowError(AIError);
  });

  it("requires positive dimensions for generateImage", () => {
    expect(() =>
      buildAIRequest({
        operation: "generateImage",
        params: { prompt: "cat" },
      })
    ).toThrowError(AIError);
  });

  it("defaults provider to local when omitted", () => {
    const r = buildAIRequest({ operation: "upscale", image: { canvas: makeCanvas(4, 4, 0), layerId: null, name: "a", width: 4, height: 4 } });
    expect(r.provider).toBe("local");
  });
});