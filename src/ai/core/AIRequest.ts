import { AIError } from "./AIError";
import type { AIRequest, AIImageData, AISelection, AIParams, AIOperation } from "../types";
import { genId } from "../../utils/id";

export interface BuildRequestOptions {
  operation: AIOperation;
  provider?: string;
  model?: string | null;
  image?: AIImageData | null;
  selection?: AISelection | null;
  params?: AIParams;
}

/** Build and validate an AIRequest. Throws AIError for missing required inputs. */
export function buildAIRequest(opts: BuildRequestOptions): AIRequest {
  const now = Date.now();
  const provider = opts.provider ?? "local";
  if (!provider || provider.trim().length === 0) {
    throw new AIError("provider-unavailable", "No AI provider selected.", opts.operation);
  }
  const request: AIRequest = {
    id: `ai-${genId()}-${now.toString(36)}`,
    operation: opts.operation,
    provider,
    model: opts.model ?? null,
    image: opts.image ?? null,
    selection: opts.selection ?? null,
    params: opts.params ?? {},
    createdAt: now,
    cacheKey: null,
  };

  const needsImage: AIOperation[] = [
    "analyzeImage", "describe", "detectObjects", "detectFaces", "detectText",
    "classifyScene", "analyzeComposition", "selectSubject", "selectObject",
    "segment", "removeBackground", "removeObject", "inpaint", "generativeFill",
    "generativeExpand", "objectReplace", "upscale", "denoise", "sharpen",
    "colorize", "restore", "relight", "enhance",
    "segmentProduct", "analyzeBackground", "detectSurface", "estimateLighting",
    "matchLighting", "generateShadow", "matchPerspective",
  ];
  if (needsImage.includes(opts.operation) && !opts.image) {
    throw new AIError("invalid-image", "This AI operation requires an image.", opts.operation);
  }

  const needsPrompt: AIOperation[] = ["generativeFill", "generativeExpand", "objectReplace", "generateImage", "generateVariation", "textAssist"];
  if (needsPrompt.includes(opts.operation) && !opts.params?.prompt) {
    throw new AIError("invalid-prompt", "This AI operation requires a prompt.", opts.operation);
  }

  if (opts.operation === "generateImage") {
    const w = opts.params?.width;
    const h = opts.params?.height;
    if (typeof w !== "number" || !(w > 0) || typeof h !== "number" || !(h > 0)) {
      throw new AIError("invalid-request", "Generated image dimensions are required.", opts.operation);
    }
  }

  return request;
}

/** Stable cache key. Includes provider, model, op, source hash, selection hash, prompt and params. */
export function aiCacheKey(
  request: AIRequest
): string {
  const parts: string[] = [
    "vs-ai",
    request.operation,
    request.provider,
    request.model ?? "default",
  ];

  if (request.image) {
    parts.push(sourceHash(request.image));
  }

  if (request.selection) {
    parts.push(selectionHash(request.selection));
  }

  parts.push(stringifyParams(request.params));
  return parts.join("|");
}

export function sourceHash(image: AIImageData): string {
  const canvas = image.canvas;
  const size = canvas.width * canvas.height;
  let hash = 2166136261;
  // Deterministic downsampled hash — fast and stable for identical pixel data.
  const step = Math.max(1, Math.floor(Math.sqrt(size / 4096)));
  const ctx = canvas.getContext("2d");
  if (!ctx) return `${canvas.width}x${canvas.height}`;
  let data: Uint8ClampedArray | null = null;
  try {
    data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  } catch {
    return `${canvas.width}x${canvas.height}`;
  }
  for (let y = 0; y < canvas.height; y += step) {
    for (let x = 0; x < canvas.width; x += step) {
      const i = (y * canvas.width + x) * 4;
      hash ^= data[i];
      hash = Math.imul(hash, 16777619);
      hash ^= data[i + 1];
      hash = Math.imul(hash, 16777619);
      hash ^= data[i + 2];
      hash = Math.imul(hash, 16777619);
    }
  }
  return `h${(hash >>> 0).toString(16)}-${canvas.width}x${canvas.height}`;
}

export function selectionHash(selection: AISelection): string {
  const b = selection.bounds;
  const body = b ? `${b.x},${b.y},${b.width},${b.height}` : "none";
  if (!selection.mask) return `${selection.kind}|${body}`;
  const mask = selection.mask;
  let h = 5381;
  const step = Math.max(1, Math.floor((mask.width * mask.height) / 65536));
  for (let i = 0; i < mask.data.length; i += step) {
    h = ((h << 5) + h + mask.data[i]) >>> 0;
  }
  return `${selection.kind}|${body}|m${h.toString(16)}`;
}

function stringifyParams(params: AIParams): string {
  try {
    return JSON.stringify(params);
  } catch {
    return String(params);
  }
}

export { genId };