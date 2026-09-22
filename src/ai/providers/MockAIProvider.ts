import { AIError } from "../core/AIError";
import type { AIProvider } from "../core/AIProvider";
import { sourceHash } from "../core/AIRequest";
import type { AIRequest, AIResult, AICapability, AIOperation, AISelection } from "../types";

const MOCK_TEXT_OPERATIONS: AIOperation[] = [
  "describe",
  "detectObjects",
  "detectFaces",
  "detectText",
  "classifyScene",
  "analyzeComposition",
  "analyzeBackground",
  "detectSurface",
  "estimateLighting",
  "matchLighting",
  "generateShadow",
  "matchPerspective",
];

const MOCK_IMAGE_OPERATIONS: AIOperation[] = [
  "selectSubject",
  "selectObject",
  "segment",
  "segmentProduct",
  "removeBackground",
  "removeObject",
  "inpaint",
  "generativeFill",
  "generativeExpand",
  "objectReplace",
  "generateImage",
  "generateVariation",
  "upscale",
  "denoise",
  "sharpen",
  "colorize",
  "restore",
  "relight",
  "enhance",
];

/**
 * Mock provider — for DEVELOPMENT/TESTS ONLY.
 *
 * It produces deterministic placeholder results that are ALWAYS labeled with
 * origin "mock" so they can never be mistaken for real AI output. The mock is
 * only registered by AIService when dev mode AND explicit mock settings are
 * both true. Real production execution never routes here.
 */
export class MockAIProvider implements AIProvider {
  id = "mock";
  name = "Mock (dev/test only)";
  kind = "mock" as const;
  capabilities: AICapability[] = [...MOCK_TEXT_OPERATIONS, ...MOCK_IMAGE_OPERATIONS];
  modelIds = ["mock-model"];
  defaultModel = "mock-model";

  constructor(private enabled: () => boolean) {}

  isAvailable(): boolean {
    return this.enabled();
  }

  availabilityReason(): string {
    return "Mock AI provider is disabled outside dev/test mode.";
  }

  async execute(request: AIRequest, signal: AbortSignal, onProgress?: (p: number) => void): Promise<AIResult> {
    if (!this.isAvailable()) {
      throw new AIError("provider-unavailable", this.availabilityReason(), request.operation);
    }
    const steps = 5;
    for (let i = 1; i <= steps; i++) {
      if (signal.aborted) throw new AIError("cancelled", undefined, request.operation);
      onProgress?.((i / steps) * 100);
      await new Promise((r) => setTimeout(r, 120));
    }

    const structured: Record<string, unknown> = {
      source: "mock",
      deterministic: true,
      note: "Placeholder result from the dev/test mock provider. This is NOT real AI output.",
    };

    if (MOCK_TEXT_OPERATIONS.includes(request.operation)) {
      structured.detail = mockTextResult(request);
      return {
        request,
        canvas: null,
        text: mockTextResult(request),
        structured,
        selection: null,
        metadata: { mock: true },
        origin: "mock",
        createdAt: Date.now(),
        provider: this.id,
        model: request.model ?? this.defaultModel,
      };
    }

    if (MOCK_IMAGE_OPERATIONS.includes(request.operation)) {
      const src = request.image?.canvas;
      const canvas = document.createElement("canvas");
      if (src && src.width > 0 && src.height > 0 && request.operation !== "generateImage") {
        canvas.width = src.width;
        canvas.height = src.height;
        const ctx = canvas.getContext("2d");
        if (ctx) ctx.drawImage(src, 0, 0);
      } else {
        canvas.width = request.params.width && request.params.width > 0 ? request.params.width : 512;
        canvas.height = request.params.height && request.params.height > 0 ? request.params.height : 512;
      }
      return {
        request,
        canvas,
        text: `MOCK ${request.operation}`,
        structured: { ...structured, ...mockProductStructured(request) },
        selection: mockSelectionFor(request, canvas),
        metadata: { sourceHash: request.image ? sourceHash(request.image) : null, mock: true },
        origin: "mock",
        createdAt: Date.now(),
        provider: this.id,
        model: request.model ?? this.defaultModel,
      };
    }

    throw new AIError("capability-unavailable", undefined, request.operation);
  }
}

/**
 * Deterministic placeholder structured values for the product-compositing
 * operations. Every value is labeled as a mock in `structured.source`; used
 * only so the dev/test flow can exercise the product panel end-to-end.
 */
function mockProductStructured(request: AIRequest): Record<string, unknown> {
  switch (request.operation) {
    case "analyzeBackground":
      return {
        background: {
          meanLuminance: 128,
          meanTemperature: 0,
          contrast: 0.5,
          saturation: 0.4,
          lightDirectionDeg: 45,
          floorYRatio: 0.72,
          surface: "neutral test surface (mock)",
          surfaceType: "ground",
          suggestedShadow: { distance: 60, angleDeg: 45, opacity: 0.5, blur: 12, spread: 0 },
        },
      };
    case "detectSurface":
      return {
        surface: { type: "ground", supportsProduct: true, floorYRatio: 0.72, angleDeg: 0 },
      };
    case "estimateLighting":
    case "matchLighting":
      return {
        lighting: {
          brightness: 10,
          contrast: 5,
          saturation: 5,
          temperature: -4,
          tint: 0,
          exposure: 0.05,
          highlights: 0,
          shadows: 0,
        },
        explanation: "[MOCK] placeholder lighting estimate — NOT real AI output.",
      };
    case "generateShadow":
      return {
        shadow: { distance: 60, angleDeg: 45, opacity: 0.5, blur: 12, spread: 0 },
      };
    case "matchPerspective":
      return {
        perspective: { skewX: 0, skewY: -12 },
        explanation: "[MOCK] placeholder perspective estimate — NOT real AI output.",
      };
    default:
      return {};
  }
}

/** Mock segmentProduct returns a deterministic center-ellipse raster mask so the
 *  full mask pipeline can be exercised in dev/test. Always tagged mock. */
function mockSelectionFor(request: AIRequest, canvas: HTMLCanvasElement): AISelection | null {
  if (request.operation !== "segmentProduct") return null;
  const w = canvas.width;
  const h = canvas.height;
  if (w < 2 || h < 2) return null;
  const data = new Uint8Array(w * h);
  const cx = w / 2;
  const cy = h / 2;
  const rx = w * 0.28;
  const ry = h * 0.36;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      data[y * w + x] = dx * dx + dy * dy <= 1 ? 255 : 0;
    }
  }
  return {
    kind: "raster-mask",
    bounds: { x: 0, y: 0, width: w, height: h },
    mask: { width: w, height: h, data, weight: 1 },
  };
}

function mockTextResult(request: AIRequest): string {
  return `[MOCK] ${request.operation} — no real AI backend connected.`;
}