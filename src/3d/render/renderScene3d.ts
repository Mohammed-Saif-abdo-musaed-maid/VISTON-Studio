import { WebGLRenderer, PerspectiveCamera, OrthographicCamera, Scene, Mesh, Object3D, Box3, Vector3, Color, AmbientLight, DirectionalLight } from "three";
import { SceneRuntime } from "../core/SceneRuntime";
import type { Scene3D, Object3DData } from "../types/types3d";
import { buildObject3D } from "../core/geometry3d";
import { resolveResourceCanvas } from "../textures/resourceResolver";
import { createCanvas, getContext2d } from "../../utils/canvas";
import { registerRenderScene3DToCanvas } from "./renderBridge";

/**
 * Offscreen rasterization path: renders a Scene3D (or a single object) into a
 * fresh offscreen canvas via a real WebGL render. Used by render-to-layer,
 * per-object layer images, and 3D PNG export. Returns null when WebGL is
 * unavailable — callers surface the honest "3D rendering unavailable" message.
 */

let offscreenRenderer: WebGLRenderer | null = null;

function getOffscreenRenderer(): WebGLRenderer | null {
  if (offscreenRenderer) return offscreenRenderer;
  try {
    const canvas = document.createElement("canvas");
    const gl = (canvas.getContext("webgl2") ?? canvas.getContext("webgl")) as WebGL2RenderingContext | WebGLRenderingContext | null;
    if (!gl) return null;
    offscreenRenderer = new WebGLRenderer({ canvas, context: gl, alpha: true, antialias: true, preserveDrawingBuffer: true });
    offscreenRenderer.outputColorSpace = "srgb";
    return offscreenRenderer;
  } catch {
    return null;
  }
}

export function renderScene3DToCanvas(scene: Scene3D, width: number, height: number, opts: { objectId?: string | null } = {}): HTMLCanvasElement | null {
  const renderer = getOffscreenRenderer();
  if (!renderer) return null;
  const w = Math.max(1, Math.min(4096, Math.round(width)));
  const h = Math.max(1, Math.min(4096, Math.round(height)));

  const runtime = new SceneRuntime(resolveResourceCanvas);
  try {
    runtime.applyData(scene);
    if (opts.objectId) {
      const node = runtime.objects.get(opts.objectId);
      if (!node) return null;
      return renderSingle(renderer, node, w, h);
    }
    const box = ensureBox(runtime.getBoundingBox([], true));
    const camera = frameCamera(box, w, h);
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(1);
    renderer.render(runtime.threeScene, camera.camera);
    return snapshot(renderer, w, h);
  } finally {
    runtime.dispose();
  }
}

function renderSingle(renderer: WebGLRenderer, node: Object3D, w: number, h: number): HTMLCanvasElement | null {
  if (!node) return null;
  const temp = new Scene();
  temp.background = new Color("#000000"); // transparent via alpha clear below
  const ambient = new AmbientLight(new Color("#ffffff"), 0.5);
  const key = new DirectionalLight(new Color("#ffffff"), 1.2);
  key.position.set(4, 6, 4);
  const fill = new DirectionalLight(new Color("#cfe0ff"), 0.4);
  fill.position.set(-4, 2, -3);
  temp.add(ambient, key, fill, node);
  const box = new Box3().setFromObject(node);
  if (!box.isEmpty()) {
    box.expandByScalar(0.5);
  } else {
    box.set(new Vector3(-0.5, 0, -0.5), new Vector3(0.5, 1, 0.5));
  }
  const camera = frameCamera(box, w, h);
  renderer.setSize(w, h, false);
  renderer.setPixelRatio(1);
  try {
    renderer.setClearColor(new Color("#000000"), 0);
  } catch {
    /* ignore */
  }
  renderer.render(temp, camera.camera);
  return snapshot(renderer, w, h);
}

function frameCamera(box: Box3, w: number, h: number): { camera: PerspectiveCamera | OrthographicCamera } {
  const center = new Vector3();
  box.getCenter(center);
  const size = new Vector3();
  box.getSize(size);
  const maxDim = Math.max(size.x, size.y, size.z, 0.5);
  const dist = (maxDim * 1.9) / Math.tan((50 * Math.PI) / 360);
  const camera = new PerspectiveCamera(50, w / h, 0.01, dist * 40 + 1000);
  camera.position.set(center.x + maxDim * 0.9, center.y + maxDim * 0.8, center.z + maxDim * 1.1);
  camera.lookAt(center);
  camera.updateProjectionMatrix();
  return { camera };
}

function snapshot(renderer: WebGLRenderer, w: number, h: number): HTMLCanvasElement {
  const out = createCanvas(w, h);
  const ctx = getContext2d(out);
  ctx.clearRect(0, 0, w, h);
  try {
    ctx.drawImage(renderer.domElement, 0, 0, w, h);
  } catch {
    /* context lost — return blank canvas */
  }
  return out;
}

function ensureBox(b: Box3 | null): Box3 {
  return b && !b.isEmpty() ? b : new Box3(new Vector3(-0.5, 0, -0.5), new Vector3(0.5, 1, 0.5));
}

/** Build a standalone mesh from serializable object data (single-object renders). */
export function buildSingleObjectMesh(object: Object3DData, scene: Scene3D): Mesh | null {
  const shared = new Map<string, import("three").MeshStandardMaterial>();
  const built = buildObject3D(object, scene, shared, new Map());
  return built instanceof Mesh ? built : null;
}

// Register with the bridge so the 3D data store can rasterize without a static
// import of this module (which would pull three.js into the initial bundle).
registerRenderScene3DToCanvas(renderScene3DToCanvas);