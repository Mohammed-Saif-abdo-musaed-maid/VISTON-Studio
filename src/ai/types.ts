export type AIOperation =
  | "analyzeImage"
  | "describe"
  | "detectObjects"
  | "detectFaces"
  | "detectText"
  | "classifyScene"
  | "analyzeComposition"
  | "selectSubject"
  | "selectObject"
  | "segment"
  | "removeBackground"
  | "removeObject"
  | "inpaint"
  | "generativeFill"
  | "generativeExpand"
  | "objectReplace"
  | "generateImage"
  | "generateVariation"
  | "upscale"
  | "denoise"
  | "sharpen"
  | "colorize"
  | "restore"
  | "relight"
  | "enhance"
  | "textAssist"
  | "segmentProduct"
  | "analyzeBackground"
  | "detectSurface"
  | "estimateLighting"
  | "matchLighting"
  | "generateShadow"
  | "matchPerspective";

export type AICapability = AIOperation;

export const AI_OPERATIONS: readonly AIOperation[] = [
  "analyzeImage",
  "describe",
  "detectObjects",
  "detectFaces",
  "detectText",
  "classifyScene",
  "analyzeComposition",
  "selectSubject",
  "selectObject",
  "segment",
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
  "textAssist",
  "segmentProduct",
  "analyzeBackground",
  "detectSurface",
  "estimateLighting",
  "matchLighting",
  "generateShadow",
  "matchPerspective",
];

export interface AIBaseParams {
  prompt?: string | null;
  negativePrompt?: string | null;
  seed?: number | null;
}

export interface AIGenerateParams extends AIBaseParams {
  width: number;
  height: number;
  variations: number;
}

export interface AIUpscaleParams {
  scale: 2 | 4 | 8;
}

export interface AIDenoiseParams {
  strength: number;
  detail: number;
  colorNoise: number;
  luminanceNoise: number;
}

export interface AISharpenParams {
  amount: number;
  radius: number;
  detail: number;
  denoise: number;
}

export interface AIRelightParams {
  direction: number;
  intensity: number;
  temperature: number;
  softness: number;
  ambient: number;
  shadowStrength: number;
}

export interface AIRestoreParams {
  scratches: boolean;
  denoise: boolean;
  deblur: boolean;
  faces: boolean;
  reconstruct: boolean;
  contrast: boolean;
}

export type AITextAssistMode = "rewrite" | "shorten" | "expand" | "grammar" | "translate" | "tone" | "generate";

export interface AITextAssistParams {
  mode: AITextAssistMode;
  targetLanguage?: string;
  tone?: string;
}

export type AIParams = AIBaseParams &
  Partial<AIGenerateParams> &
  Partial<AIUpscaleParams> &
  Partial<AIDenoiseParams> &
  Partial<AISharpenParams> &
  Partial<AIRelightParams> &
  Partial<AIRestoreParams> &
  Partial<AITextAssistParams>;

export interface AIImageData {
  canvas: HTMLCanvasElement;
  layerId?: string | null;
  name?: string;
  width: number;
  height: number;
}

export interface AISelection {
  kind: "rectangle" | "ellipse" | "lasso" | "raster-mask";
  bounds: { x: number; y: number; width: number; height: number } | null;
  mask: AIMask | null;
}

export interface AIMask {
  width: number;
  height: number;
  data: Uint8Array;
  /** 0..1 — how much the mask value should be trusted (edge uncertainty). */
  weight: number;
}

export interface AIRequest {
  id: string;
  operation: AIOperation;
  provider: string;
  model: string | null;
  image: AIImageData | null;
  selection: AISelection | null;
  params: AIParams;
  createdAt: number;
  cacheKey: string | null;
}

export interface AIResult {
  request: AIRequest;
  canvas: HTMLCanvasElement | null;
  text: string | null;
  structured: Record<string, unknown> | null;
  selection: AISelection | null;
  metadata: Record<string, unknown>;
  origin: "provider" | "mock" | "local";
  createdAt: number;
  provider: string;
  model: string | null;
}

export type AIJobStatus = "queued" | "running" | "completed" | "failed" | "cancelled";

export interface AIJob {
  id: string;
  operation: AIOperation;
  provider: string;
  model: string | null;
  status: AIJobStatus;
  progress: number;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  error: string | null;
  label: string;
  result: AIResult | null;
  cancelled: boolean;
}

export interface AISettings {
  provider: string;
  defaultModel: string;
  remoteEndpoint: string;
  cacheEnabled: boolean;
  mockEnabled: boolean;
  maxJobs: number;
}

export interface AILayerMetadata {
  operation: AIOperation;
  provider: string;
  model: string | null;
  prompt: string | null;
  sourceLayerId: string | null;
  sourceSelection: AISelection | null;
  parameters: AIParams;
  createdAt: number;
  generatedFrom: string | null;
  origin: "provider" | "mock" | "local";
}

export function isAIResultCanvas(r: AIResult): boolean {
  return r.canvas !== null && r.canvas.width > 0 && r.canvas.height > 0;
}

/** Structured payload for the product-compositing AI operations. Every field
 *  is optional so arbitrary (or partial) provider output is tolerated. */
export interface AIProductStructured {
  /** estimateLighting / matchLighting: suggested adjustment values. */
  lighting?: {
    brightness?: number;
    contrast?: number;
    saturation?: number;
    temperature?: number;
    tint?: number;
    exposure?: number;
    highlights?: number;
    shadows?: number;
  } | null;
  /** analyzeBackground: overall scene analysis used for placement + shadows. */
  background?: {
    meanLuminance?: number;
    meanTemperature?: number;
    contrast?: number;
    saturation?: number;
    lightDirectionDeg?: number;
    floorYRatio?: number;
    surface?: string | null;
    surfaceType?: string | null;
    vanishingPoint?: { x: number; y: number } | null;
    suggestedShadow?: {
      distance?: number;
      angleDeg?: number;
      opacity?: number;
      blur?: number;
      spread?: number;
    } | null;
  } | null;
  /** detectSurface: surface/floor information for placement. */
  surface?: {
    type?: string | null;
    supportsProduct?: boolean;
    floorYRatio?: number;
    angleDeg?: number;
  } | null;
  /** generateShadow: shadow geometry relative to the product bounds. */
  shadow?: {
    distance?: number;
    angleDeg?: number;
    opacity?: number;
    blur?: number;
    spread?: number;
  } | null;
  /** matchPerspective: keystone / perspective suggestion. */
  perspective?: {
    skewX?: number;
    skewY?: number;
    corners?: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }] | null;
    vanishingPoint?: { x: number; y: number } | null;
  } | null;
  /** matchLighting / analyzeBackground: text explanation from the model. */
  explanation?: string | null;
}