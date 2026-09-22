import { describe, it, expect } from "vitest";
import { EditorDocument } from "../../editor/core/document";
import { createScene3D, createObject3D, createMaterial } from "../types/types3d";
import { identityTransform } from "../../editor/core/types";
import type { Group3DLayer, Scene3DLayer } from "../../editor/core/types";
import { buildProjectFile, stringifyProject, parseProjectText } from "../../editor/project/projectFormat";

function sceneDummy(): Scene3DLayer {
  return {
    id: "l1", name: "Scene (3D)", type: "3d-scene", visible: true, locked: false,
    opacity: 1, blendMode: "normal", transform: identityTransform(0, 0, 200, 200),
    parentId: null, clipTo: null, mask: null, sceneId: "scene-abc", imageId: "img-3d",
  };
}

function groupDummy(): Group3DLayer {
  return {
    id: "l2", name: "Group (3D)", type: "3d-group", visible: true, locked: false,
    opacity: 1, blendMode: "normal", transform: identityTransform(0, 0, 200, 200),
    parentId: null, clipTo: null, mask: null, sceneId: "scene-abc", objectId: "obj-1", imageId: "img-3d-g",
  };
}

describe("projectFormat 3D round-trip", () => {
  it("embeds scenes + imported resources and survives a serialization round-trip", () => {
    const doc = new EditorDocument(200, 200, [sceneDummy(), groupDummy()]);
    const scene = createScene3D("scene-abc", "Main");
    const mat = createMaterial("m1", "Mat");
    const child = createObject3D("obj-1", "Child", "object");
    child.materialId = "m1";
    scene.materials.push(mat);
    scene.objects.push(child);
    child.parentId = "obj-0";
    scene.objects.unshift(createObject3D("obj-0", "Root", "group"));

    const file = buildProjectFile(
      doc,
      { id: "proj-1", name: "Saved", createdAt: 1, modifiedAt: 1, dpi: 96, background: null, colorProfile: "sRGB", physicalUnit: null, physicalWidth: null, physicalHeight: null },
      "l2",
      {
        scenes: [scene],
        imported: [{ assetId: "model-1", name: "teapot", kind: "gltf", dataUrl: "data:application/octet-stream;base64,AAAA" }],
      }
    );

    expect(file.scenes?.length).toBe(1);
    expect(file.imported?.length).toBe(1);
    expect((file.layers[0] as Record<string, unknown>).type).toBe("3d-scene");
    expect((file.layers[0] as Record<string, unknown>).sceneId).toBe("scene-abc");
    expect((file.layers[0] as Record<string, unknown>).imageId).toBe("img-3d");
    expect((file.layers[1] as Record<string, unknown>).type).toBe("3d-group");

    const text = stringifyProject(file);
    const parsed = parseProjectText(text);
    expect(parsed.error).toBeNull();
    expect(parsed.file).not.toBeNull();
    expect(parsed.file!.scenes?.length).toBe(1);
    expect(parsed.file!.imported?.length).toBe(1);
    const rtScene = parsed.file!.scenes![0] as { id: string; name: string; objects: unknown[] };
    expect(rtScene.id).toBe("scene-abc");
    expect(rtScene.objects.length).toBe(3);
    expect(parsed.file!.layers.length).toBe(2);
  });

  it("keeps legacy files without 3D data parseable and scene-free", () => {
    const doc = new EditorDocument(10, 10, []);
    const file = buildProjectFile(doc, { id: "proj-2", name: "Plain", createdAt: 1, modifiedAt: 1, dpi: 96, background: null, colorProfile: "sRGB", physicalUnit: null, physicalWidth: null, physicalHeight: null }, null);
    expect(file.scenes).toBeUndefined();
    expect(file.imported).toBeUndefined();
    const parsed = parseProjectText(stringifyProject(file));
    expect(parsed.error).toBeNull();
    expect(parsed.file!.scenes).toBeUndefined();
    expect(parsed.file!.imported).toBeUndefined();
    expect(parsed.warnings).toBeTruthy();
  });
});