import { useEditorStore } from "../../state/store";
import { runtime } from "../../editor/core/runtime";
import { pixelStore, EditorDocument } from "../../editor/core/document";
import { is3DDLayer, type Layer } from "../../editor/core/types";
import { createScene3D, createObject3D, createMaterial, createLight, type Scene3D, type Vec3Tuple, type PrimitiveGeometryData } from "../types/types3d";
import { registerImportBytes, ensureImportGeometry } from "../loading/importStore3d";
import { getRenderScene3DToCanvas } from "../render/renderBridge";
import { createScene3DLayer, createObject3DLayer, createGroup3DLayer } from "../../editor/layers/layerFactory";
import { genId } from "../../utils/id";

/** Active document's 3D scenes (from store). */
export function scenesOf(): Scene3D[] {
  return useEditorStore.getState().scenes3D;
}

export function activeScene(): Scene3D | null {
  const s = useEditorStore.getState();
  const activeId = s.activeSceneId;
  return s.scenes3D.find((sc) => sc.id === activeId) ?? s.scenes3D[0] ?? null;
}

export function activeSceneId(): string | null {
  const s = useEditorStore.getState();
  return s.activeSceneId ?? s.scenes3D[0]?.id ?? null;
}

/** Ensure the active document has a scene (creating a default one on demand). */
export function ensureActiveScene(): Scene3D {
  const s = useEditorStore.getState();
  const existing = s.scenes3D.find((sc) => sc.id === s.activeSceneId) ?? s.scenes3D[0];
  if (existing) {
    if (s.activeSceneId !== existing.id) s.setActiveScene3D(existing.id);
    return existing;
  }
  return createScene();
}

export function mutateScene3D(fn: (scene: Scene3D) => void): void {
  const s = useEditorStore.getState();
  const scene = s.scenes3D.find((sc) => sc.id === s.activeSceneId);
  if (!scene) return;
  fn(scene);
  scene.version += 1;
  useEditorStore.setState({ scenes3D: s.scenes3D.slice() });
  reraster3DLayers();
  runtime.canvas?.requestRender();
}

/**
 * Live mutation used by continuous gizmo drags: updates scene data + version so
 * the viewport re-applies, but skips the (expensive) layer rasterization and
 * history push. Call {@link commitSceneGesture} once the gesture ends.
 */
export function mutateScene3DLive(fn: (scene: Scene3D) => void): void {
  const s = useEditorStore.getState();
  const scene = s.scenes3D.find((sc) => sc.id === s.activeSceneId);
  if (!scene) return;
  fn(scene);
  scene.version += 1;
  useEditorStore.setState({ scenes3D: s.scenes3D.slice() });
}

/** Snapshot scenes before a live gesture so it can be committed to history. */
export function beginSceneGesture(): string {
  return snapshotScenes();
}

/** Commit a completed live gesture (one history entry per gesture). */
export function commitSceneGesture(name: string, beforeJson: string, bytes = 2048): void {
  const engine = runtime.engine;
  reraster3DLayers();
  if (!engine) {
    runtime.canvas?.requestRender();
    return;
  }
  const after = snapshotScenes();
  engine.pushHistory({
    name,
    bytes,
    undo: () => restoreScenes(beforeJson),
    redo: () => restoreScenes(after),
  });
  runtime.canvas?.requestRender();
}

function snapshotScenes(): string {
  const s = useEditorStore.getState();
  return JSON.stringify({ scenes: s.scenes3D, active: s.activeSceneId });
}

function restoreScenes(json: string): void {
  let parsed: { scenes: Scene3D[]; active: string | null } | null = null;
  try {
    parsed = JSON.parse(json) as { scenes: Scene3D[]; active: string | null };
  } catch {
    return;
  }
  if (!parsed || !Array.isArray(parsed.scenes)) return;
  const s = useEditorStore.getState();
  useEditorStore.setState({ scenes3D: parsed.scenes, activeSceneId: parsed.active });
  reraster3DLayers();
  runtime.canvas?.requestRender();
  s.setStatus("3D scene restored.");
}

