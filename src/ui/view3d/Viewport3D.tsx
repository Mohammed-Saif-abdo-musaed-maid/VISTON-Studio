import { useEffect, useRef, useState, type DragEvent } from "react";
import {
  Vector3,
  Box3,
  MOUSE,
  PerspectiveCamera,
  OrthographicCamera,
  type Object3D,
} from "three";
import { TransformControls } from "three/examples/jsm/controls/TransformControls.js";
import { useEditorStore } from "../../state/store";
import { t } from "../../i18n";
import {
  webglAvailable,
  createRenderer3D,
  makeCamera,
  setCameraPerspective,
  createOrbitControls,
  updateRendererSettings,
} from "../../3d/render/renderer3d";
import { SceneRuntime } from "../../3d/core/SceneRuntime";
import { resolveResourceCanvas } from "../../3d/textures/resourceResolver";
import { renderScene3DToCanvas } from "../../3d/render/renderScene3d";
import {
  ensureActiveScene,
  beginSceneGesture,
  commitSceneGesture,
  mutateScene3DLive,
  mutateScene3D,
  renderSceneToRasterLayer,
  addScene3DLayerToDoc,
  importModelToScene,
  reraster3DLayers,
} from "../../3d/core/sceneDataStore";
import { presetCameraData } from "../../3d/core/sceneModel3d";
import type { CameraPresetKind, Scene3D } from "../../3d/types/types3d";
import { setViewport3dController, viewport3d, type Viewport3DController } from "./viewport3dController";

