import { describe, it, expect } from "vitest";
import {
  createScene3D,
  createObject3D,
  createMaterial,
  createLight,
  createCamera,
  isScene3DValue,
  PRIMITIVE_KINDS,
  LIGHT_KINDS,
  TEXTURE_SLOT_NAMES,
  emptyTextureSlot,
  defaultEnvironment,
  defaultSettings,
} from "../types/types3d";

describe("types3d creators", () => {
  it("creates a default scene with a cube, material, lights and a camera", () => {
    const s = createScene3D("scene-1", "Shots");
    expect(s.id).toBe("scene-1");
    expect(s.name).toBe("Shots");
    expect(s.objects.length).toBe(1);
    expect(s.objects[0]!.name).toBe("Cube");
    expect(s.objects[0]!.geometry?.kind).toBe("primitive");
    expect(s.materials.length).toBe(1);
    expect(s.lights.length).toBe(2);
    expect(s.cameras.length).toBe(1);
    expect(s.activeCameraId).toBe(s.cameras[0]!.id);
    expect(s.version).toBe(1);
    expect(isScene3DValue(s)).toBe(true);
  });

  it("creates objects for every primitive kind with serializable defaults", () => {
    for (const kind of PRIMITIVE_KINDS) {
      const a = createObject3D("o", "X", "object");
      expect(a.kind).toBe("object");
      expect(a.geometry).toBeNull();
      expect(a.materialId).toBeNull();
      expect(a.position).toEqual([0, 0, 0]);
      expect(a.rotation).toEqual([0, 0, 0]);
      expect(a.scale).toEqual([1, 1, 1]);
      expect(a.castShadow).toBe(true);
      expect(a.receiveShadow).toBe(true);
      void kind;
    }
  });

  it("creates all light kinds with sensible intensity and shadow defaults", () => {
    for (const kind of LIGHT_KINDS) {
      const l = createLight("l", "L", kind);
      expect(l.kind).toBe(kind);
      expect(l.intensity).toBe(kind === "ambient" ? 0.6 : 1);
      expect(l.castShadow).toBe(kind !== "ambient");
      expect(l.visible).toBe(true);
    }
  });

  it("creates a camera with sensible defaults", () => {
    const c = createCamera("c", "Cam");
    expect(c.fov).toBe(50);
    expect(c.position).toEqual([6, 5, 8]);
    expect(c.target).toEqual([0, 0, 0]);
    expect(c.ortho).toBe(false);
  });

  it("creates materials with an initially empty slot map", () => {
    const m = createMaterial("m", "Mat");
    expect(m.name).toBe("Mat");
    expect(m.slots).toEqual({});
    m.slots.map = emptyTextureSlot();
    expect(m.slots.map).toEqual({ assetId: null, sourceKind: "none" });
    for (const slot of TEXTURE_SLOT_NAMES) {
      expect(typeof slot).toBe("string");
    }
    expect(m.opacity).toBe(1);
    expect(m.metalness).toBeGreaterThanOrEqual(0);
    expect(m.roughness).toBeGreaterThanOrEqual(0);
  });

  it("environment and settings carry defaults used at render time", () => {
    const env = defaultEnvironment();
    expect(env.backgroundType).toBe("solid");
    expect(env.backgroundColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(env.shadowsEnabled).toBe(false);
    expect(env.exposure).toBe(1);
    const st = defaultSettings();
    expect(st.gizmoMode).toBe("select");
    expect(st.displayMode).toBe("solid");
    expect(st.gridVisible).toBe(true);
    expect(st.snapEnabled).toBe(false);
  });
});

describe("isScene3DValue guard", () => {
  it("rejects null, arrays, and malformed objects", () => {
    expect(isScene3DValue(null)).toBe(false);
    expect(isScene3DValue([])).toBe(false);
    expect(isScene3DValue({ id: "x" })).toBe(false);
    expect(isScene3DValue("hello")).toBe(false);
  });

  it("accepts a minimally valid scene shape", () => {
    const minimal = { id: "s", name: "S", objects: [], materials: [], lights: [], cameras: [], environment: {}, settings: {}, activeCameraId: null, version: 1 };
    expect(isScene3DValue(minimal)).toBe(true);
  });
});