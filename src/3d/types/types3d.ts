export type Vec3Tuple = [number, number, number];

export type PrimitiveKind =
  | "cube"
  | "sphere"
  | "cylinder"
  | "cone"
  | "plane"
  | "torus"
  | "capsule";

export const PRIMITIVE_KINDS: readonly PrimitiveKind[] = [
  "cube",
  "sphere",
  "cylinder",
  "cone",
  "plane",
  "torus",
  "capsule",
];

/** Parameterful primitive descriptor — kept small and fully serializable. */
export interface PrimitiveGeometryData {
  kind: PrimitiveKind;
  width?: number;
  height?: number;
  depth?: number;
  radius?: number;
  widthSegments?: number;
  heightSegments?: number;
  radiusTop?: number;
  radiusBottom?: number;
  radialSegments?: number;
  planeWidth?: number;
  planeHeight?: number;
  torusRadius?: number;
  tube?: number;
  tubularSegments?: number;
  capsuleRadius?: number;
  capsuleLength?: number;
  capSegments?: number;
}

export type GeometryData =
  | { kind: "primitive"; data: PrimitiveGeometryData }
  | { kind: "imported"; assetId: string };

const IMAGE_TEXTURE_SOURCE = "image-resource";
const EXTERNAL_TEXTURE_SOURCE = "external-url";

export type TextureSlotName = "map" | "normalMap" | "roughnessMap" | "metalnessMap" | "emissiveMap" | "aoMap";
export const TEXTURE_SLOT_NAMES: readonly TextureSlotName[] = [
  "map",
  "normalMap",
  "roughnessMap",
  "metalnessMap",
  "emissiveMap",
  "aoMap",
];

export interface TextureSlotData {
  /** Resource key in the project `resources` map ("texture:<id>") or an external URL. */
  assetId: string | null;
  sourceKind: typeof IMAGE_TEXTURE_SOURCE | typeof EXTERNAL_TEXTURE_SOURCE | "none";
}

export function emptyTextureSlot(): TextureSlotData {
  return { assetId: null, sourceKind: "none" };
}

export interface MaterialData {
  id: string;
  name: string;
  color: string;
  metalness: number;
  roughness: number;
  emissive: string;
  emissiveIntensity: number;
  opacity: number;
  transparent: boolean;
  wireframe: boolean;
  flatShading: boolean;
  doubleSide: boolean;
  slots: Partial<Record<TextureSlotName, TextureSlotData>>;
}

export type Object3DKind = "object" | "group";

export interface Object3DData {
  id: string;
  name: string;
  kind: Object3DKind;
  visible: boolean;
  locked: boolean;
  parentId: string | null;
  geometry: GeometryData | null;
  materialId: string | null;
  position: Vec3Tuple;
  rotation: Vec3Tuple;
  scale: Vec3Tuple;
  castShadow: boolean;
  receiveShadow: boolean;
}

export type LightKind = "ambient" | "directional" | "point" | "spot";
export const LIGHT_KINDS: readonly LightKind[] = ["ambient", "directional", "point", "spot"];

export interface LightData {
  id: string;
  name: string;
  kind: LightKind;
  color: string;
  intensity: number;
  position: Vec3Tuple;
  target: Vec3Tuple | null;
  distance: number | null;
  decay: number | null;
  angle: number | null;
  penumbra: number | null;
  castShadow: boolean;
  visible: boolean;
}

export type CameraPresetKind = "perspective" | "front" | "top" | "right";

export interface CameraData {
  id: string;
  name: string;
  fov: number;
  near: number;
  far: number;
  position: Vec3Tuple;
  target: Vec3Tuple;
  up: Vec3Tuple;
  ortho: boolean;
  orthoZoom: number;
}

export interface EnvironmentData {
  backgroundType: "solid" | "none";
  backgroundColor: string;
  hdriAssetId: string | null;
  hdriIntensity: number;
  exposure: number;
  shadowsEnabled: boolean;
  shadowMapSize: number;
  shadowBias: number;
  shadowRadius: number;
}

export interface Scene3DSettings {
  gridVisible: boolean;
  gridSize: number;
  gridDivisions: number;
  axesVisible: boolean;
  snapEnabled: boolean;
  snapSize: number;
  displayMode: "solid" | "wireframe" | "material";
  gizmoMode: "translate" | "rotate" | "scale" | "select";
  gizmoSpace: "world" | "local";
}

