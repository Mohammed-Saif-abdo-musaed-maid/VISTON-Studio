import type { AIParams, AIOperation } from "../types";

export interface PromptTemplate {
  key: (operation: AIOperation) => string;
  defaultPrompt: string;
}

const OPERATION_PROMPTS: Record<AIOperation, string> = {
  analyzeImage: "Analyze this image in detail.",
  describe: "Describe this image in a few clear sentences.",
  detectObjects: "Detect and list the main objects with bounding boxes.",
  detectFaces: "Detect faces, estimating count and approximate age.",
  detectText: "Detect text regions in the image.",
  classifyScene: "Classify the scene: what type of environment/subject is shown?",
  analyzeComposition: "Analyze the composition: rule of thirds, balance, focal points.",
  selectSubject: "Select the main subject with a precise raster mask.",
  selectObject: "Select the named object with a precise raster mask.",
  segment: "Produce a segmentation mask distinguishing all foreground objects.",
  removeBackground: "Remove the background, keeping the subject intact.",
  removeObject: "Remove the specified object and plausibly fill the gap.",
  inpaint: "Fill the masked region with content that matches the surroundings.",
  generativeFill: "Fill the selection with new content described by the prompt.",
  generativeExpand: "Expand the canvas around the existing image to match the prompt.",
  objectReplace: "Replace the selected object with something matching the prompt.",
  generateImage: "Generate a new image: {{prompt}}",
  generateVariation: "Create a variation of this image.",
  upscale: "Upscale the image, preserving details.",
  denoise: "Remove noise while keeping details sharp.",
  sharpen: "Sharpen fine details without artifacts.",
  colorize: "Colorize the image naturally and plausibly.",
  restore: "Restore the image: fix damage, scratches, and defects.",
  relight: "Relight the scene according to the prompt.",
  enhance: "Enhance the image while keeping it natural.",
  textAssist: "Assist with text.",
  segmentProduct: "Cut out the product from its background; return a precise raster mask of the product.",
  analyzeBackground: "Analyze the background scene: lighting direction, brightness, color temperature, saturation, contrast, and the dominant surface where a product would rest.",
  detectSurface: "Detect the dominant horizontal surface in the background and estimate where it sits (floor line / horizon ratio).",
  estimateLighting: "Estimate the background lighting conditions: brightness, temperature, contrast, saturation, and light direction.",
  matchLighting: "Compare the product to the background and suggest lighting adjustments (brightness, contrast, temperature, tint, exposure, highlights, shadows, saturation) so the product matches the scene.",
  generateShadow: "Suggest a contact shadow geometry (distance, angle, opacity, blur, spread) for a product resting on the detected surface.",
  matchPerspective: "Analyze both images and suggest a perspective (keystone) angle so the product matches the surface geometry.",
};

export function buildOperationPrompt(operation: AIOperation, params: AIParams): string {
  const base = OPERATION_PROMPTS[operation] ?? "Process this image.";
  const prompt = params.prompt?.trim();
  if (prompt) {
    if (operation === "generateImage" && base.includes("{{prompt}}")) {
      return `Generate a new image: ${prompt}`;
    }
    return prompt;
  }
  return base.replace("{{prompt}}", params.prompt ?? "");
}

export function buildTextAssistPrompt(mode: string, text: string, tone?: string, targetLanguage?: string): string {
  const toneClause = tone ? ` in a ${tone} tone` : "";
  const langClause = targetLanguage ? ` into ${targetLanguage}` : "";
  switch (mode) {
    case "shorten":
      return `Shorten the following text${toneClause}: ${text}`;
    case "expand":
      return `Expand the following text${toneClause}: ${text}`;
    case "grammar":
      return `Fix the grammar of the following text: ${text}`;
    case "translate":
      return `Translate the following text${langClause}: ${text}`;
    case "tone":
      return `Rewrite the following text${toneClause}: ${text}`;
    case "generate":
      return `Generate text${langClause}${toneClause}: ${text}`;
    case "rewrite":
    default:
      return `Rewrite the following text${toneClause}: ${text}`;
  }
}

export const TEXT_ASSIST_MODES: Array<{ id: string; label: string }> = [
  { id: "rewrite", label: "Rewrite" },
  { id: "shorten", label: "Shorten" },
  { id: "expand", label: "Expand" },
  { id: "grammar", label: "Fix grammar" },
  { id: "translate", label: "Translate" },
  { id: "tone", label: "Adjust tone" },
  { id: "generate", label: "Generate" },
];

export function aiOperationParams(operation: AIOperation): AIParams {
  return {};
}