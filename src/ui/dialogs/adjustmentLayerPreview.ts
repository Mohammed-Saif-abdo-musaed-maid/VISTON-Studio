import { useEditorStore } from "../../state/store";
import { compositeToCanvas } from "../../editor/renderer/compositor";
import { EditorDocument, pixelStore } from "../../editor/core/document";
import { AdjustmentKind, AdjustmentParams } from "../../editor/core/types";
import { createAdjustmentLayer } from "../../editor/layers/layerFactory";

export function adjustmentLayerPreview(adjustment: AdjustmentKind, params: AdjustmentParams | null, amount = 1): HTMLCanvasElement | null {
  const doc = useEditorStore.getState().doc;
  if (!doc) return null;
  const layer = createAdjustmentLayer(adjustment, amount, "__preview__", params ?? null);
  const tempDoc = new EditorDocument(doc.width, doc.height, [...doc.layers, layer]);
  return compositeToCanvas(tempDoc, { pixels: pixelStore });
}