export interface Scene3D {
  id: string;
  name: string;
  version: number;
  objects: Object3DData[];
  materials: MaterialData[];
  lights: LightData[];
  cameras: CameraData[];
  activeCameraId: string | null;
  environment: EnvironmentData;
  settings: Scene3DSettings;
}

export const DEFAULT_MATERIAL_COLOR = "#8a93a2";
export const DEFAULT_ENV_BG = "#3c3f47";

export function createMaterial(id: string, name?: string): MaterialData {
  return {
    id,
    name: name ?? "Material",
    color: DEFAULT_MATERIAL_COLOR,
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

export function createObject3D(id: string, name: string, kind: Object3DKind = "object"): Object3DData {
  return {
    id,
    name,
    kind,
    visible: true,
    locked: false,
    parentId: null,
    geometry: null,
    materialId: null,
    position: [0, 0, 0],
    rotation: [0, 0, 0],
    scale: [1, 1, 1],
    castShadow: true,
    receiveShadow: true,
  };
}

export function createLight(id: string, name: string, kind: LightKind): LightData {
  return {
    id,
    name,
    kind,
    color: kind === "ambient" ? "#ffffff" : "#ffffff",
    intensity: kind === "ambient" ? 0.6 : 1,
    position: kind === "directional" ? [4, 6, 4] : [0, 4, 0],
    target: null,
    distance: kind === "point" || kind === "spot" ? null : null,
    decay: kind === "point" || kind === "spot" ? 2 : null,
    angle: kind === "spot" ? 0.6 : null,
    penumbra: kind === "spot" ? 0.3 : null,
    castShadow: kind !== "ambient",
    visible: true,
  };
}

export function createCamera(id: string, name: string): CameraData {
  return {
    id,
    name,
    fov: 50,
    near: 0.1,
    far: 1000,
    position: [6, 5, 8],
    target: [0, 0, 0],
    up: [0, 1, 0],
    ortho: false,
    orthoZoom: 1.6,
  };
}

export function defaultEnvironment(): EnvironmentData {
  return {
    backgroundType: "solid",
    backgroundColor: DEFAULT_ENV_BG,
    hdriAssetId: null,
    hdriIntensity: 1,
    exposure: 1,
    shadowsEnabled: false,
    shadowMapSize: 1024,
    shadowBias: -0.0005,
    shadowRadius: 2,
  };
}

export function defaultSettings(): Scene3DSettings {
  return {
    gridVisible: true,
    gridSize: 10,
    gridDivisions: 10,
    axesVisible: true,
    snapEnabled: false,
    snapSize: 0.25,
    displayMode: "solid",
    gizmoMode: "select",
    gizmoSpace: "world",
  };
}

export function createScene3D(id: string, name = "Scene"): Scene3D {
  const material = createMaterial(id, "Material");
  const cube = createObject3D(genId3(), "Cube", "object");
  cube.geometry = { kind: "primitive", data: { kind: "cube", width: 1, height: 1, depth: 1 } };
  cube.materialId = material.id;
  cube.position = [0, 0.5, 0];
  const keyLight = createLight(genId3(), "Key Light", "directional");
  const fillLight = createLight(genId3(), "Fill Light", "directional");
  fillLight.position = [-4, 2, -2];
  fillLight.intensity = 0.4;
  const camera = createCamera(genId3(), "Camera");
  return {
    id,
    name,
    version: 1,
    objects: [cube],
    materials: [material],
    lights: [keyLight, fillLight],
    cameras: [camera],
    activeCameraId: camera.id,
    environment: defaultEnvironment(),
    settings: defaultSettings(),
  };
}

let seq = 0;
function genId3(): string {
  seq += 1;
  return `id3-${Date.now().toString(36)}-${seq.toString(36)}`;
}

export function isScene3DValue(v: unknown): v is Scene3D {
  return !!v && typeof v === "object" && typeof (v as Scene3D).id === "string" && Array.isArray((v as Scene3D).objects)
    && Array.isArray((v as Scene3D).materials) && Array.isArray((v as Scene3D).cameras);
}