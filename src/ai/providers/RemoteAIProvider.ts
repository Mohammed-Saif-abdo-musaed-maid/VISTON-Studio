import { imageDataUrlToCanvas } from "../image/dataUrl";
import { AIError, AIErrorCode } from "../core/AIError";
import type { AIProvider } from "../core/AIProvider";
import type { AIRequest, AIResult, AICapability, AISelection, AIMask } from "../types";
import { AI_OPERATIONS } from "../types";

export interface RemoteAIProviderConfig {
  endpoint: string;
  models: string[];
  defaultModel: string;
  apiKey: string | null;
  timeoutMs: number;
}

interface WireRequest {
  id: string;
  operation: string;
  provider: string;
  model: string | null;
  selectionKind: string | null;
  params: Record<string, unknown>;
  image: string | null;
}

/**
 * Remote provider — talks to a user-configured inference endpoint that speaks
 * the Vision Studio "VS AI" JSON protocol:
 *
 *   POST {endpoint}
 *   { "request": { id, operation, provider, model, params, image: dataURL|null } }
 *
 *   200 -> { "ok": true,  "result": { text?, canvasDataUrl?, structured?, metadata? } }
 *   200 -> { "ok": false, "error": { "code": "...", "message": "..." } }
 *
 * It never fakes output: whatever it returns was produced by a real server,
 * and every failure is surfaced as an AIError. When no endpoint is configured
 * the provider is unavailable.
 */
export class RemoteAIProvider implements AIProvider {
  id = "remote";
  name = "Remote AI";
  kind = "remote" as const;
  capabilities: AICapability[] = [...AI_OPERATIONS];
  modelIds: string[];
  defaultModel: string;

  constructor(private config: () => RemoteAIProviderConfig) {
    this.modelIds = config().models;
    this.defaultModel = config().defaultModel;
  }

  isAvailable(): boolean {
    return (this.config().endpoint ?? "").trim().length > 0;
  }

  availabilityReason(): string {
    const cfg = this.config();
    if (!(cfg.endpoint ?? "").trim()) {
      return "AI provider unavailable — no remote endpoint configured (Preferences → AI).";
    }
    return "Remote AI endpoint is configured.";
  }

  async execute(request: AIRequest, signal: AbortSignal, onProgress?: (p: number) => void): Promise<AIResult> {
    const cfg = this.config();
    if (!this.isAvailable()) {
      throw new AIError("not-configured", this.availabilityReason(), request.operation);
    }

    const wire: WireRequest = {
      id: request.id,
      operation: request.operation,
      provider: this.id,
      model: request.model ?? this.defaultModel,
      selectionKind: request.selection?.kind ?? null,
      params: request.params as unknown as Record<string, unknown>,
      image: null,
    };

    if (request.image) {
      try {
        wire.image = request.image.canvas.toDataURL("image/png");
      } catch {
        throw new AIError("invalid-image", "Could not serialize the image for the AI provider.", request.operation);
      }
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), cfg.timeoutMs);
    const onAbort = () => controller.abort();
    signal.addEventListener("abort", onAbort);

