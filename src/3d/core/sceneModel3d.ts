import {
  Scene3D,
  Object3DData,
  MaterialData,
  LightData,
  CameraData,
  CameraPresetKind,
  GeometryData,
  PrimitiveGeometryData,
  isScene3DValue,
  createScene3D,
  PRIMITIVE_KINDS,
} from "../types/types3d";

export function objectById(scene: Scene3D, id: string): Object3DData | undefined {
  return scene.objects.find((o) => o.id === id);
}

export function materialById(scene: Scene3D, id: string | null): MaterialData | undefined {
  if (!id) return undefined;
  return scene.materials.find((m) => m.id === id);
}

export function lightById(scene: Scene3D, id: string): LightData | undefined {
  return scene.lights.find((l) => l.id === id);
}

export function cameraById(scene: Scene3D, id: string): CameraData | undefined {
  return scene.cameras.find((c) => c.id === id);
}

export function childrenOf(scene: Scene3D, parentId: string | null): Object3DData[] {
  return scene.objects.filter((o) => o.parentId === parentId);
}

export function rootObjects(scene: Scene3D): Object3DData[] {
  return scene.objects.filter((o) => o.parentId === null);
}

export function descendantsOf(scene: Scene3D, id: string): string[] {
  const out: string[] = [];
  const walk = (pid: string): void => {
    for (const o of scene.objects) {
      if (o.parentId === pid) {
        out.push(o.id);
        walk(o.id);
      }
    }
  };
  walk(id);
  return out;
}

export function ancestorIds(scene: Scene3D, id: string): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  let cur = objectById(scene, id)?.parentId ?? null;
  while (cur) {
    if (seen.has(cur)) break;
    seen.add(cur);
    out.push(cur);
    cur = objectById(scene, cur)?.parentId ?? null;
  }
  return out;
}

/** True when `parent` is `child` itself or one of its descendants (cycle guard). */
export function isDescendantOf(scene: Scene3D, childId: string, parentId: string): boolean {
  if (childId === parentId) return true;
  return descendantsOf(scene, childId).includes(parentId);
}

export function cloneObject(o: Object3DData): Object3DData {
  return {
    ...o,
    position: [...o.position],
    rotation: [...o.rotation],
    scale: [...o.scale],
    geometry: o.geometry ? cloneGeometry(o.geometry) : null,
  };
}

function cloneGeometry(g: GeometryData): GeometryData {
  if (g.kind === "imported") return { kind: "imported", assetId: g.assetId };
  return { kind: "primitive", data: { ...g.data } };
}

export function cloneMaterial(m: MaterialData): MaterialData {
  return {
    ...m,
    slots: Object.fromEntries(Object.entries(m.slots).map(([k, v]) => [k, { ...v }])),
  };
}

export function duplicateObjects(scene: Scene3D, ids: string[]): { objects: Object3DData[]; materials: MaterialData[] } {
  const idMap = new Map<string, string>();
  const toClone = ids.filter((id) => objectById(scene, id));
  for (const id of toClone) idMap.set(id, newId());
  const newObjects: Object3DData[] = [];
  const usedMaterials = new Set<string>();
  const pending: Object3DData[] = [];
  for (const id of toClone) {
    const src = objectById(scene, id)!;
    const dup = cloneObject(src);
    dup.id = idMap.get(id)!;
    dup.name = `${src.name} Copy`;
    dup.position = [...src.position];
    dup.position[0] = src.position[0] + 0.25;
    dup.parentId = src.parentId && idMap.has(src.parentId) ? idMap.get(src.parentId)! : null;
    if (src.materialId) usedMaterials.add(src.materialId);
    pending.push(dup);
  }
  for (const dup of pending) {
    newObjects.push(dup);
  }
  const newMaterials: MaterialData[] = [];
  for (const mid of usedMaterials) {
    const src = materialById(scene, mid);
    if (!src) continue;
    const dup = cloneMaterial(src);
    dup.id = newId();
    dup.name = `${src.name} Copy`;
    newMaterials.push(dup);
    for (const o of newObjects) {
      if (o.materialId === mid) o.materialId = dup.id;
    }
  }
  return { objects: newObjects, materials: newMaterials };
}