/** Apply + hook a mutation into the document undo/redo stack (real scene-state history). */
export function historyScene3D(name: string, fn: (scene: Scene3D) => void, bytes = 4096): void {
  const engine = runtime.engine;
  if (!engine) return;
  const before = snapshotScenes();
  const scene = useEditorStore.getState().scenes3D.find((sc) => sc.id === useEditorStore.getState().activeSceneId);
  if (!scene) return;
  fn(scene);
  scene.version += 1;
  useEditorStore.setState({ scenes3D: useEditorStore.getState().scenes3D.slice() });
  reraster3DLayers();
  const after = snapshotScenes();
  engine.pushHistory({
    name,
    bytes,
    undo: () => restoreScenes(before),
    redo: () => restoreScenes(after),
  });
  runtime.canvas?.requestRender();
}

/**
 * Rerasterize every 3D layer's composited image from the live scene (real
 * WebGL render into the layer's pixelStore buffer). Non-destructive: layers
 * remain tied to their scene object and update on scene edits.
 */
export function reraster3DLayers(): void {
  const engine = runtime.engine;
  const doc = engine?.doc();
  if (!doc) return;
  if (!useEditorStore.getState().view3d) return;
  const renderScene3DToCanvas = getRenderScene3DToCanvas();
  if (!renderScene3DToCanvas) return;
  const scenes = scenesOf();
  for (const layer of doc.layers) {
    if (!is3DDLayer(layer)) continue;
    const scene = scenes.find((sc) => sc.id === layer.sceneId);
    if (!scene) continue;
    const w = Math.max(1, Math.round(layer.transform.width));
    const h = Math.max(1, Math.round(layer.transform.height));
    let canvas: HTMLCanvasElement | null = null;
    if (layer.type === "3d-scene") {
      canvas = renderScene3DToCanvas(scene, w, h);
    } else if (layer.type === "3d-object" || layer.type === "3d-group") {
      canvas = renderScene3DToCanvas(scene, w, h, { objectId: layer.objectId });
    }
    if (canvas && canvas.width >= 1 && canvas.height >= 1) {
      pixelStore.set(layer.imageId, canvas);
    }
  }
}

/** Create a new scene, make it active, and rasterize into any 3d-scene layers. */
export function createScene(name?: string): Scene3D {
  const s = useEditorStore.getState();
  const id = genId("scene");
  const scene = createScene3D(id, name ?? "Scene");
  const scenes = [...s.scenes3D, scene];
  useEditorStore.setState({ scenes3D: scenes, activeSceneId: id });
  reraster3DLayers();
  return scene;
}

export function removeScene(sceneId: string): void {
  const s = useEditorStore.getState();
  if (!s.scenes3D.some((sc) => sc.id === sceneId)) return;
  const before = snapshotScenes();
  const scenes = s.scenes3D.filter((sc) => sc.id !== sceneId);
  useEditorStore.setState({ scenes3D: scenes, activeSceneId: s.activeSceneId === sceneId ? (scenes[0]?.id ?? null) : s.activeSceneId });
  const after = snapshotScenes();

  const engine = runtime.engine;
  if (!engine) {
    reraster3DLayers();
    return;
  }
  const doc = engine.doc();
  const baseDoc = doc;
  const layersAtRemove = doc ? doc.layers.slice() : [];
  const kept = doc ? doc.layers.filter((l: Layer) => !(is3DDLayer(l) && l.sceneId === sceneId)) : null;
  const applyLayers = (layers: Layer[]): void => {
    if (baseDoc) useEditorStore.setState({ doc: new EditorDocument(baseDoc.width, baseDoc.height, layers) });
  };
  if (kept && kept.length !== doc!.layers.length) {
    applyLayers(kept);
    engine.pushHistory({
      name: "Remove 3D Scene",
      bytes: 1024,
      undo: () => {
        restoreScenes(before);
        applyLayers(layersAtRemove);
      },
      redo: () => {
        restoreScenes(after);
        applyLayers(kept);
      },
    });
  } else {
    engine.pushHistory({
      name: "Remove 3D Scene",
      bytes: 1024,
      undo: () => restoreScenes(before),
      redo: () => restoreScenes(after),
    });
  }
  reraster3DLayers();
  runtime.canvas?.requestRender();
}