    let res: Response;
    try {
      res = await fetch(cfg.endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}) },
        body: JSON.stringify({ request: wire }),
        signal: controller.signal,
      });
    } catch (err) {
      const name = (err as Error)?.name;
      if (signal.aborted || controller.signal.aborted) {
        if (signal.aborted) throw new AIError("cancelled", undefined, request.operation);
        throw new AIError("timeout", "The AI provider request timed out.", request.operation);
      }
      if (name === "AbortError") {
        throw new AIError("timeout", "The AI provider request timed out.", request.operation);
      }
      throw new AIError("network", "Network error while contacting the AI provider.", request.operation);
    } finally {
      clearTimeout(timer);
      signal.removeEventListener("abort", onAbort);
    }

    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new AIError("server", "The AI provider returned an unreadable response.", request.operation);
    }

    if (!res.ok) {
      throw new AIError("server", `The AI provider returned HTTP ${res.status}.`, request.operation);
    }

    const obj = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
    if (obj.ok !== true) {
      const err = (obj.error && typeof obj.error === "object" ? obj.error : {}) as Record<string, unknown>;
      const code = String(err.code ?? "server") as AIErrorCode;
      throw new AIError(code, String(err.message ?? "The AI provider rejected the request."), request.operation);
    }

    const rawResult = (obj.result && typeof obj.result === "object" ? obj.result : {}) as Record<string, unknown>;
    const canvasDataUrl = typeof rawResult.canvasDataUrl === "string" ? rawResult.canvasDataUrl : null;
    let canvas: HTMLCanvasElement | null = null;
    if (canvasDataUrl) {
      try {
        canvas = await imageDataUrlToCanvas(canvasDataUrl);
      } catch {
        throw new AIError("server", "The AI provider returned an unreadable image.", request.operation);
      }
    }

    let selection: AISelection | null = null;
    if (rawResult.selection && typeof rawResult.selection === "object") {
      const rawSel = rawResult.selection as Record<string, unknown>;
      try {
        selection = await parseSelectionWire(rawSel);
      } catch {
        selection = null;
      }
    }

    onProgress?.(100);

    return {
      request,
      canvas,
      text: typeof rawResult.text === "string" ? rawResult.text : null,
      structured: rawResult.structured && typeof rawResult.structured === "object"
        ? (rawResult.structured as Record<string, unknown>)
        : null,
      selection,
      metadata: rawResult.metadata && typeof rawResult.metadata === "object"
        ? (rawResult.metadata as Record<string, unknown>)
        : {},
      origin: "provider",
      createdAt: Date.now(),
      provider: this.id,
      model: request.model ?? this.defaultModel,
    };
  }
}

/**
 * Parse a provider `selection` payload:
 *   { "kind": "raster-mask"|..., "bounds": {x,y,width,height}, "maskDataUrl": "data:image/png;base64,..." }
 * The mask is decoded from the PNG via its alpha channel (255 = keep, 0 = cut).
 * Returns null when no usable selection is present. Malformed payloads throw
 * so the caller can degrade gracefully, never crash.
 */
async function parseSelectionWire(raw: Record<string, unknown>): Promise<AISelection | null> {
  const kind = raw.kind === "rectangle" || raw.kind === "ellipse" || raw.kind === "lasso" || raw.kind === "raster-mask"
    ? raw.kind
    : "raster-mask";
  let bounds: { x: number; y: number; width: number; height: number } | null = null;
  if (raw.bounds && typeof raw.bounds === "object") {
    const b = raw.bounds as Record<string, unknown>;
    const x = Number(b.x); const y = Number(b.y);
    const w = Number(b.width); const h = Number(b.height);
    if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(w) && Number.isFinite(h) && w > 0 && h > 0) {
      bounds = { x, y, width: w, height: h };
    }
  }

  let mask: AIMask | null = null;
  const maskDataUrl = typeof raw.maskDataUrl === "string" ? raw.maskDataUrl : null;
  if (maskDataUrl) {
    const maskCanvas = await imageDataUrlToCanvas(maskDataUrl);
    const ctx = maskCanvas.getContext("2d");
    if (ctx && maskCanvas.width > 0 && maskCanvas.height > 0) {
      const img = ctx.getImageData(0, 0, maskCanvas.width, maskCanvas.height);
      const data = new Uint8Array(img.width * img.height);
      for (let i = 0; i < data.length; i++) {
        const value = img.data[i * 4 + 3];
        data[i] = value > 0 ? (value === 255 ? 255 : Math.round((value / 255) * 255)) : 0;
      }
      mask = { width: img.width, height: img.height, data, weight: 1 };
    }
  }

  return { kind, bounds, mask };
}