function newId(): string {
  return `id3-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Validate + normalize a raw unknown value into a Scene3D (used when loading
 * project files). Every harmful or missing field falls back to a safe value;
 * never throws on structurally-valid JSON.
 */
export function sanitizeScene3D(raw: unknown, fallbackId: string): Scene3D {
  if (!isScene3DValue(raw)) return createScene3D(fallbackId);
  const src = raw as Scene3D;
  const out = createScene3D(src.id, typeof src.name === "string" ? src.name : "Scene");
  out.version = typeof src.version === "number" && src.version >= 1 ? Math.round(src.version) : 1;
  const seen = new Set<string>();
  out.objects = (Array.isArray(src.objects) ? src.objects : [])
    .filter((o): o is Object3DData => !!o && typeof o === "object")
    .map((o) => {
      const v = o as Partial<Object3DData> & { id?: string };
      const id = typeof v.id === "string" ? v.id : newId();
      if (seen.has(id)) return null;
      seen.add(id);
      const cleaned: Object3DData = {
        id,
        name: typeof v.name === "string" ? v.name : "Object",
        kind: v.kind === "group" ? "group" : "object",
        visible: v.visible !== false,
        locked: v.locked === true,
        parentId: typeof v.parentId === "string" ? v.parentId : null,
        geometry: sanitizeGeometry(v.geometry),
        materialId: typeof v.materialId === "string" ? v.materialId : null,
        position: sanitizeVec(v.position),
        rotation: sanitizeVec(v.rotation),
        scale: sanitizeVec(v.scale, [1, 1, 1]),
        castShadow: v.castShadow !== false,
        receiveShadow: v.receiveShadow !== false,
      };
      return cleaned;
    })
    .filter((o): o is Object3DData => o !== null);
  out.materials = (Array.isArray(src.materials) ? src.materials : [])
    .filter((m): m is MaterialData => !!m && typeof m === "object")
    .map((m) => {
      const v = m as Partial<MaterialData> & { id?: string };
      const id = typeof v.id === "string" ? v.id : newId();
      const slots = (v.slots && typeof v.slots === "object" ? v.slots : {}) as Record<string, { assetId?: unknown; sourceKind?: unknown }>;
      const outSlots: MaterialData["slots"] = {};
      for (const key of Object.keys(slots)) {
        const slot = slots[key];
        if (!slot || typeof slot !== "object") continue;
        outSlots[key as keyof MaterialData["slots"]] = {
          assetId: typeof slot.assetId === "string" && slot.assetId ? slot.assetId : null,
          sourceKind: slot.sourceKind === "image-resource" || slot.sourceKind === "external-url" ? slot.sourceKind : "none",
        };
      }
      return {
        id,
        name: typeof v.name === "string" ? v.name : "Material",
        color: typeof v.color === "string" ? v.color : "#8a93a2",
        metalness: clamp01(v.metalness, 0.1),
        roughness: clamp01(v.roughness, 0.65),
        emissive: typeof v.emissive === "string" ? v.emissive : "#000000",
        emissiveIntensity: num(v.emissiveIntensity, 1),
        opacity: clamp01(v.opacity, 1),
        transparent: v.transparent === true,
        wireframe: v.wireframe === true,
        flatShading: v.flatShading === true,
        doubleSide: v.doubleSide === true,
        slots: outSlots,
      };
    });
  out.lights = (Array.isArray(src.lights) ? src.lights : [])
    .filter((l): l is LightData => !!l && typeof l === "object" && typeof (l as { kind?: unknown }).kind === "string")
    .map((l) => {
      const v = l as Partial<LightData> & { id?: string; kind?: string };
      const kind = (LIGHT_SET as ReadonlySet<string>).has(v.kind ?? "") ? (v.kind as LightData["kind"]) : "point";
      const id = typeof v.id === "string" ? v.id : newId();
      return {
        id,
        name: typeof v.name === "string" ? v.name : "Light",
        kind,
        color: typeof v.color === "string" ? v.color : "#ffffff",
        intensity: num(v.intensity, 1),
        position: sanitizeVec(v.position, [0, 2, 0]),
        target: Array.isArray(v.target) ? sanitizeVec(v.target) : null,
        distance: typeof v.distance === "number" ? v.distance : null,
        decay: typeof v.decay === "number" ? v.decay : null,
        angle: typeof v.angle === "number" ? v.angle : null,
        penumbra: typeof v.penumbra === "number" ? v.penumbra : null,
        castShadow: v.castShadow !== false,
        visible: v.visible !== false,
      };
    });
  out.cameras = (Array.isArray(src.cameras) ? src.cameras : [])
    .filter((c): c is CameraData => !!c && typeof c === "object")
    .map((c) => {
      const v = c as Partial<CameraData> & { id?: string };
      const id = typeof v.id === "string" ? v.id : newId();
      return {
        id,
        name: typeof v.name === "string" ? v.name : "Camera",
        fov: num(v.fov, 50),
        near: num(v.near, 0.1),
        far: num(v.far, 1000),
        position: sanitizeVec(v.position, [6, 5, 8]),
        target: sanitizeVec(v.target),
        up: sanitizeVec(v.up, [0, 1, 0]),
        ortho: v.ortho === true,
        orthoZoom: num(v.orthoZoom, 1.6),
      };
    });
  out.activeCameraId = typeof src.activeCameraId === "string" && out.cameras.some((c) => c.id === src.activeCameraId)
    ? src.activeCameraId
    : out.cameras[0]?.id ?? null;
  const env = src.environment && typeof src.environment === "object" ? src.environment : null;
  out.environment = {
    backgroundType: env?.backgroundType === "none" ? "none" : "solid",
    backgroundColor: typeof env?.backgroundColor === "string" ? env.backgroundColor : "#3c3f47",
    hdriAssetId: typeof env?.hdriAssetId === "string" ? env.hdriAssetId : null,
    hdriIntensity: num(env?.hdriIntensity, 1),
    exposure: num(env?.exposure, 1),
    shadowsEnabled: env?.shadowsEnabled === true,
    shadowMapSize: num(env?.shadowMapSize, 1024),
    shadowBias: num(env?.shadowBias, -0.0005),
    shadowRadius: num(env?.shadowRadius, 2),
  };
  const settings = src.settings && typeof src.settings === "object" ? src.settings : null;
  out.settings = {
    gridVisible: settings?.gridVisible !== false,
    gridSize: num(settings?.gridSize, 10),
    gridDivisions: Math.max(1, Math.round(num(settings?.gridDivisions, 10))),
    axesVisible: settings?.axesVisible !== false,
    snapEnabled: settings?.snapEnabled === true,
    snapSize: num(settings?.snapSize, 0.25),
    displayMode: settings?.displayMode === "wireframe" || settings?.displayMode === "material" ? settings.displayMode : "solid",
    gizmoMode: settings?.gizmoMode === "translate" || settings?.gizmoMode === "rotate" || settings?.gizmoMode === "scale" ? settings.gizmoMode : "select",
    gizmoSpace: settings?.gizmoSpace === "local" ? "local" : "world",
  };
  out.settings = { ...out.settings };
  return out;
}

const LIGHT_SET = new Set<string>(["ambient", "directional", "point", "spot"]);

function sanitizeVec(v: unknown, fallback: Vec3 = [0, 0, 0]): Vec3 {
  if (!Array.isArray(v) || v.length < 3) return [...fallback];
  const n = (x: unknown, def: number) => (typeof x === "number" && Number.isFinite(x) ? x : def);
  return [n(v[0], fallback[0]), n(v[1], fallback[1]), n(v[2], fallback[2])];
}

type Vec3 = [number, number, number];

function sanitizeGeometry(v: unknown): GeometryData | null {
  if (!v || typeof v !== "object") return null;
  const g = v as { kind?: unknown; data?: unknown; assetId?: unknown };
  if (g.kind === "imported") {
    return { kind: "imported", assetId: typeof g.assetId === "string" ? g.assetId : "" };
  }
  if (g.kind === "primitive" && g.data && typeof g.data === "object") {
    const p = g.data as Partial<PrimitiveGeometryData> & { kind?: unknown };
    if (typeof p.kind !== "string") return null;
    if (!(PRIMITIVE_KINDS as readonly string[]).includes(p.kind)) return null;
    const out: PrimitiveGeometryData = { kind: p.kind as PrimitiveGeometryData["kind"] };
    for (const key of [
      "width", "height", "depth", "radius", "widthSegments", "heightSegments",
      "radiusTop", "radiusBottom", "radialSegments", "planeWidth", "planeHeight",
      "torusRadius", "tube", "tubularSegments", "capsuleRadius", "capsuleLength", "capSegments",
    ] as const) {
      const val = p[key];
      if (typeof val === "number" && Number.isFinite(val)) out[key] = val;
    }
    return { kind: "primitive", data: out };
  }
  return null;
}

function clamp01(v: unknown, def: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : def;
}

function num(v: unknown, def: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}

/** Camera preset target vectors (mirrors OrbitControls orientation helpers). */
export function presetCameraData(kind: CameraPresetKind, existing: CameraData): CameraData {
  const cam: CameraData = { ...existing, position: [...existing.position], target: [...existing.target], up: [...existing.up] };
  switch (kind) {
    case "perspective":
      cam.position = [6, 5, 8];
      cam.target = [0, 0, 0];
      cam.up = [0, 1, 0];
      break;
    case "front":
      cam.position = [0, 0, 8];
      cam.target = [0, 0, 0];
      cam.up = [0, 1, 0];
      break;
    case "top":
      cam.position = [0, 8, 0];
      cam.target = [0, 0, 0];
      cam.up = [0, 0, -1];
      break;
    case "right":
      cam.position = [8, 0, 0];
      cam.target = [0, 0, 0];
      cam.up = [0, 1, 0];
      break;
  }
  return cam;
}