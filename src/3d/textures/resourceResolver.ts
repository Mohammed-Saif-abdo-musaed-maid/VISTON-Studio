import { pixelStore } from "../../editor/core/document";

/**
 * Resolve a texture/material asset key to an existing project pixel buffer.
 * 3D texture slots reference image layer buffers by their `imageId`, so the same
 * store that powers the 2D compositor also feeds real WebGL textures.
 */
export function resolveResourceCanvas(assetId: string): HTMLCanvasElement | null {
  return pixelStore.get(assetId) ?? null;
}