export function duplicateScene(sceneId: string): string | null {
  const s = useEditorStore.getState();
  const idx = s.scenes3D.findIndex((sc) => sc.id === sceneId);
  if (idx < 0) return null;
  const src = s.scenes3D[idx]!;
  const copy = JSON.parse(JSON.stringify(src)) as Scene3D;
  const newId = genId("scene");
  copy.id = newId;
  copy.name = `${src.name} Copy`;
  const idMap = new Map<string, string>();
  const remap = (id: string | null): string | null => {
    if (!id) return null;
    const n = idMap.get(id);
    return n ?? id;
  };
  for (const o of copy.objects) idMap.set(o.id, genId("obj"));
  for (const m of copy.materials) idMap.set(m.id, genId("mat"));
  for (const l of copy.lights) idMap.set(l.id, genId("light"));
  for (const c of copy.cameras) idMap.set(c.id, genId("cam"));
  for (const o of copy.objects) {
    o.id = idMap.get(o.id)!;
    o.parentId = remap(o.parentId);
    o.materialId = remap(o.materialId);
  }
  for (const m of copy.materials) m.id = idMap.get(m.id)!;
  for (const l of copy.lights) l.id = idMap.get(l.id)!;
  for (const c of copy.cameras) c.id = idMap.get(c.id)!;
  copy.activeCameraId = remap(copy.activeCameraId);
  const scenes = [...s.scenes3D];
  scenes.splice(idx + 1, 0, copy);
  useEditorStore.setState({ scenes3D: scenes, activeSceneId: newId });
  return newId;
}

// ── object / material / light / camera creation ──

export function addObjectToScene(kind: "cube" | "sphere" | "cylinder" | "cone" | "plane" | "torus" | "capsule"): string | null {
  const scene = activeScene();
  if (!scene) return null;
  const obj = createObject3D(genId("obj"), capitalize(kind), "object");
  obj.geometry = { kind: "primitive", data: primitiveFor(kind) };
  obj.position = [0, 1, 0];
  const hasMaterial = scene.materials.length > 0;
  const mat = hasMaterial ? scene.materials[0]! : createMaterial(genId("mat"), "Material");
  if (!hasMaterial) scene.materials.push(mat);
  obj.materialId = mat.id;
  scene.objects.push(obj);
  commitSceneChange("Add 3D Object", scene);
  return obj.id;
}

export function addGroupToScene(): string | null {
  const scene = activeScene();
  if (!scene) return null;
  const group = createObject3D(genId("obj"), "Group", "group");
  scene.objects.push(group);
  commitSceneChange("Add 3D Group", scene);
  return group.id;
}

export function addLightToScene(kind: "ambient" | "directional" | "point" | "spot"): string | null {
  const scene = activeScene();
  if (!scene) return null;
  const light = createLight(genId("light"), `${capitalize(kind)} Light`, kind);
  scene.lights.push(light);
  commitSceneChange("Add 3D Light", scene);
  return light.id;
}

function commitSceneChange(name: string, scene: Scene3D): void {
  const before = JSON.stringify(scenesOf());
  scene.version += 1;
  useEditorStore.setState({ scenes3D: useEditorStore.getState().scenes3D.slice() });
  reraster3DLayers();
  const after = JSON.stringify(scenesOf());
  runtime.engine?.pushHistory({
    name,
    bytes: 2048,
    undo: () => restoreScenes(JSON.stringify({ scenes: JSON.parse(before) as Scene3D[], active: useEditorStore.getState().activeSceneId })),
    redo: () => restoreScenes(JSON.stringify({ scenes: JSON.parse(after) as Scene3D[], active: useEditorStore.getState().activeSceneId })),
  });
  runtime.canvas?.requestRender();
}

function primitiveFor(kind: "cube" | "sphere" | "cylinder" | "cone" | "plane" | "torus" | "capsule"): PrimitiveGeometryData {
  switch (kind) {
    case "cube":
      return { kind, width: 1, height: 1, depth: 1 };
    case "sphere":
      return { kind, radius: 0.5, widthSegments: 24, heightSegments: 16 };
    case "cylinder":
      return { kind, radiusTop: 0.5, radiusBottom: 0.5, height: 1, radialSegments: 24 };
    case "cone":
      return { kind, radius: 0.5, height: 1, radialSegments: 24 };
    case "plane":
      return { kind, planeWidth: 1, planeHeight: 1 };
    case "torus":
      return { kind, torusRadius: 0.5, tube: 0.25, radialSegments: 16, tubularSegments: 32 };
    case "capsule":
      return { kind, capsuleRadius: 0.4, capsuleLength: 0.6, capSegments: 8, radialSegments: 16 };
  }
}

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}

