import type { Scene3D } from "../types/types3d";

export type RenderScene3DToCanvas = (
  scene: Scene3D,
  width: number,
  height: number,
  opts?: { objectId?: string | null }
) => HTMLCanvasElement | null;

/**
 * Indirection that keeps the always-loaded 3D data store free of a static
 * dependency on the WebGL renderer (and therefore on three.js). The renderer
 * registers its implementation here when the lazily loaded 3D viewport loads;
 * until then rasterization requests are honest no-ops.
 */
let impl: RenderScene3DToCanvas | null = null;

export function registerRenderScene3DToCanvas(fn: RenderScene3DToCanvas): void {
  impl = fn;
}

export function getRenderScene3DToCanvas(): RenderScene3DToCanvas | null {
  return impl;
}
