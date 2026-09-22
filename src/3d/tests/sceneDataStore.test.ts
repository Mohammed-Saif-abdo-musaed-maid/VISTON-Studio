import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "../../state/store";
import {
  createScene, ensureActiveScene, mutateScene3D, addObjectToScene,
  addGroupToScene, addLightToScene, duplicateScene, removeScene,
  activeScene, scenesOf,
} from "../core/sceneDataStore";

function reset() {
  useEditorStore.getState().setScenes3D([], null);
  useEditorStore.getState().setActiveScene3D(null);
  useEditorStore.getState().setSelected3D([]);
}

beforeEach(reset);

describe("sceneDataStore", () => {
  it("creates and activates a scene", () => {
    const s = createScene("New");
    expect(s.name).toBe("New");
    expect(useEditorStore.getState().activeSceneId).toBe(s.id);
    expect(activeScene()?.id).toBe(s.id);
  });

  it("ensureActiveScene creates a scene when none exists", () => {
    const s = ensureActiveScene();
    expect(scenesOf().length).toBe(1);
    expect(useEditorStore.getState().activeSceneId).toBe(s.id);
  });

  it("adds objects, groups and lights to the active scene", () => {
    ensureActiveScene();
    const objId = addObjectToScene("sphere")!;
    const grpId = addGroupToScene()!;
    const lightId = addLightToScene("point")!;
    const s = activeScene()!;
    expect(s.objects.find((o) => o.id === objId)?.geometry?.kind).toBe("primitive");
    expect(s.objects.find((o) => o.id === grpId)?.kind).toBe("group");
    expect(s.objects.length).toBe(3);
    expect(s.lights.find((l) => l.id === lightId)?.kind).toBe("point");
  });

  it("mutateScene3D bumps version and persists to the store", () => {
    ensureActiveScene();
    const id = addObjectToScene("cube")!;
    const v0 = activeScene()!.version;
    mutateScene3D((s) => {
      const o = s.objects.find((x) => x.id === id)!;
      o.position = [1, 2, 3];
    });
    const s = activeScene()!;
    expect(s.version).toBe(v0 + 1);
    expect(s.objects.find((x) => x.id === id)!.position).toEqual([1, 2, 3]);
  });

  it("duplicateScene deep-copies the scene with remapped ids", () => {
    ensureActiveScene();
    addObjectToScene("sphere");
    const srcId = activeScene()!.id;
    const origObjId = activeScene()!.objects[0]!.id;
    const newId = duplicateScene(srcId)!;
    const scenes = scenesOf();
    expect(scenes.length).toBe(2);
    const copy = scenes.find((s) => s.id === newId)!;
    const orig = scenes.find((s) => s.id === srcId)!;
    expect(orig).toBeDefined();
    expect(copy.objects[0]!.id).not.toBe(origObjId);
    expect(copy.name).toContain("Copy");
    expect(useEditorStore.getState().activeSceneId).toBe(newId);
  });

  it("removeScene removes the scene and retargets the active id", () => {
    ensureActiveScene();
    const s1 = activeScene()!;
    const s2 = createScene("Two");
    removeScene(s1.id);
    const st = useEditorStore.getState();
    expect(st.scenes3D.map((s) => s.id)).toEqual([s2.id]);
    expect(st.activeSceneId).toBe(s2.id);
  });
});