import { WebGLRenderer, PerspectiveCamera, OrthographicCamera, Scene, Color } from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { Scene3D } from "../types/types3d";
import { cameraById } from "../core/sceneModel3d";
import type { CameraData } from "../types/types3d";

/**
 * Real WebGL renderer factory with honest fallback semantics.
 * WebGPU is BROWSER-DEPENDENT / FUTURE in this build — WebGL is the actual renderer.
 */
export function webglAvailable(canvas: HTMLCanvasElement): boolean {
  try {
    const gl = canvas.getContext("webgl2") ?? canvas.getContext("webgl");
    return !!gl;
  } catch {
    return false;
  }
}

export function createRenderer3D(canvas: HTMLCanvasElement, opts: { alpha?: boolean; antialias?: boolean; preserveDrawingBuffer?: boolean } = {}): WebGLRenderer {
  const renderer = new WebGLRenderer({
    canvas,
    alpha: opts.alpha ?? false,
    antialias: opts.antialias ?? true,
    preserveDrawingBuffer: opts.preserveDrawingBuffer ?? false,
    powerPreference: "high-performance",
  });
  renderer.outputColorSpace = "srgb";
  renderer.toneMappingExposure = 1;
  return renderer;
}

export interface ViewportCamera {
  camera: PerspectiveCamera | OrthographicCamera;
  ortho: boolean;
  target: { x: number; y: number; z: number };
}

/** Build the runtime camera for a scene + optional saved camera data. */
export function makeCamera(
  scene: Scene3D,
  canvasW: number,
  canvasH: number
): { camera: PerspectiveCamera | OrthographicCamera; ortho: boolean } {
  const data = scene.activeCameraId ? cameraById(scene, scene.activeCameraId) : scene.cameras[0];
  const camData: CameraData = data ?? {
    id: "cam",
    name: "Camera",
    fov: 50,
    near: 0.1,
    far: 1000,
    position: [6, 5, 8],
    target: [0, 0, 0],
    up: [0, 1, 0],
    ortho: false,
    orthoZoom: 1.6,
  };
  const aspect = canvasW > 0 && canvasH > 0 ? canvasW / canvasH : 1;
  if (camData.ortho) {
    const c = new OrthographicCamera(-aspect, aspect, 1, -1, camData.near, camData.far);
    c.zoom = camData.orthoZoom;
    c.position.fromArray(camData.position);
    c.up.fromArray(camData.up);
    c.lookAt(camData.target[0], camData.target[1], camData.target[2]);
    c.updateProjectionMatrix();
    return { camera: c, ortho: true };
  }
  const c = new PerspectiveCamera(camData.fov, aspect, camData.near, camData.far);
  c.position.fromArray(camData.position);
  c.up.fromArray(camData.up);
  c.lookAt(camData.target[0], camData.target[1], camData.target[2]);
  c.updateProjectionMatrix();
  return { camera: c, ortho: false };
}

export function setCameraPerspective(camera: PerspectiveCamera | OrthographicCamera, aspect: number): void {
  if (camera instanceof OrthographicCamera) {
    camera.left = -aspect;
    camera.right = aspect;
    camera.top = 1;
    camera.bottom = -1;
  } else {
    camera.aspect = aspect;
  }
  camera.updateProjectionMatrix();
}

export function createOrbitControls(camera: PerspectiveCamera | OrthographicCamera, element: HTMLElement): OrbitControls {
  const controls = new OrbitControls(camera, element);
  controls.enableDamping = true;
  controls.dampingFactor = 0.12;
  controls.screenSpacePanning = true;
  return controls;
}

export function applySceneEnvironment(threeScene: Scene, scene: Scene3D): void {
  const env = scene.environment;
  if (env.backgroundType === "none") {
    threeScene.background = null;
  } else {
    try {
      threeScene.background = new Color(env.backgroundColor || "#3c3f47");
    } catch {
      threeScene.background = new Color("#3c3f47");
    }
  }
  void env;
}

export function updateRendererSettings(renderer: WebGLRenderer, scene: Scene3D): void {
  const env = scene.environment;
  renderer.toneMappingExposure = env.exposure ?? 1;
  try {
    renderer.shadowMap.enabled = env.shadowsEnabled ?? false;
  } catch {
    /* shadow map may be unavailable in exotic contexts */
  }
  void env;
}