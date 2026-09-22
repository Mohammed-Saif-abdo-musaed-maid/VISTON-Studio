import {
  Scene,
  Object3D,
  Mesh,
  AmbientLight,
  DirectionalLight,
  PointLight,
  SpotLight,
  PerspectiveCamera,
  OrthographicCamera,
  Vector3,
  Vector2,
  Box3,
  Raycaster,
  WebGLRenderer,
  GridHelper,
  AxesHelper,
  MeshStandardMaterial,
  BufferGeometry,
  RingGeometry,
  Color,
} from "three";
import type { Scene3D, Object3DData, LightData } from "../types/types3d";
import { materialById } from "./sceneModel3d";
import { buildObject3D, applyMaterialData } from "./geometry3d";
import { applySceneEnvironment } from "../render/renderer3d";
import { TextureManager3d, type ResourceCanvasResolver } from "../textures/textureManager3d";
import { listImportEntries } from "../loading/importStore3d";

const ACCENT = new Color("#4f8cff");

/**
 * Runtime scene that mirrors a serializable Scene3D into a real Three.js scene
 * graph. Owns textures/shared materials/caches needed for GPU work and is the
 * single place where serializable data becomes live 3D.
 */
export class SceneRuntime {
  readonly threeScene = new Scene();
  readonly objects = new Map<string, Object3D>();
  readonly lights = new Map<string, AmbientLight | DirectionalLight | PointLight | SpotLight>();
  readonly textures: TextureManager3d;
  readonly raycaster = new Raycaster();
  imported = new Map<string, BufferGeometry>();

  private data: Scene3D | null = null;
  private sharedMaterials = new Map<string, MeshStandardMaterial>();
  private grid: GridHelper | null = null;
  private axes: AxesHelper | null = null;
  private originRing: Mesh | null = null;
  private originalMaterial = new WeakMap<Object3D, MeshStandardMaterial>();

  constructor(resolveCanvas: ResourceCanvasResolver) {
    this.textures = new TextureManager3d(resolveCanvas);
    this.raycaster.far = 2000;
  }

  get sceneData(): Scene3D | null {
    return this.data;
  }

  dispose(): void {
    this.textures.dispose();
    for (const m of this.sharedMaterials.values()) m.dispose();
    this.sharedMaterials.clear();
    for (const g of this.imported.values()) g.dispose();
    this.imported.clear();
    this.threeScene.clear();
    this.objects.clear();
    this.lights.clear();
  }

  applyData(data: Scene3D): void {
    this.data = data;
    // Surface geometries already parsed into the import store (from project
    // load pre-warm or importModelToScene) so imported objects rebuild fully.
    for (const entry of listImportEntries()) {
      if (entry.geometry) this.imported.set(entry.assetId, entry.geometry);
    }
    for (const o of this.objects.values()) this.threeScene.remove(o);
    this.objects.clear();
    for (const l of this.lights.values()) this.threeScene.remove(l);
    this.lights.clear();
    applySceneEnvironment(this.threeScene, data);

    const nodes = new Map<string, Object3D>();
    for (const obj of data.objects) {
      const built = buildObject3D(obj, data, this.sharedMaterials, this.imported);
      if (!built) continue;
      this.applyNodeState(built, obj, data);
      nodes.set(obj.id, built);
      this.objects.set(obj.id, built);
    }
    for (const obj of data.objects) {
      const node = nodes.get(obj.id);
      if (!node) continue;
      if (obj.parentId && nodes.has(obj.parentId)) nodes.get(obj.parentId)!.add(node);
      else this.threeScene.add(node);
    }

    for (const light of data.lights) {
      const built = buildLight(light);
      this.lights.set(light.id, built);
      this.threeScene.add(built);
      built.position.fromArray(light.position);
      if (light.kind === "directional" && built instanceof DirectionalLight) {
        built.target.position.set(light.target?.[0] ?? 0, light.target?.[1] ?? 0, light.target?.[2] ?? 0);
        this.threeScene.add(built.target);
      }
    }

    this.buildOverlays(data);
  }

  private applyNodeState(node: Object3D, obj: Object3DData, data: Scene3D): void {
    node.position.fromArray(obj.position);
    node.rotation.set(toRad(obj.rotation[0]), toRad(obj.rotation[1]), toRad(obj.rotation[2]));
    node.scale.fromArray(obj.scale);
    node.visible = obj.visible;
    if (!(node instanceof Mesh)) return;
    node.castShadow = obj.castShadow;
    node.receiveShadow = obj.receiveShadow;
    if (!(node.material instanceof MeshStandardMaterial)) return;
    const matObj = obj.materialId ? materialById(data, obj.materialId) : null;
    if (matObj) {
      applyMaterialData(node.material, matObj);
      const mats = this.textures.textureFor(matObj.id, matObj.slots);
      assignTextures(node.material, mats);
    }
    node.material.wireframe = data.settings.displayMode === "wireframe";
    if (node.material.wireframe) node.material.needsUpdate = true;
  }

