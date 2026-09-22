import type { EditorEngine } from "./engine";
import type { CanvasEngine } from "../canvas/canvasEngine";

export interface RuntimeRefs {
  engine: EditorEngine;
  canvas: CanvasEngine | null;
}

export const runtime: RuntimeRefs = {
  engine: null!,
  canvas: null,
};