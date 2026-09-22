import { describe, it, expect, beforeEach } from "vitest";
import { useEditorStore } from "../../state/store";
import {
  defaultScene, setDocScenes, getDocScenes, removeDocScenes,
  captureDocScenes, activateDocScenesForKey, ensureDocHasScene,
} from "../core/sceneRegistry";

function reset() {
  useEditorStore.getState().setScenes3D([], null);
  useEditorStore.getState().setActiveScene3D(null);
}

beforeEach(reset);

describe("sceneRegistry", () => {
  it("keeps scenes isolated per document key", () => {
    const a = defaultScene();
    const b = defaultScene();
    setDocScenes("doc-a", [a], a.id);
    setDocScenes("doc-b", [b], b.id);
    expect(getDocScenes("doc-a")![0]!.id).toBe(a.id);
    expect(getDocScenes("doc-b")![0]!.id).toBe(b.id);
    removeDocScenes("doc-a");
    expect(getDocScenes("doc-a")).toBeNull();
    expect(getDocScenes("doc-b")!.length).toBe(1);
  });

  it("ensures a default scene on demand", () => {
    ensureDocHasScene("doc-c");
    const scenes = getDocScenes("doc-c");
    expect(scenes?.length).toBe(1);
  });

  it("captureDocScenes mirrors the store into the registry", () => {
    const a = defaultScene();
    const b = defaultScene();
    useEditorStore.setState({ scenes3D: [a, b], activeSceneId: b.id });
    captureDocScenes("doc-d");
    const got = getDocScenes("doc-d");
    expect(got?.map((s) => s.id)).toEqual([a.id, b.id]);
  });

  it("activateDocScenesForKey restores the stored scenes into the store", () => {
    const a = defaultScene();
    const b = defaultScene();
    setDocScenes("doc-e", [a, b], b.id);
    reset();
    activateDocScenesForKey("doc-e");
    const st = useEditorStore.getState();
    expect(st.scenes3D.map((s) => s.id)).toEqual([a.id, b.id]);
    expect(st.activeSceneId).toBe(b.id);
  });
});