  private buildOverlays(data: Scene3D): void {
    if (this.grid) this.threeScene.remove(this.grid);
    if (this.axes) this.threeScene.remove(this.axes);
    if (this.originRing) this.threeScene.remove(this.originRing);
    this.grid = null;
    this.axes = null;
    this.originRing = null;

    if (data.settings.gridVisible) {
      this.grid = new GridHelper(data.settings.gridSize, data.settings.gridDivisions, new Color("#4a5568"), new Color("#2a2f38"));
      this.grid.position.y = -0.0005;
      this.threeScene.add(this.grid);
    }
    if (data.settings.axesVisible) {
      this.axes = new AxesHelper(2);
      this.threeScene.add(this.axes);
    }
    const ring = new Mesh(new RingGeometry(0.5, 0.56, 48), new MeshStandardMaterial({ color: new Color("#1c2026"), emissive: new Color("#1c2026") }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = -0.0004;
    ring.renderOrder = -1;
    this.threeScene.add(ring);
    this.originRing = ring;
  }

  select(ids: string[]): void {
    for (const node of this.objects.values()) this.unHighlight(node);
    this.originalMaterial = new WeakMap();
    for (const id of ids) {
      const node = this.objects.get(id);
      if (node) this.highlight(node);
    }
  }

  private highlight(node: Object3D): void {
    if (node instanceof Mesh && node.material instanceof MeshStandardMaterial) {
      if (this.originalMaterial.has(node)) return;
      this.originalMaterial.set(node, node.material);
      const hl = node.material.clone();
      hl.color = node.material.color.clone().lerp(ACCENT, 0.35);
      hl.emissive = node.material.emissive ? node.material.emissive.clone() : new Color("#000000");
      hl.emissiveIntensity = 0.45;
      node.material = hl;
    }
    for (const child of node.children) this.highlight(child);
  }

  private unHighlight(node: Object3D): void {
    if (node instanceof Mesh) {
      const orig = this.originalMaterial.get(node);
      if (orig) node.material = orig;
    }
    for (const child of node.children) this.unHighlight(child);
  }

  render(renderer: WebGLRenderer, camera: PerspectiveCamera | OrthographicCamera, w: number, h: number): void {
    renderer.setSize(w, h, false);
    renderer.render(this.threeScene, camera);
  }

  getBoundingBox(ids: string[], includeHidden = false): Box3 | null {
    const box = new Box3();
    let any = false;
    const expand = (node: Object3D): void => {
      if (includeHidden || node.visible) {
        box.expandByObject(node);
        any = true;
      }
    };
    if (ids.length > 0) {
      for (const id of ids) {
        const node = this.objects.get(id);
        if (node) expand(node);
      }
    } else {
      for (const node of this.objects.values()) expand(node);
    }
    return any ? box : null;
  }

  pick(nx: number, ny: number, camera: PerspectiveCamera | OrthographicCamera): string | null {
    this.raycaster.setFromCamera(new Vector2(nx, ny), camera);
    const hits = this.raycaster.intersectObjects(Array.from(this.objects.values()), true);
    for (const hit of hits) {
      if (hit.object instanceof Mesh) {
        let cur: Object3D | null = hit.object;
        while (cur) {
          for (const [id, node] of this.objects) {
            if (node === cur) return id;
          }
          cur = cur.parent;
        }
      }
    }
    return null;
  }

  snap(v: Vector3, size: number): Vector3 {
    if (!size || size <= 0) return v;
    const one = (x: number) => Math.round(x / size) * size;
    return new Vector3(one(v.x), one(v.y), one(v.z));
  }
}

type TextureBucket = ReturnType<TextureManager3d["textureFor"]>;

function assignTextures(material: MeshStandardMaterial, mats: TextureBucket): void {
  material.map = mats.map;
  material.normalMap = mats.normalMap;
  material.roughnessMap = mats.roughnessMap;
  material.metalnessMap = mats.metalnessMap;
  material.emissiveMap = mats.emissiveMap;
  material.aoMap = mats.aoMap;
  material.needsUpdate = true;
}

function buildLight(light: LightData): AmbientLight | DirectionalLight | PointLight | SpotLight {
  const color = new Color(light.color || "#ffffff");
  const intensity = light.intensity ?? 1;
  let out: AmbientLight | DirectionalLight | PointLight | SpotLight;
  switch (light.kind) {
    case "ambient":
      out = new AmbientLight(color, intensity);
      break;
    case "directional":
      out = new DirectionalLight(color, intensity);
      break;
    case "spot":
      out = new SpotLight(color, intensity, light.distance ?? undefined, light.angle ?? undefined, light.penumbra ?? undefined, light.decay ?? 2);
      break;
    default:
      out = new PointLight(color, intensity, light.distance ?? undefined, light.decay ?? 2);
      break;
  }
  out.visible = light.visible !== false;
  out.castShadow = light.castShadow !== false;
  if (out.castShadow) {
    (out as DirectionalLight).shadow?.camera?.updateProjectionMatrix?.();
  }
  return out;
}

function toRad(d: number): number {
  return (d * Math.PI) / 180;
}