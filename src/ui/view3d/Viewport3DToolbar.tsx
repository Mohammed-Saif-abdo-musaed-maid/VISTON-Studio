import { useEditorStore } from "../../state/store";
import { t } from "../../i18n";
import { viewport3d } from "./viewport3dController";
import {
  addObjectToScene,
  addGroupToScene,
  createScene,
  removeScene,
  activeScene,
} from "../../3d/core/sceneDataStore";
import type { CameraPresetKind, Scene3D } from "../../3d/types/types3d";

type GizmoMode = Scene3D["settings"]["gizmoMode"];
type DisplayMode = Scene3D["settings"]["displayMode"];

function ToolButton({ label, title, active, onClick }: { label: string; title: string; active?: boolean; onClick: () => void }) {
  return (
    <button type="button" className={`vs-tool-btn ${active ? "active" : ""}`} title={title} onClick={onClick}>
      <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>
    </button>
  );
}

export function Viewport3DToolbar() {
  const scene = useEditorStore((s) => {
    const id = s.activeSceneId;
    return s.scenes3D.find((x) => x.id === id) ?? s.scenes3D[0] ?? null;
  });
  const openDialog = useEditorStore((s) => s.openDialog);
  const ctl = () => viewport3d();

  return (
    <div className="vs-toolbar vs-3d-toolbar" role="toolbar" aria-label={t("panel3d")}>
      <ToolButton label="◧" title={t("vpAddCube")} onClick={() => { addObjectToScene("cube"); }} />
      <ToolButton label="✦" title={t("vpAddObject")} onClick={() => openDialog({ name: "addPrimitive3d" })} />
      <ToolButton label="☀" title={t("vpAddLight")} onClick={() => openDialog({ name: "addLight3d" })} />
      <ToolButton label="⇩" title={t("vpImportModel")} onClick={() => openDialog({ name: "import3d" })} />
      <ToolButton label="▣" title={t("vpAddGroup")} onClick={() => { addGroupToScene(); }} />
      <div className="vs-3d-toolbar-sep" />
      <ToolButton label="◉" title={t("vpRenderToLayer")} onClick={() => ctl()?.renderToLayer()} />
      <ToolButton label="▤" title={t("vpAddLiveLayer")} onClick={() => ctl()?.addLiveLayer()} />
      <ToolButton label="⭳" title={t("vpExportPng")} onClick={() => ctl()?.exportPng()} />
      <div className="vs-3d-toolbar-sep" />
      <ToolButton label="⊹" title={t("vpNewScene")} onClick={() => { void createScene(); }} />
      <ToolButton
        label="⊖"
        title={t("vpDeleteScene")}
        onClick={() => scene && removeScene(scene.id)}
      />
    </div>
  );
}

function Seg({ active, title, children, onClick }: { active?: boolean; title: string; children: React.ReactNode; onClick: () => void }) {
  return (
    <button type="button" className={`vs-opt-toggle ${active ? "active" : ""}`} title={title} onClick={onClick}>
      {children}
    </button>
  );
}

export function Viewport3DOptionsBar() {
  const scene = useEditorStore((s) => {
    const id = s.activeSceneId;
    return s.scenes3D.find((x) => x.id === id) ?? s.scenes3D[0] ?? null;
  });
  const scenes = useEditorStore((s) => s.scenes3D);
  const setActiveScene3D = useEditorStore((s) => s.setActiveScene3D);
  const ctl = () => viewport3d();
  if (!scene) {
    return (
      <div className="vs-options-bar">
        <span style={{ color: "var(--text-dim)", fontSize: 12 }}>{t("vpNoScene")}</span>
        <button className="vs-btn" style={{ padding: "2px 10px", fontSize: 11 }} onClick={() => { void createScene(); }}>
          {t("vpNewScene")}
        </button>
      </div>
    );
  }

  const s = scene.settings;
  const gizmo = (m: GizmoMode) => s.gizmoMode === m;
  const gizmoBtn = (m: GizmoMode, label: string, keycap: string) => (
    <Seg key={m} active={gizmo(m)} title={`${t(label)} (${keycap})`} onClick={() => ctl()?.setGizmoMode(m)}>
      {label}
    </Seg>
  );
  const display = (m: DisplayMode, label: string) => (
    <Seg key={m} active={s.displayMode === m} title={label} onClick={() => ctl()?.setDisplayMode(m)}>
      {label}
    </Seg>
  );
  const preset = (k: CameraPresetKind, label: string) => (
    <Seg key={k} title={label} onClick={() => ctl()?.setViewPreset(k)}>
      {label}
    </Seg>
  );

  return (
    <div className="vs-options-bar vs-3d-options">
      <label>{t("vpScene")}</label>
      <select
        className="vs-input"
        style={{ maxWidth: 160, padding: "2px 6px", fontSize: 11 }}
        value={scene.id}
        onChange={(e) => { setActiveScene3D(e.target.value); ctl()?.frameAll(); }}
      >
        {scenes.map((sc) => (
          <option key={sc.id} value={sc.id}>{sc.name}</option>
        ))}
      </select>

      <span className="sep" />
      <label>{t("vpGizmo")}</label>
      {gizmoBtn("select", t("vpSelect"), "Q")}
      {gizmoBtn("translate", t("vpMove"), "W")}
      {gizmoBtn("rotate", t("vpRotate"), "E")}
      {gizmoBtn("scale", t("vpScale"), "R")}
      <Seg active={s.gizmoSpace === "world"} title={t("vpWorldSpace")} onClick={() => ctl()?.setGizmoSpace(s.gizmoSpace === "world" ? "local" : "world")}>
        {s.gizmoSpace === "world" ? t("vpWorld") : t("vpLocal")}
      </Seg>

      <span className="sep" />
      <label>{t("vpDisplay")}</label>
      {display("solid", t("vpSolid"))}
      {display("wireframe", t("vpWireframe"))}
      {display("material", t("vpMaterial"))}

      <span className="sep" />
      <label>{t("vpCamera")}</label>
      {preset("perspective", t("vpPerspective"))}
      {preset("front", t("vpFront"))}
      {preset("top", t("vpTop"))}
      {preset("right", t("vpRight"))}
      <Seg title={t("vpFrameSelected")} onClick={() => ctl()?.frameSelected()}>{t("vpFrameSel")}</Seg>
      <Seg title={t("vpFrameAll")} onClick={() => ctl()?.frameAll()}>{t("vpFrameAll")}</Seg>

      <span className="sep" />
      <Seg active={s.gridVisible} title={t("vpGrid")} onClick={() => ctl()?.toggleGrid()}>{t("vpGrid")}</Seg>
      <Seg active={s.axesVisible} title={t("vpAxes")} onClick={() => ctl()?.toggleAxes()}>{t("vpAxes")}</Seg>
      <Seg active={s.snapEnabled} title={t("vpSnap")} onClick={() => ctl()?.toggleSnap()}>{t("vpSnap")}</Seg>
      <Seg active={scene.cameras[0]?.ortho === true} title={t("vpOrtho")} onClick={() => ctl()?.setCameraMode(!(scene.cameras[0]?.ortho ?? false))}>
        {t("vpOrtho")}
      </Seg>
    </div>
  );
}
