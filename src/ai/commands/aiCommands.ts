import { runtime } from "../../editor/core/runtime";
import { pixelStore } from "../../editor/core/document";
import { selectionEngine } from "../../editor/selection/selectionEngine";
import { useEditorStore } from "../../state/store";
import { topSelectedLayer } from "../../state/store";
import { AIError } from "../core/AIError";
import { aiService } from "../services/AIService";
import { AI_TASK_LABELS } from "../services/AIService";
import { aiSelectionFromEditor, applyAiSelectionToEditor } from "../image/maskConversion";
import { insertAiResultAsLayer } from "../history/AIHistoryAdapter";
import type { AIImageData, AIParams, AIOperation } from "../types";

export function currentDocImage(): AIImageData | null {
  const engine = runtime.engine;
  const state = useEditorStore.getState();
  if (!engine?.doc()) return null;
  const selected = topSelectedLayer(state);
  let canvas: HTMLCanvasElement | null = null;
  let name = "Composite";
  let layerId: string | null = null;
  if (selected && selected.type === "image") {
    canvas = pixelStore.get(selected.imageId) ?? null;
    if (canvas) {
      name = selected.name;
      layerId = selected.id;
    }
  }
  if (!canvas) canvas = engine.getComposite();
  if (!canvas || canvas.width < 1 || canvas.height < 1) return null;
  return { canvas, layerId, name, width: canvas.width, height: canvas.height };
}

export function paramsForOp(op: AIOperation, prompt: string): AIParams {
  const p = prompt.trim() || null;
  const record = (obj: Record<string, unknown>): AIParams => obj as AIParams;
  switch (op) {
    case "upscale":
      return record({ scale: 2 });
    case "generateImage":
    case "generateVariation":
      return record({ width: 512, height: 512, variations: 1, prompt: p });
    case "denoise":
      return record({ strength: 0.5, detail: 0.4, colorNoise: 0.4, luminanceNoise: 0.4, prompt: p });
    case "sharpen":
      return record({ amount: 1, radius: 1, detail: 0.5, denoise: 0.1, prompt: p });
    case "restore":
      return record({ scratches: true, denoise: true, deblur: true, faces: true, reconstruct: true, contrast: false, prompt: p });
    case "relight":
      return record({ direction: 225, intensity: 0.5, temperature: 0, softness: 0.5, ambient: 0.3, shadowStrength: 0.5, prompt: p });
    default:
      return record({ prompt: p });
  }
}

export const SELECTION_SENSITIVE: AIOperation[] = [
  "inpaint",
  "generativeFill",
  "generativeExpand",
  "objectReplace",
  "removeObject",
];

export interface RunAiCommandOptions {
  prompt?: string;
  applySelection?: boolean;
  autoInsert?: boolean;
}

/** Run an AI command against the active document image and sync UI/status. */
export async function runAiCommand(op: AIOperation, opts: RunAiCommandOptions = {}): Promise<void> {
  const state = useEditorStore.getState();
  const img = currentDocImage();
  if (!img) {
    state.setStatus("AI: no image available");
    return;
  }
  const selection = selectionEngine.hasSelection ? aiSelectionFromEditor() : null;
  const params = paramsForOp(op, opts.prompt ?? state.aiLastResult?.request.params.prompt ?? "");
  try {
    const result = await aiService.run({ operation: op, image: img, selection, params });
    if (opts.applySelection !== false && result.selection) applyAiSelectionToEditor(result.selection);
    if (opts.autoInsert !== false && result.canvas) {
      const report = insertAiResultAsLayer(result);
      state.setStatus(report.ok ? "AI result added as a layer." : `AI: ${report.reason ?? "insert failed"}`);
    } else {
      state.setStatus(`AI: ${AI_TASK_LABELS[op] ?? op} — ${result.canvas ? "image ready" : result.text ? "text ready" : "done"}`);
    }
  } catch (err) {
    state.setStatus(`AI: ${AIError.userSafe(err)}`);
  }
}