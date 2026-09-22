import type { CameraPresetKind, Scene3D } from "../../3d/types/types3d";

/**
 * Lightweight accessor for the active 3D viewport controller.
 *
 * This module intentionally has no dependency on three.js or the viewport
 * component: it lets the menu bar and 3D toolbar reference the controller
 * without statically pulling the whole 3D bundle into the initial chunk.
 * The real implementation registers itself when the (lazily loaded)
 * Viewport3D mounts.
 */
export interface Viewport3DController {
  setGizmoMode(mode: Scene3D["settings"]["gizmoMode"]): void;
  setGizmoSpace(space: Scene3D["settings"]["gizmoSpace"]): void;
  frameSelected(): void;
  frameAll(): void;
  setViewPreset(kind: CameraPresetKind): void;
  resetView(): void;
  setDisplayMode(mode: Scene3D["settings"]["displayMode"]): void;
  toggleGrid(): void;
  toggleAxes(): void;
  toggleSnap(): void;
  setCameraMode(ortho: boolean): void;
  renderToLayer(): void;
  addLiveLayer(): void;
  exportPng(): void;
}

let controller: Viewport3DController | null = null;

export function viewport3d(): Viewport3DController | null {
  return controller;
}

export function setViewport3dController(next: Viewport3DController | null): void {
  controller = next;
}
