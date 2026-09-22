import { describe, it, expect } from "vitest";
import {
  createScene3D, createObject3D, createMaterial, createLight,
} from "../types/types3d";
import {
  childrenOf, rootObjects, descendantsOf, ancestorIds, isDescendantOf,
  duplicateObjects, sanitizeScene3D, presetCameraData, objectById, materialById, lightById,
} from "../core/sceneModel3d";
import type { Scene3D } from "../types/types3d";

function seedScene(): Scene3D {
  const s = createScene3D("s", "Seed");
  s.objects = [];
  s.materials = [createMaterial("m1", "Mat")];
  s.lights = [createLight("l1", "Sun", "directional")];
  const root = createObject3D("o1", "Root", "group");
  const child = createObject3D("o2", "Child", "object");
  child.parentId = "o1";
  child.materialId = "m1";
  s.objects.push(root, child);
  return s;
}

describe("scene hierarchy helpers", () => {
  it("computes roots, children and descendants", () => {
    const s = seedScene();
    expect(rootObjects(s).map((o) => o.id)).toEqual(["o1"]);
    expect(childrenOf(s, "o1").map((o) => o.id)).toEqual(["o2"]);
    expect(childrenOf(s, "o2")).toEqual([]);
    expect(descendantsOf(s, "o1")).toEqual(["o2"]);
    expect(ancestorIds(s, "o2")).toEqual(["o1"]);
    expect(isDescendantOf(s, "o1", "o2")).toBe(true);
    expect(isDescendantOf(s, "o2", "o1")).toBe(false);
  });

  it("looks up objects, materials and lights by id", () => {
    const s = seedScene();
    expect(objectById(s, "o2")?.name).toBe("Child");
    expect(materialById(s, "m1")?.name).toBe("Mat");
    expect(lightById(s, "l1")?.kind).toBe("directional");
  });
});

describe("duplicateObjects", () => {
  it("clones a hierarchy remapping parent + material references", () => {
    const s = seedScene();
    const { objects, materials } = duplicateObjects(s, ["o1", "o2"]);
    expect(objects.length).toBe(2);
    expect(materials.length).toBe(1);
    const root = objects.find((o) => o.name === "Root Copy")!;
    const child = objects.find((o) => o.name === "Child Copy")!;
    expect(root.id).not.toBe("o1");
    expect(child.parentId).toBe(root.id);
    expect(child.materialId).not.toBe("m1");
    expect(root.parentId).toBeNull();
    expect(materials[0]!.id).toBe(child.materialId);
  });
});

describe("sanitizeScene3D", () => {
  it("repairs junk input without throwing", () => {
    const s = sanitizeScene3D({ id: 42, name: null, objects: "nope", lights: [{ id: 1, kind: "nonsense" }] } as unknown, "fallback");
    expect(s.id).toBe("fallback");
    expect(Array.isArray(s.objects)).toBe(true);
    expect(Array.isArray(s.lights)).toBe(true);
    expect(Array.isArray(s.materials)).toBe(true);
    expect(Array.isArray(s.cameras)).toBe(true);
    expect(s.environment).toBeTruthy();
    expect(s.settings).toBeTruthy();
  });

  it("preserves a valid scene shape", () => {
    const s = seedScene();
    const clean = sanitizeScene3D(JSON.parse(JSON.stringify(s)) as unknown, "fb");
    expect(clean.objects.length).toBe(2);
    expect(clean.materials.length).toBe(1);
    expect(clean.lights.length).toBe(1);
    expect(clean.cameras.length).toBe(1);
  });
});

describe("presetCameraData", () => {
  it("produces usable camera settings for each preset", () => {
    const base = createScene3D("s", "x").cameras[0]!;
    const kinds = ["perspective", "front", "top", "right"] as const;
    for (const kind of kinds) {
      const cam = presetCameraData(kind, base);
      expect(cam.position.length).toBe(3);
      expect(cam.target.length).toBe(3);
      expect(cam.fov).toBeGreaterThan(0);
    }
  });
});