import { runtime } from "../../editor/core/runtime";
import { createAiResultLayer } from "../../editor/layers/layerFactory";
import { applyAiSelectionToEditor } from "../image/maskConversion";
import { AIError } from "../core/AIError";
import { AI_TASK_LABELS } from "../services/AIService";
import type { AIResult } from "../types";
import { isAIResultCanvas } from "../types";

export interface InsertAiResultOptions {
  label?: string;
  applySelection?: boolean;
}

export interface InsertResultReport {
  ok: boolean;
  layerId?: string;
  reason?: string;
}

/**
 * Brings an AI result into the active document:
 *  - image results become a brand-new layer (original stays untouched → non-destructive),
 *  - the op is pushed onto regular undo/redo via engine.addLayer,
 *  - a returned selection is offered back to the editor selection engine.
 */
export function insertAiResultAsLayer(
  result: AIResult,
  opts: InsertAiResultOptions = {}
): InsertResultReport {
  if (!result || !isAIResultCanvas(result)) {
    return { ok: false, reason: "The AI result contains no image." };
  }

  const engine = runtime.engine;
  if (!engine?.doc()) {
    return { ok: false, reason: "No document is open." };
  }

  try {
    const label = opts.label ?? AI_TASK_LABELS[result.request.operation] ?? "AI Layer";
    const layer = createAiResultLayer(result, label, { sourceLayerId: engine.activeLayerId() });
    engine.addLayer(layer, "AI Result: " + label);
    if (opts.applySelection !== false && result.selection) {
      applyAiSelectionToEditor(result.selection);
    }
    return { ok: true, layerId: layer.id };
  } catch (err) {
    return { ok: false, reason: AIError.userSafe(err) };
  }
}

export function aiResultStats(result: AIResult): { width: number; height: number; origin: string } | null {
  if (!result.canvas) return null;
  return { width: result.canvas.width, height: result.canvas.height, origin: result.origin };
}