// ── render-to-layer ──

/** Renders the active scene into a new raster image layer (non-destructive). */
export function renderSceneToRasterLayer(): boolean {
  const scene = activeScene();
  const engine = runtime.engine;
  if (!scene || !engine) return false;
  const doc = engine.doc();
  const w = doc?.width ?? 800;
  const h = doc?.height ?? 600;
  const renderScene3DToCanvas = getRenderScene3DToCanvas();
  if (!renderScene3DToCanvas) return false;
  const canvas = renderScene3DToCanvas(scene, w, h);
  if (!canvas) return false;
  engine.importImageCanvas(canvas, "3D Render");
  return true;
}

// ── add 3D layers to the document ──

export function addScene3DLayerToDoc(): boolean {
  const scene = activeScene();
  const engine = runtime.engine;
  const doc = engine?.doc();
  if (!scene || !engine || !doc) return false;
  const layer = createScene3DLayer(scene.id, {
    name: `${scene.name} (3D)`,
    width: doc.width,
    height: doc.height,
  });
  engine.addLayer(layer, "3D Scene Layer");
  useEditorStore.getState().setStatus("3D scene layer added (renders on edit).");
  reraster3DLayers();
  return true;
}

export function addObject3DLayerToDoc(objectId?: string): boolean {
  const scene = activeScene();
  const engine = runtime.engine;
  const doc = engine?.doc();
  const object = scene?.objects.find((o) => o.id === objectId);
  if (!scene || !engine || !doc || !object) return false;
  const layer = object.kind === "group"
    ? createGroup3DLayer(scene.id, object.id, { name: `${object.name} (3D)`, width: doc.width, height: doc.height })
    : createObject3DLayer(scene.id, object.id, { name: `${object.name} (3D)`, width: doc.width, height: doc.height });
  engine.addLayer(layer, "3D Object Layer");
  reraster3DLayers();
  return true;
}

// ── import model into the active scene ──

export async function importModelToScene(file: File): Promise<string | null> {
  const scene = activeScene();
  if (!scene) return null;
  const lower = file.name.toLowerCase();
  const kind = lower.endsWith(".glb") ? "glb" : lower.endsWith(".gltf") ? "gltf" : lower.endsWith(".obj") ? "obj" : lower.endsWith(".stl") ? "stl" : null;
  if (!kind) return null;
  const bytes = await file.arrayBuffer();
  const assetId = genId("model");
  registerImportBytes(assetId, file.name.replace(/\.[^.]+$/, ""), kind, bytes);
  const geo = await ensureImportGeometry(assetId);
  if (!geo) return null;
  const obj = createObject3D(genId("obj"), file.name.replace(/\.[^.]+$/, ""), "object");
  obj.geometry = { kind: "imported", assetId };
  // Normalize scale so imports fit a 2-unit box like primitives.
  const size = normalizedSize(geo);
  if (size > 0) {
    const s = 2 / size;
    obj.scale = [s, s, s];
  }
  obj.position = [0, 1, 0];
  scene.objects.push(obj);
  commitSceneChange(`Import ${file.name}`, scene);
  useEditorStore.getState().setStatus(`Imported "${file.name}" into the 3D scene.`);
  return obj.id;
}

function normalizedSize(geo: { boundingBox?: { min: { x: number; y: number; z: number }; max: { x: number; y: number; z: number } } | null }): number {
  const bb = geo.boundingBox;
  if (!bb) return 0;
  const d = Math.max(bb.max.x - bb.min.x, bb.max.y - bb.min.y, bb.max.z - bb.min.z);
  return Number.isFinite(d) && d > 0 ? d : 0;
}

/** Change an object's serializable transform (gizmo commit path). */
export function setObjectTransform3D(
  id: string,
  patch: { position?: Vec3Tuple; rotation?: Vec3Tuple; scale?: Vec3Tuple }
): void {
  mutateScene3D((scene) => {
    const o = scene.objects.find((x) => x.id === id);
    if (!o) return;
    if (patch.position) o.position = [...patch.position];
    if (patch.rotation) o.rotation = [...patch.rotation];
    if (patch.scale) o.scale = [...patch.scale];
  });
}