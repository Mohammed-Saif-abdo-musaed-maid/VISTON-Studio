import { describe, it, expect } from "vitest";
import { MeshStandardMaterial } from "three";
import { buildPrimitiveGeometry, buildMaterial } from "../core/geometry3d";
import { createMaterial } from "../types/types3d";

describe("buildPrimitiveGeometry", () => {
  it("builds a vertex-bearing BufferGeometry for every primitive kind", () => {
    const cases: Array<{ kind: "cube" | "sphere" | "cylinder" | "cone" | "plane" | "torus" | "capsule"; data: Record<string, unknown> }> = [
      { kind: "cube", data: { width: 1, height: 1, depth: 1 } },
      { kind: "sphere", data: { radius: 0.5 } },
      { kind: "cylinder", data: { radiusTop: 0.5, radiusBottom: 0.5, height: 1 } },
      { kind: "cone", data: { radius: 0.5, height: 1 } },
      { kind: "plane", data: { planeWidth: 1, planeHeight: 1 } },
      { kind: "torus", data: { torusRadius: 0.5, tube: 0.25 } },
      { kind: "capsule", data: { capsuleRadius: 0.4, capsuleLength: 0.6 } },
    ];
    for (const c of cases) {
      const geo = buildPrimitiveGeometry({ kind: c.kind, ...c.data } as never);
      expect(geo.attributes.position.count).toBeGreaterThan(3);
      expect(geo.index?.count ?? 0).toBeGreaterThan(3);
      geo.dispose();
    }
  });

  it("guards against degenerate parameters", () => {
    const geo = buildPrimitiveGeometry({ kind: "sphere", radius: 0, widthSegments: 0, heightSegments: 0 } as never);
    expect(geo.attributes.position.count).toBeGreaterThan(0);
    geo.dispose();
  });
});

describe("buildMaterial", () => {
  it("creates a MeshStandardMaterial from MaterialData", () => {
    const m = buildMaterial(createMaterial("m", "Mat"), new Map());
    expect(m).toBeInstanceOf(MeshStandardMaterial);
    expect(typeof m.color.getHex()).toBe("number");
    expect(m.metalness).toBeGreaterThanOrEqual(0);
    expect(m.roughness).toBeGreaterThanOrEqual(0);
    m.dispose();
  });

  it("handles wireframe, transparency and flat shading booleans", () => {
    const data = createMaterial("m", "Mat");
    data.wireframe = true;
    data.transparent = true;
    data.opacity = 0.4;
    data.flatShading = true;
    const m = buildMaterial(data, new Map());
    expect(m.wireframe).toBe(true);
    expect(m.transparent).toBe(true);
    expect(m.opacity).toBeCloseTo(0.4, 5);
    expect(m.flatShading).toBe(true);
    m.dispose();
  });
});