function downloadCanvas(canvas: HTMLCanvasElement, name: string): void {
  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    const st = useEditorStore.getState();
    a.href = url;
    a.download = `${st.savedName ?? st.projectName ?? "Untitled"}-${name}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }, "image/png");
}

interface ViewportRuntime {
  renderer: ReturnType<typeof createRenderer3D>;
  runtime: SceneRuntime;
  orbit: ReturnType<typeof createOrbitControls>;
  transform: TransformControls;
  camera: PerspectiveCamera | OrthographicCamera;
  dispose(): void;
}

export function Viewport3D() {
  const hostRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const scenes = useEditorStore((s) => s.scenes3D);
  const activeId = useEditorStore((s) => s.activeSceneId);
  const selected3D = useEditorStore((s) => s.selected3DIds);
  const scene = scenes.find((sc) => sc.id === activeId) ?? scenes[0] ?? null;
  const sceneVersion = scene?.version ?? 0;
  const gizmoMode = scene?.settings.gizmoMode ?? "select";
  const gizmoSpace = scene?.settings.gizmoSpace ?? "world";

  const [webglOk, setWebglOk] = useState(true);
  const [mode, setMode] = useState<"orbit" | "pan">("orbit");
  const [contextLost, setContextLost] = useState(false);
  const [glEpoch, setGlEpoch] = useState(0);

  const rt = useRef<ViewportRuntime | null>(null);
  const gestureBefore = useRef<string | null>(null);

  // ── create the WebGL viewport once ──
  useEffect(() => {
    const host = hostRef.current;
    const canvas = canvasRef.current;
    if (!host || !canvas) return;
    if (!webglAvailable(canvas)) {
      setWebglOk(false);
      return;
    }
    const initial = ensureActiveScene();
    const renderer = createRenderer3D(canvas, { antialias: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    const { camera } = makeCamera(initial, host.clientWidth || 640, host.clientHeight || 480);
    const runtime = new SceneRuntime(resolveResourceCanvas);
    const orbit = createOrbitControls(camera, canvas);
    const transform = new TransformControls(camera, canvas);
    const helper = transform.getHelper();
    runtime.threeScene.add(helper);
    helper.visible = false;

    const onDragChanged = (event: { value: boolean }) => {
      orbit.enabled = !event.value;
      if (event.value) {
        gestureBefore.current = beginSceneGesture();
      } else if (gestureBefore.current) {
        commitSceneGesture("Transform 3D Object", gestureBefore.current);
        gestureBefore.current = null;
      }
    };
    const onObjectChange = () => {
      const target = transform.object;
      if (!target) return;
      const id = target.userData.vs3dId as string | undefined;
      if (!id) return;
      mutateScene3DLive((sc) => {
        const o = sc.objects.find((x) => x.id === id);
        if (!o) return;
        o.position = [target.position.x, target.position.y, target.position.z];
        o.rotation = [
          (target.rotation.x * 180) / Math.PI,
          (target.rotation.y * 180) / Math.PI,
          (target.rotation.z * 180) / Math.PI,
        ];
        o.scale = [target.scale.x, target.scale.y, target.scale.z];
      });
    };
    transform.addEventListener("dragging-changed", onDragChanged as never);
    transform.addEventListener("objectChange", onObjectChange);

    runtime.applyData(initial);

    let raf = 0;
    let alive = true;
    const loop = () => {
      if (!alive) return;
      raf = requestAnimationFrame(loop);
      orbit.update();
      try {
        renderer.render(runtime.threeScene, camera);
      } catch {
        alive = false;
      }
    };
    raf = requestAnimationFrame(loop);

    const ro = new ResizeObserver(() => {
      const w = host.clientWidth;
      const h = host.clientHeight;
      if (w < 2 || h < 2) return;
      renderer.setSize(w, h, false);
      setCameraPerspective(camera, w / h);
    });
    ro.observe(host);

    // ── clicking picks objects (when not interacting with the gizmo) ──
    const pointer = { x: 0, y: 0, moved: false, down: false };
    const onPointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      pointer.down = true;
      pointer.moved = false;
      pointer.x = e.clientX;
      pointer.y = e.clientY;
    };
    const onPointerMove = (e: PointerEvent) => {
      if (!pointer.down) return;
      if (Math.hypot(e.clientX - pointer.x, e.clientY - pointer.y) > 4) pointer.moved = true;
    };
    const onPointerUp = (e: PointerEvent) => {
      if (e.button !== 0 || !pointer.down) return;
      pointer.down = false;
      if (pointer.moved) return;
      if (transform.axis) return;
      const rect = canvas.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      const nx = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      const ny = -((e.clientY - rect.top) / rect.height) * 2 + 1;
      const id = runtime.pick(nx, ny, camera);
      const st = useEditorStore.getState();
      if (id) {
        if (e.shiftKey) st.toggleSelected3D(id);
        else st.setSelected3D([id]);
      } else if (!e.shiftKey) {
        st.setSelected3D([]);
      }
    };
    canvas.addEventListener("pointerdown", onPointerDown);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerup", onPointerUp);

    // ── WebGL context loss: stop rendering, surface an honest notice, and
    // rebuild the runtime automatically when the context is restored. ──
    const onContextLost = (e: Event) => {
      e.preventDefault();
      alive = false;
      setContextLost(true);
    };
    const onContextRestored = () => {
      setContextLost(false);
      setGlEpoch((n) => n + 1);
    };
    canvas.addEventListener("webglcontextlost", onContextLost);
    canvas.addEventListener("webglcontextrestored", onContextRestored);

    rt.current = {
      renderer,
      runtime,
      orbit,
      transform,
      camera,
      dispose() {
        alive = false;
        cancelAnimationFrame(raf);
        ro.disconnect();
        canvas.removeEventListener("pointerdown", onPointerDown);
        canvas.removeEventListener("pointermove", onPointerMove);
        canvas.removeEventListener("pointerup", onPointerUp);
        canvas.removeEventListener("webglcontextlost", onContextLost);
        canvas.removeEventListener("webglcontextrestored", onContextRestored);
        transform.removeEventListener("dragging-changed", onDragChanged as never);
        transform.removeEventListener("objectChange", onObjectChange);
        transform.detach();
        transform.dispose();
        orbit.dispose();
        runtime.dispose();
        renderer.dispose();
      },
    };

    return () => {
      setViewport3dController(null);
      rt.current?.dispose();
      rt.current = null;
    };
  }, [glEpoch]);

  // ── rebuild the runtime whenever the active scene data changes ──
  useEffect(() => {
    const ctx = rt.current;
    if (!ctx || !scene) return;
    ctx.runtime.applyData(scene);
    updateRendererSettings(ctx.renderer, scene);
    ctx.transform.setMode(gizmoMode === "select" ? "translate" : gizmoMode);
    ctx.transform.setSpace(gizmoSpace);
    const camData = scene.activeCameraId ? scene.cameras.find((c) => c.id === scene.activeCameraId) : scene.cameras[0];
    if (camData) {
      const orthoNow = ctx.camera instanceof OrthographicCamera;
      if (orthoNow !== camData.ortho) {
        const fresh = makeCamera(scene, ctx.renderer.domElement.clientWidth || 640, ctx.renderer.domElement.clientHeight || 480);
        ctx.camera = fresh.camera;
        ctx.orbit.object = fresh.camera;
        ctx.orbit.update();
      }
    }
  }, [scene, sceneVersion, gizmoMode, gizmoSpace]);

  // ── selection → highlight + gizmo attach ──
  useEffect(() => {
    const ctx = rt.current;
    if (!ctx) return;
    ctx.runtime.select(selected3D);
    const first = selected3D[0];
    const node: Object3D | undefined = first ? ctx.runtime.objects.get(first) : undefined;
    if (node && gizmoMode !== "select") {
      node.userData.vs3dId = first;
      ctx.transform.attach(node);
      ctx.transform.getHelper().visible = true;
    } else {
      ctx.transform.detach();
      ctx.transform.getHelper().visible = false;
    }
  }, [selected3D, scene, sceneVersion, gizmoMode]);

  // ── orbit vs pan navigation ──
  useEffect(() => {
    const ctx = rt.current;
    if (!ctx) return;
    ctx.orbit.enableRotate = mode === "orbit";
    ctx.orbit.enablePan = true;
    ctx.orbit.mouseButtons = mode === "pan"
      ? { LEFT: MOUSE.PAN, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.ROTATE }
      : { LEFT: MOUSE.ROTATE, MIDDLE: MOUSE.DOLLY, RIGHT: MOUSE.PAN };
  }, [mode]);

  // ── expose controller for the 3D toolbar / options bar ──
  useEffect(() => {
    const frameBox = (box: Box3 | null) => {
      const ctx = rt.current;
      if (!ctx) return;
      const b = box && !box.isEmpty() ? box : ctx.runtime.getBoundingBox([], true);
      const useBox = b && !b.isEmpty() ? b : new Box3(new Vector3(-1, 0, -1), new Vector3(1, 1, 1));
      const center = new Vector3();
      const size = new Vector3();
      useBox.getCenter(center);
      useBox.getSize(size);
      const maxDim = Math.max(size.x, size.y, size.z, 0.75);
      const dist = maxDim * 2.1;
      ctx.orbit.target.copy(center);
      ctx.camera.position.set(center.x + dist * 0.7, center.y + dist * 0.55, center.z + dist * 0.7);
      if (ctx.camera instanceof OrthographicCamera) {
        ctx.camera.zoom = Math.min(4, Math.max(0.4, 1.6 / maxDim));
        ctx.camera.updateProjectionMatrix();
      }
      ctx.camera.lookAt(center);
      ctx.orbit.update();
    };

    const activeScene = (): Scene3D | null => {
      const s = useEditorStore.getState();
      return s.scenes3D.find((x) => x.id === s.activeSceneId) ?? s.scenes3D[0] ?? null;
    };

    const nextController: Viewport3DController = {
      setGizmoMode: (m) => mutateScene3D((sc) => { sc.settings.gizmoMode = m; }),
      setGizmoSpace: (sp) => mutateScene3D((sc) => { sc.settings.gizmoSpace = sp; }),
      frameSelected: () => frameBox(rt.current?.runtime.getBoundingBox(useEditorStore.getState().selected3DIds) ?? null),
      frameAll: () => frameBox(null),
      setViewPreset: (kind) => {
        const sc = activeScene();
        const ctx = rt.current;
        if (!sc || !ctx) return;
        const camData = sc.cameras[0];
        if (!camData) return;
        const next = presetCameraData(kind, camData);
        ctx.camera.position.fromArray(next.position);
        ctx.camera.up.fromArray(next.up);
        ctx.orbit.target.fromArray(next.target);
        ctx.camera.lookAt(next.target[0], next.target[1], next.target[2]);
        ctx.camera.updateProjectionMatrix();
        ctx.orbit.update();
        mutateScene3D((s) => {
          if (s.cameras[0]) {
            s.cameras[0].position = next.position;
            s.cameras[0].target = next.target;
            s.cameras[0].ortho = next.ortho;
          }
        });
      },
      resetView: () => {
        const ctx = rt.current;
        if (!ctx) return;
        ctx.orbit.target.set(0, 0.5, 0);
        ctx.camera.position.set(6, 5, 8);
        ctx.camera.up.set(0, 1, 0);
        ctx.camera.lookAt(0, 0.5, 0);
        if (ctx.camera instanceof OrthographicCamera) {
          ctx.camera.zoom = 1.6;
          ctx.camera.updateProjectionMatrix();
        }
        ctx.orbit.update();
      },
      setDisplayMode: (m) => mutateScene3D((sc) => { sc.settings.displayMode = m; }),
      toggleGrid: () => mutateScene3D((sc) => { sc.settings.gridVisible = !sc.settings.gridVisible; }),
      toggleAxes: () => mutateScene3D((sc) => { sc.settings.axesVisible = !sc.settings.axesVisible; }),
      toggleSnap: () => mutateScene3D((sc) => { sc.settings.snapEnabled = !sc.settings.snapEnabled; }),
      setCameraMode: (ortho) => {
        mutateScene3D((sc) => {
          if (sc.cameras[0]) sc.cameras[0].ortho = ortho;
        });
      },
      renderToLayer: () => {
        if (renderSceneToRasterLayer()) useEditorStore.getState().setStatus(t("vpRenderToLayer"));
      },
      addLiveLayer: () => {
        if (addScene3DLayerToDoc()) useEditorStore.getState().setStatus(t("vpAddLiveLayer"));
      },
      exportPng: () => {
        const sc = activeScene();
        const doc = useEditorStore.getState().doc;
        if (!sc) return;
        const canvas = renderScene3DToCanvas(sc, doc?.width ?? 1280, doc?.height ?? 800);
        if (canvas) downloadCanvas(canvas, "3d");
      },
    };
    setViewport3dController(nextController);
    return () => { setViewport3dController(null); };
  }, []);

  // ── viewport keyboard (only while the 3D workspace is active) ──
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const st = useEditorStore.getState();
      if (!st.view3d || st.dialog) return;
      const target = e.target as HTMLElement;
      if (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT") return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      if (e.key === "Escape") {
        st.setSelected3D([]);
        return;
      }
      if (e.key === "w" || e.key === "W") { mutateScene3D((s) => { s.settings.gizmoMode = "translate"; }); return; }
      if (e.key === "e" || e.key === "E") { mutateScene3D((s) => { s.settings.gizmoMode = "rotate"; }); return; }
      if (e.key === "r" || e.key === "R") { mutateScene3D((s) => { s.settings.gizmoMode = "scale"; }); return; }
      if (e.key === "q" || e.key === "Q") { mutateScene3D((s) => { s.settings.gizmoMode = "select"; }); return; }
      if (e.key === "f" || e.key === "F") { viewport3d()?.frameSelected(); return; }
      if (e.key === "a" || e.key === "A") { viewport3d()?.frameAll(); return; }
      if (e.key === "2") { setMode((m) => (m === "pan" ? "orbit" : "pan")); return; }
      if (e.key === "Delete" || e.key === "Backspace") {
        const sel = st.selected3DIds;
        if (sel.length === 0) return;
        const before = beginSceneGesture();
        mutateScene3D((s) => {
          s.objects = s.objects.filter((o) => !sel.includes(o.id));
          s.lights = s.lights.filter((l) => !sel.includes(l.id));
        });
        commitSceneGesture("Delete 3D Object", before);
        st.setSelected3D([]);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const onDrop = async (e: DragEvent) => {
    e.preventDefault();
    const files = Array.from(e.dataTransfer?.files ?? []);
    let importedModels = 0;
    let rejected = 0;
    for (const f of files) {
      const lower = f.name.toLowerCase();
      if (/\.(glb|gltf|obj|stl)$/.test(lower)) {
        const id = await importModelToScene(f);
        if (id) importedModels += 1;
        else rejected += 1;
      } else {
        rejected += 1;
      }
    }
    const st = useEditorStore.getState();
    if (importedModels > 0) st.setStatus(t("vpImportedModels").replace("{n}", String(importedModels)));
    if (rejected > 0 && importedModels === 0) st.setStatus(t("vpDropUnsupported"));
    const ctx = rt.current;
    if (ctx) {
      const active = st.scenes3D.find((x) => x.id === st.activeSceneId) ?? st.scenes3D[0];
      if (active) ctx.runtime.applyData(active);
    }
    reraster3DLayers();
  };

  if (!webglOk) {
    return (
      <div className="vs-3d-area">
        <div className="vs-3d-unavailable">
          <strong>{t("vpUnavailableTitle")}</strong>
          <p>{t("vpUnavailableBody")}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="vs-3d-area" onDragOver={(e) => e.preventDefault()} onDrop={(e) => void onDrop(e)}>
      <div className="vs-3d-canvas-host" ref={hostRef}>
        <canvas ref={canvasRef} className="vs-3d-canvas" />
        {contextLost && (
          <div className="vs-3d-unavailable" role="status">
            <strong>{t("vpContextLostTitle")}</strong>
            <p>{t("vpContextLostBody")}</p>
          </div>
        )}
      </div>
      <div className="vs-3d-status">
        <span>{t("vpNavHint")}</span>
        <span className="grow" />
        <button
          type="button"
          className="vs-btn"
          style={{ padding: "1px 8px", fontSize: 11 }}
          onClick={() => setMode((m) => (m === "pan" ? "orbit" : "pan"))}
        >
          {mode === "pan" ? t("vpPanMode") : t("vpOrbitMode")}
        </button>
      </div>
    </div>
  );
}
