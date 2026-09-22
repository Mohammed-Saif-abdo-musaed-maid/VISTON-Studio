import {
  BoxGeometry,
  SphereGeometry,
  CylinderGeometry,
  ConeGeometry,
  PlaneGeometry,
  TorusGeometry,
  CapsuleGeometry,
  BufferGeometry,
  MeshStandardMaterial,
  Mesh,
  Group,
  Color,
} from "three";
import type { PrimitiveGeometryData, GeometryData, Scene3D, Object3DData, MaterialData } from "../types/types3d";
import { materialById } from "./sceneModel3d";

/**
 * Build a Three.js BufferGeometry from a primitive descriptor.
 * Pure three-math — safe to run outside a WebGL context (used by tests).
 */
export function buildPrimitiveGeometry(data: PrimitiveGeometryData): BufferGeometry {
  const d = normalizePrimitive(data);
  switch (d.kind) {
    case "cube":
      return new BoxGeometry(d.width ?? 1, d.height ?? 1, d.depth ?? 1);
    case "sphere":
      return new SphereGeometry(d.radius ?? 0.5, d.widthSegments ?? 24, d.heightSegments ?? 16);
    case "cylinder":
      return new CylinderGeometry(d.radiusTop ?? 0.5, d.radiusBottom ?? 0.5, d.height ?? 1, d.radialSegments ?? 24);
    case "cone":
      return new ConeGeometry(d.radius ?? 0.5, d.height ?? 1, d.radialSegments ?? 24);
    case "plane":
      return new PlaneGeometry(d.planeWidth ?? 1, d.planeHeight ?? 1);
    case "torus":
      return new TorusGeometry(d.torusRadius ?? 0.5, d.tube ?? 0.2, d.radialSegments ?? 16, d.tubularSegments ?? 32);
    case "capsule":
      return new CapsuleGeometry(d.capsuleRadius ?? 0.4, d.capsuleLength ?? 0.8, d.capSegments ?? 8, d.radialSegments ?? 16);
  }
}

function normalizePrimitive(d: PrimitiveGeometryData): PrimitiveGeometryData {
  return { ...d };
}

/**
 * Apply material params to a three MeshStandardMaterial. Colors parsed from
 * hex strings; failures fall back to defaults instead of throwing.
 */
export function applyMaterialData(material: MeshStandardMaterial, m: MaterialData): void {
  material.color.set(m.color || "#8a93a2");
  material.metalness = m.metalness ?? 0.1;
  material.roughness = m.roughness ?? 0.65;
  material.emissive.set(m.emissive || "#000000");
  material.emissiveIntensity = m.emissiveIntensity ?? 1;
  material.opacity = m.opacity ?? 1;
  material.transparent = m.transparent ?? false;
  material.wireframe = m.wireframe ?? false;
  material.flatShading = m.flatShading ?? false;
  material.side = m.doubleSide ? 2 : 0;
  material.needsUpdate = true;
}

type MaterialMap = Map<string, MeshStandardMaterial>;

/**
 * Build (or reuse) a three MeshStandardMaterial for a serializable MaterialData.
 * Shared material map lets many objects reuse a single GPU program.
 */
export function buildMaterial(m: MaterialData, shared: MaterialMap): MeshStandardMaterial {
  let mat = shared.get(m.id);
  if (!mat) {
    mat = new MeshStandardMaterial();
    try {
      applyMaterialData(mat, m);
    } finally {
      shared.set(m.id, mat);
    }
  } else {
    applyMaterialData(mat, m);
  }
  return mat;
}

/**
 * Convert serializable object into a three Object3D (Group for groups,
 * Mesh for objects). Geometry comes from primitive descriptor or (imported)
 * from the provided loader map. Returns null when the node cannot be built.
 */
export function buildObject3D(
  obj: Object3DData,
  scene: Scene3D,
  sharedMaterials: MaterialMap,
  importedBuffers: Map<string, BufferGeometry>
): Group | Mesh | null {
  if (obj.kind === "group") {
    const g = new Group();
    g.name = obj.name;
    return g;
  }
  let geometry: BufferGeometry | null = null;
  const geo = obj.geometry;
  if (geo) {
    if (geo.kind === "primitive") {
      geometry = buildPrimitiveGeometry(geo.data);
    } else if (geo.kind === "imported") {
      geometry = importedBuffers.get(geo.assetId) ?? null;
    }
  }
  if (!geometry) return null;
  const mat = materialById(scene, obj.materialId);
  const threeMat = buildMaterial(mat ?? fallbackMaterial(obj), sharedMaterials);
  const mesh = new Mesh(geometry, threeMat);
  mesh.name = obj.name;
  mesh.castShadow = obj.castShadow ?? true;
  mesh.receiveShadow = obj.receiveShadow ?? true;
  return mesh;
}

function fallbackMaterial(obj: Object3DData): MaterialData {
  return {
    id: obj.materialId ?? "",
    name: "Material",
    color: "#8a93a2",
    metalness: 0.1,
    roughness: 0.65,
    emissive: "#000000",
    emissiveIntensity: 1,
    opacity: 1,
    transparent: false,
    wireframe: false,
    flatShading: false,
    doubleSide: false,
    slots: {},
  };
}

export function colorHex(c: Color): string {
  return "#" + c.getHexString();
}