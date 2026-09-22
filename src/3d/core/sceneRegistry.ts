import { useEditorStore } from "../../state/store";
import type { Scene3D } from "../types/types3d";
import { createScene3D } from "../types/types3d";

/**
 * Per-document 3D scenes. Scenes live with their document (each open tab has
 * its own workspace), while the store mirrors the active tab's scenes for the
 * UI. The engine keeps this registry in sync on open/switch/close.
 */
const scenesByDoc = new Map<string, Scene3D[]>();
const activeByDoc = new Map<string, string>();

export function defaultScene(): Scene3D {
  return createScene3D(`scene-${Date.now().toString(36)}`, "Scene");
}

export function setDocScenes(key: string, scenes: Scene3D[], activeId?: string | null): void {
  if (!scenes || scenes.length === 0) {
    scenesByDoc.delete(key);
    activeByDoc.delete(key);
  } else {
    scenesByDoc.set(key, scenes);
    activeByDoc.set(key, activeId ?? scenes[0]!.id);
  }
}

export function getDocScenes(key: string): Scene3D[] | null {
  return scenesByDoc.get(key) ?? null;
}

export function removeDocScenes(key: string): void {
  scenesByDoc.delete(key);
  activeByDoc.delete(key);
}

/** Write the store's scenes/active id back into the registry for `key`. */
export function captureDocScenes(key: string): void {
  const s = useEditorStore.getState();
  const scenes = s.scenes3D;
  if (scenes.length === 0) {
    scenesByDoc.delete(key);
    activeByDoc.delete(key);
  } else {
    scenesByDoc.set(key, scenes);
    activeByDoc.set(key, s.activeSceneId ?? scenes[0]?.id ?? null);
  }
}

/** Refresh the store from the registry for `key`. */
export function activateDocScenesForKey(key: string): void {
  const scenes = scenesByDoc.get(key) ?? [];
  const activeId = activeByDoc.get(key) ?? scenes[0]?.id ?? null;
  useEditorStore.setState({ scenes3D: scenes, activeSceneId: activeId, selected3DIds: [] });
}

export function ensureDocHasScene(key: string): void {
  const scenes = scenesByDoc.get(key);
  if (!scenes || scenes.length === 0) {
    const scene = defaultScene();
    scenesByDoc.set(key, [scene]);
    activeByDoc.set(key, scene.id);
  }
}