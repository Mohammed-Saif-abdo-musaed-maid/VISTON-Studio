import { useState } from "react";
import { useEditorStore } from "../../state/store";
import { t } from "../../i18n";
import { PanelShell } from "./PanelShell";
import { NumField, Vec3Field, ColorField, CheckField, SelectField, Section } from "../view3d/fields";
import {
  historyScene3D,
  mutateScene3D,
  removeScene,
  duplicateScene,
  createScene,
  addGroupToScene,
  ensureActiveScene,
} from "../../3d/core/sceneDataStore";
import { childrenOf, descendantsOf, rootObjects } from "../../3d/core/sceneModel3d";
import {
  LIGHT_KINDS,
  TEXTURE_SLOT_NAMES,
  createMaterial,
  createCamera,
} from "../../3d/types/types3d";
import type {
  LightKind,
  LightData,
  MaterialData,
  Object3DData,
  PrimitiveGeometryData,
  Scene3D,
} from "../../3d/types/types3d";
import { genId } from "../../utils/id";
import { runtime } from "../../editor/core/runtime";
import { TEXTURE_SLOT_LABELS } from "../../3d/types/labels";

export function Scene3DPanel() {
  const scene = useEditorStore((s) => {
    const id = s.activeSceneId;
    return s.scenes3D.find((x) => x.id === id) ?? s.scenes3D[0] ?? null;
  });
  const scenes = useEditorStore((s) => s.scenes3D);
  const selected3D = useEditorStore((s) => s.selected3DIds);
  const setSelected3D = useEditorStore((s) => s.setSelected3D);
  const toggleSelected3D = useEditorStore((s) => s.toggleSelected3D);
  const setActiveScene3D = useEditorStore((s) => s.setActiveScene3D);
  const openDialog = useEditorStore((s) => s.openDialog);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  const toggle = (id: string) => {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  if (!scene) {
    return (
      <PanelShell id="3d" title={t("panel3d")}>
        <div style={{ padding: 8, display: "flex", flexDirection: "column", gap: 6 }}>
          <span style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("vpNoScene")}</span>
          <button className="vs-btn primary" style={{ fontSize: 11 }} onClick={() => { ensureActiveScene(); }}>
            {t("vpNewScene")}
          </button>
        </div>
      </PanelShell>
    );
  }

  const selectedObject = scene.objects.find((o) => selected3D.includes(o.id)) ?? null;
  const selectedLight = scene.lights.find((l) => selected3D.includes(l.id)) ?? null;
  const material = selectedObject?.materialId
    ? scene.materials.find((m) => m.id === selectedObject.materialId) ?? null
    : null;

  const rowClick = (id: string, e: React.MouseEvent) => {
    if (e.ctrlKey || e.metaKey) toggleSelected3D(id);
    else setSelected3D([id]);
  };

  const renderObject = (obj: Object3DData, depth: number) => {
    const kids = childrenOf(scene, obj.id);
    const isCollapsed = collapsed.has(obj.id);
    const isSel = selected3D.includes(obj.id);
    return (
      <div key={obj.id}>
        <div
          className={`vs-layer-item ${isSel ? "selected" : ""}`}
          style={{ paddingLeft: 4 + depth * 12 }}
          onClick={(e) => rowClick(obj.id, e)}
        >
          <button
            type="button"
            className={`vs-group-caret ${!isCollapsed ? "open" : ""}`}
            style={{ visibility: kids.length > 0 ? "visible" : "hidden" }}
            onClick={(e) => { e.stopPropagation(); toggle(obj.id); }}
            aria-label={isCollapsed ? t("vpExpand") : t("vpCollapse")}
          >▸</button>
          <span style={{ fontSize: 12, margin: "0 4px" }}>{obj.kind === "group" ? "▣" : "◧"}</span>
          <span className="vs-layer-name">{obj.name}</span>
          <div className="vs-layer-actions">
            <button
              className={obj.visible ? "" : "off"}
              title={obj.visible ? t("vpHide") : t("vpShow")}
              onClick={(e) => { e.stopPropagation(); historyScene3D("Toggle 3D Visibility", (sc) => { const o = sc.objects.find((x) => x.id === obj.id); if (o) o.visible = !o.visible; }); }}
            >👁</button>
            <button
              className={obj.locked ? "" : "off"}
              title={obj.locked ? t("vpUnlock") : t("vpLock")}
              onClick={(e) => { e.stopPropagation(); historyScene3D("Toggle 3D Lock", (sc) => { const o = sc.objects.find((x) => x.id === obj.id); if (o) o.locked = !o.locked; }); }}
            >{obj.locked ? "🔒" : "🔓"}</button>
          </div>
        </div>
        {!isCollapsed && kids.map((k) => renderObject(k, depth + 1))}
      </div>
    );
  };

  return (
    <PanelShell id="3d" title={t("panel3d")} grow>
      <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
        <button className="vs-btn" style={{ flex: 1, padding: "3px 6px", fontSize: 11 }} onClick={() => openDialog({ name: "addPrimitive3d" })}>
          + {t("vpObject")}
        </button>
        <button className="vs-btn" style={{ padding: "3px 6px", fontSize: 11 }} title={t("vpAddGroup")} onClick={() => { addGroupToScene(); }}>
          ▣
        </button>
        <button className="vs-btn" style={{ padding: "3px 6px", fontSize: 11 }} title={t("vpAddLight")} onClick={() => openDialog({ name: "addLight3d" })}>
          ☀
        </button>
        <button className="vs-btn" style={{ padding: "3px 6px", fontSize: 11 }} title={t("vpImportModel")} onClick={() => openDialog({ name: "import3d" })}>
          ⇩
        </button>
      </div>

      <div style={{ display: "flex", gap: 2, marginBottom: 6, alignItems: "center" }}>
        <select
          className="vs-input"
          style={{ flex: 1, padding: "2px 6px", fontSize: 11 }}
          value={scene.id}
          onChange={(e) => setActiveScene3D(e.target.value)}
        >
          {scenes.map((sc) => (
            <option key={sc.id} value={sc.id}>{sc.name}</option>
          ))}
        </select>
        <button className="vs-btn" style={{ padding: "2px 6px", fontSize: 11 }} title={t("vpNewScene")} onClick={() => { createScene(); }}>＋</button>
        <button className="vs-btn" style={{ padding: "2px 6px", fontSize: 11 }} title={t("vpDuplicateScene")} onClick={() => { duplicateScene(scene.id); }}>⧉</button>
        <button className="vs-btn" style={{ padding: "2px 6px", fontSize: 11 }} title={t("vpDeleteScene")} onClick={() => { removeScene(scene.id); }}>✕</button>
      </div>

      <div className="vs-3d-tree">
        {rootObjects(scene).map((o) => renderObject(o, 0))}
        {scene.lights.map((l) => (
          <div
            key={l.id}
            className={`vs-layer-item ${selected3D.includes(l.id) ? "selected" : ""}`}
            onClick={(e) => rowClick(l.id, e)}
          >
            <span style={{ fontSize: 12, margin: "0 4px" }}>☀</span>
            <span className="vs-layer-name">{l.name}</span>
            <div className="vs-layer-actions">
              <button
                className={l.visible ? "" : "off"}
                title={l.visible ? t("vpHide") : t("vpShow")}
                onClick={(e) => { e.stopPropagation(); historyScene3D("Toggle 3D Light", (sc) => { const x = sc.lights.find((y) => y.id === l.id); if (x) x.visible = !x.visible; }); }}
              >👁</button>
            </div>
          </div>
        ))}
      </div>

      <div className="vs-3d-inspector">
        {!selectedObject && !selectedLight && (
          <div style={{ padding: 8, fontSize: 11, color: "var(--text-muted)" }}>{t("vpNoSelection")}</div>
        )}

        {selectedObject && (
          <>
            <Section title={t("vpObject")}>
              <label className="vs-field vs-3d-field">
                <span>{t("vpName")}</span>
                <input
                  className="vs-input"
                  defaultValue={selectedObject.name}
                  onBlur={(e) => historyScene3D("Rename 3D Object", (sc) => { const o = sc.objects.find((x) => x.id === selectedObject.id); if (o) o.name = e.target.value; })}
                />
              </label>
              <div className="vs-3d-inline">
                <CheckField label={t("vpVisible")} checked={selectedObject.visible} onChange={(v) => historyScene3D("Toggle 3D Visibility", (sc) => { const o = sc.objects.find((x) => x.id === selectedObject.id); if (o) o.visible = v; })} />
                <CheckField label={t("vpLocked")} checked={selectedObject.locked} onChange={(v) => historyScene3D("Toggle 3D Lock", (sc) => { const o = sc.objects.find((x) => x.id === selectedObject.id); if (o) o.locked = v; })} />
              </div>
              <Vec3Field label={t("vpPosition")} value={selectedObject.position} onChange={(v) => mutateScene3D((sc) => { const o = sc.objects.find((x) => x.id === selectedObject.id); if (o) o.position = v; })} />
              <Vec3Field label={t("vpRotation")} value={selectedObject.rotation} step={1} historyName="Edit 3D Rotation" onChange={(v) => mutateScene3D((sc) => { const o = sc.objects.find((x) => x.id === selectedObject.id); if (o) o.rotation = v; })} />
              <Vec3Field label={t("vpScale")} value={selectedObject.scale} onChange={(v) => mutateScene3D((sc) => { const o = sc.objects.find((x) => x.id === selectedObject.id); if (o) o.scale = v; })} />
              <div className="vs-3d-inline">
                <CheckField label={t("vpCastShadow")} checked={selectedObject.castShadow} onChange={(v) => historyScene3D("Toggle 3D Shadow", (sc) => { const o = sc.objects.find((x) => x.id === selectedObject.id); if (o) o.castShadow = v; })} />
                <CheckField label={t("vpReceiveShadow")} checked={selectedObject.receiveShadow} onChange={(v) => historyScene3D("Toggle 3D Shadow", (sc) => { const o = sc.objects.find((x) => x.id === selectedObject.id); if (o) o.receiveShadow = v; })} />
              </div>
            </Section>

            {selectedObject.geometry?.kind === "primitive" && (
              <Section title={t("vpGeometry")}>
                <PrimitiveParams
                  data={selectedObject.geometry.data}
                  onEdit={(patch) => mutateScene3D((sc) => {
                    const o = sc.objects.find((x) => x.id === selectedObject.id);
                    if (o && o.geometry?.kind === "primitive") o.geometry.data = { ...o.geometry.data, ...patch };
                  })}
                />
              </Section>
            )}
            {selectedObject.geometry?.kind === "imported" && (
              <Section title={t("vpGeometry")}>
                <div style={{ fontSize: 11, color: "var(--text-muted)" }}>{t("vpImportedGeometry")}</div>
              </Section>
            )}

            <Section title={t("vpMaterial")}>
              <label className="vs-field vs-3d-field">
                <span>{t("vpMaterial")}</span>
                <select
                  className="vs-input"
                  value={selectedObject.materialId ?? ""}
                  onChange={(e) => {
                    const val = e.target.value;
                    if (val === "__new") {
                      historyScene3D("Add 3D Material", (sc) => {
                        const m = createMaterial(genId("mat"), "Material");
                        sc.materials.push(m);
                        const o = sc.objects.find((x) => x.id === selectedObject.id);
                        if (o) o.materialId = m.id;
                      });
                    } else {
                      historyScene3D("Assign 3D Material", (sc) => { const o = sc.objects.find((x) => x.id === selectedObject.id); if (o) o.materialId = val || null; });
                    }
                  }}
                >
                  <option value="">{t("vpNone")}</option>
                  {scene.materials.map((m) => (
                    <option key={m.id} value={m.id}>{m.name}</option>
                  ))}
                  <option value="__new">{t("vpNewMaterial")}</option>
                </select>
              </label>
              {material && <MaterialFields scene={scene} material={material} />}
            </Section>

            <Section title={t("vpActions")}>
              <div className="vs-3d-inline">
                <button className="vs-btn" style={{ fontSize: 11 }} onClick={() => historyScene3D("Duplicate 3D Object", (sc) => {
                  const o = sc.objects.find((x) => x.id === selectedObject.id);
                  if (!o) return;
                  const ids = [o.id, ...descendantsOf(sc, o.id)];
                  const clones: Object3DData[] = [];
                  const cloneMap = new Map<string, string>();
                  for (const id of ids) {
                    const src = sc.objects.find((x) => x.id === id);
                    if (!src) continue;
                    const c: Object3DData = JSON.parse(JSON.stringify(src)) as Object3DData;
                    cloneMap.set(src.id, genId("obj"));
                    c.id = cloneMap.get(src.id)!;
                    c.name = src.name + " Copy";
                    clones.push(c);
                  }
                  for (const c of clones) if (c.parentId && cloneMap.has(c.parentId)) c.parentId = cloneMap.get(c.parentId)!;
                  sc.objects.push(...clones);
                })}>{t("vpDuplicate")}</button>
                <button className="vs-btn" style={{ fontSize: 11 }} onClick={() => {
                  const ids = [selectedObject.id, ...descendantsOf(scene, selectedObject.id)];
                  historyScene3D("Delete 3D Object", (sc) => {
                    sc.objects = sc.objects.filter((o) => !ids.includes(o.id));
                  });
                  setSelected3D([]);
                }}>{t("vpDelete")}</button>
              </div>
            </Section>
          </>
        )}

        {selectedLight && <LightFields scene={scene} light={selectedLight} />}

        <Section title={t("vpCamera")}>
          <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 4 }}>
            {scene.cameras.length} {t("vpCameras")}
          </div>
          {scene.cameras.map((cam) => (
            <div key={cam.id} className="vs-3d-inline" style={{ alignItems: "center" }}>
              <span style={{ flex: 1, fontSize: 11 }}>{cam.name}</span>
              <button
                className={`vs-btn ${scene.activeCameraId === cam.id ? "primary" : ""}`}
                style={{ fontSize: 10, padding: "1px 6px" }}
                onClick={() => mutateScene3D((sc) => { sc.activeCameraId = cam.id; })}
              >
                {scene.activeCameraId === cam.id ? t("vpActive") : t("vpSetActive")}
              </button>
            </div>
          ))}
          <button className="vs-btn" style={{ fontSize: 11, marginTop: 4 }} onClick={() => historyScene3D("Add 3D Camera", (sc) => {
            const cam = createCamera(genId("cam"), `Camera ${sc.cameras.length + 1}`);
            sc.cameras.push(cam);
            sc.activeCameraId = cam.id;
          })}>{t("vpAddCamera")}</button>
        </Section>

        <Section title={t("vpEnvironment")}>
          <SelectField
            label={t("vpBackground")}
            value={scene.environment.backgroundType}
            options={[{ value: "solid", label: t("vpSolidBg") }, { value: "none", label: t("vpTransparentBg") }]}
            onChange={(v) => historyScene3D("Edit 3D Environment", (sc) => { sc.environment.backgroundType = v; })}
          />
          {scene.environment.backgroundType === "solid" && (
            <ColorField label={t("vpColor")} value={scene.environment.backgroundColor} onChange={(v) => mutateScene3D((sc) => { sc.environment.backgroundColor = v; })} />
          )}
          <NumField label={t("vpExposure")} value={scene.environment.exposure} step={0.05} min={0} max={5} historyName="Edit 3D Environment" onChange={(v) => mutateScene3D((sc) => { sc.environment.exposure = v; })} />
          <CheckField label={t("vpShadows")} checked={scene.environment.shadowsEnabled} onChange={(v) => historyScene3D("Toggle 3D Shadows", (sc) => { sc.environment.shadowsEnabled = v; })} />
        </Section>

        <Section title={t("vpSceneSettings")}>
          <NumField label={t("vpGridSize")} value={scene.settings.gridSize} step={1} min={1} max={100} historyName="Edit 3D Grid" onChange={(v) => mutateScene3D((sc) => { sc.settings.gridSize = v; })} />
          <NumField label={t("vpGridDivisions")} value={scene.settings.gridDivisions} step={1} min={1} max={100} historyName="Edit 3D Grid" onChange={(v) => mutateScene3D((sc) => { sc.settings.gridDivisions = v; })} />
          <NumField label={t("vpSnapSize")} value={scene.settings.snapSize} step={0.05} min={0} historyName="Edit 3D Snap" onChange={(v) => mutateScene3D((sc) => { sc.settings.snapSize = v; })} />
        </Section>
      </div>
      <div style={{ padding: "4px 0", textAlign: "right" }}>
        <button className="vs-btn" style={{ fontSize: 10, padding: "1px 6px" }} onClick={() => runtime.canvas?.requestRender()}>
          {t("vpRefresh")}
        </button>
      </div>
    </PanelShell>
  );
}

function PrimitiveParams({ data, onEdit }: { data: PrimitiveGeometryData; onEdit: (patch: Partial<PrimitiveGeometryData>) => void }) {
  const k = data.kind;
  return (
    <>
      <div style={{ fontSize: 11, color: "var(--text-muted)", marginBottom: 2 }}>{k}</div>
      {(k === "cube") && (
        <>
          <NumField label={t("width")} value={data.width ?? 1} onChange={(v) => onEdit({ width: v })} />
          <NumField label={t("height")} value={data.height ?? 1} onChange={(v) => onEdit({ height: v })} />
          <NumField label={t("vpDepth")} value={data.depth ?? 1} onChange={(v) => onEdit({ depth: v })} />
        </>
      )}
      {(k === "sphere") && (
        <>
          <NumField label={t("vpRadius")} value={data.radius ?? 0.5} onChange={(v) => onEdit({ radius: v })} />
          <NumField label={t("vpSegments")} value={data.widthSegments ?? 24} step={1} min={3} onChange={(v) => onEdit({ widthSegments: Math.round(v) })} />
        </>
      )}
      {(k === "cylinder" || k === "cone") && (
        <>
          {k === "cylinder" && <NumField label={t("vpRadiusTop")} value={data.radiusTop ?? 0.5} onChange={(v) => onEdit({ radiusTop: v })} />}
          <NumField label={t("vpRadiusBottom")} value={data.radiusBottom ?? 0.5} onChange={(v) => onEdit({ radiusBottom: v })} />
          <NumField label={t("height")} value={data.height ?? 1} onChange={(v) => onEdit({ height: v })} />
          <NumField label={t("vpRadialSegments")} value={data.radialSegments ?? 24} step={1} min={3} onChange={(v) => onEdit({ radialSegments: Math.round(v) })} />
        </>
      )}
      {(k === "plane") && (
        <>
          <NumField label={t("width")} value={data.planeWidth ?? 1} onChange={(v) => onEdit({ planeWidth: v })} />
          <NumField label={t("height")} value={data.planeHeight ?? 1} onChange={(v) => onEdit({ planeHeight: v })} />
        </>
      )}
      {(k === "torus") && (
        <>
          <NumField label={t("vpRadius")} value={data.torusRadius ?? 0.5} onChange={(v) => onEdit({ torusRadius: v })} />
          <NumField label={t("vpTube")} value={data.tube ?? 0.25} onChange={(v) => onEdit({ tube: v })} />
          <NumField label={t("vpSegments")} value={data.tubularSegments ?? 32} step={1} min={3} onChange={(v) => onEdit({ tubularSegments: Math.round(v) })} />
        </>
      )}
      {(k === "capsule") && (
        <>
          <NumField label={t("vpRadius")} value={data.capsuleRadius ?? 0.4} onChange={(v) => onEdit({ capsuleRadius: v })} />
          <NumField label={t("vpLength")} value={data.capsuleLength ?? 0.6} onChange={(v) => onEdit({ capsuleLength: v })} />
        </>
      )}
    </>
  );
}

function MaterialFields({ scene, material }: { scene: Scene3D; material: MaterialData }) {
  const doc = useEditorStore((s) => s.doc);
  const imageLayers = doc ? doc.layers.filter((l) => l.type === "image") : [];
  return (
    <>
      <ColorField label={t("vpColor")} value={material.color} onChange={(v) => mutateScene3D((sc) => { const m = sc.materials.find((x) => x.id === material.id); if (m) m.color = v; })} />
      <NumField label={t("vpMetalness")} value={material.metalness} step={0.05} min={0} max={1} onChange={(v) => mutateScene3D((sc) => { const m = sc.materials.find((x) => x.id === material.id); if (m) m.metalness = v; })} />
      <NumField label={t("vpRoughness")} value={material.roughness} step={0.05} min={0} max={1} onChange={(v) => mutateScene3D((sc) => { const m = sc.materials.find((x) => x.id === material.id); if (m) m.roughness = v; })} />
      <NumField label={t("vpOpacity")} value={material.opacity} step={0.05} min={0} max={1} onChange={(v) => mutateScene3D((sc) => { const m = sc.materials.find((x) => x.id === material.id); if (m) m.opacity = v; })} />
      <div className="vs-3d-inline">
        <CheckField label={t("vpTransparent")} checked={material.transparent} onChange={(v) => mutateScene3D((sc) => { const m = sc.materials.find((x) => x.id === material.id); if (m) m.transparent = v; })} />
        <CheckField label={t("vpDoubleSide")} checked={material.doubleSide} onChange={(v) => mutateScene3D((sc) => { const m = sc.materials.find((x) => x.id === material.id); if (m) m.doubleSide = v; })} />
      </div>
      <div className="vs-3d-inline">
        <CheckField label={t("vpWireframe")} checked={material.wireframe} onChange={(v) => mutateScene3D((sc) => { const m = sc.materials.find((x) => x.id === material.id); if (m) m.wireframe = v; })} />
        <CheckField label={t("vpFlatShading")} checked={material.flatShading} onChange={(v) => mutateScene3D((sc) => { const m = sc.materials.find((x) => x.id === material.id); if (m) m.flatShading = v; })} />
      </div>
      {TEXTURE_SLOT_NAMES.map((slot) => (
        <label key={slot} className="vs-field vs-3d-field">
          <span>{TEXTURE_SLOT_LABELS[slot] ?? slot}</span>
          <select
            className="vs-input"
            value={material.slots[slot]?.assetId ?? ""}
            onChange={(e) => {
              const val = e.target.value;
              historyScene3D("Edit 3D Texture", (sc) => {
                const m = sc.materials.find((x) => x.id === material.id);
                if (!m) return;
                if (!val) delete m.slots[slot];
                else m.slots[slot] = { assetId: val, sourceKind: "image-resource" };
              });
            }}
          >
            <option value="">{t("vpNone")}</option>
            {imageLayers.map((l) => (
              <option key={l.id} value={(l as { imageId: string }).imageId}>{l.name}</option>
            ))}
          </select>
        </label>
      ))}
      <div style={{ fontSize: 10, color: "var(--text-muted)" }}>{t("vpTextureHint")}</div>
      <button className="vs-btn" style={{ fontSize: 11 }} onClick={() => historyScene3D("Delete 3D Material", (sc) => {
        sc.materials = sc.materials.filter((m) => m.id !== material.id);
        for (const o of sc.objects) if (o.materialId === material.id) o.materialId = sc.materials[0]?.id ?? null;
      })}>{t("vpDeleteMaterial")}</button>
    </>
  );
}

function LightFields({ scene, light }: { scene: Scene3D; light: LightData }) {
  const edit = (fn: (l: LightData) => void) => historyScene3D("Edit 3D Light", (sc) => {
    const l = sc.lights.find((x) => x.id === light.id);
    if (l) fn(l);
  });
  return (
    <Section title={t("vpAddLight")}>
      <label className="vs-field vs-3d-field">
        <span>{t("vpName")}</span>
        <input className="vs-input" defaultValue={light.name} onBlur={(e) => edit((l) => { l.name = e.target.value; })} />
      </label>
      <SelectField
        label={t("vpKind")}
        value={light.kind}
        options={LIGHT_KINDS.map((k) => ({ value: k as LightKind, label: k }))}
        onChange={(v) => edit((l) => { l.kind = v; })}
      />
      <ColorField label={t("vpColor")} value={light.color} onChange={(v) => edit((l) => { l.color = v; })} />
      <NumField label={t("vpIntensity")} value={light.intensity} step={0.05} min={0} onChange={(v) => edit((l) => { l.intensity = v; })} />
      <Vec3Field label={t("vpPosition")} value={light.position} historyName="Edit 3D Light" onChange={(v) => edit((l) => { l.position = v; })} />
      {light.kind === "spot" && (
        <>
          <NumField label={t("vpAngle")} value={light.angle ?? 0.6} step={0.05} min={0} max={Math.PI / 2} onChange={(v) => edit((l) => { l.angle = v; })} />
          <NumField label={t("vpPenumbra")} value={light.penumbra ?? 0.3} step={0.05} min={0} max={1} onChange={(v) => edit((l) => { l.penumbra = v; })} />
        </>
      )}
      {(light.kind === "point" || light.kind === "spot") && (
        <>
          <NumField label={t("vpDistance")} value={light.distance ?? 0} step={0.5} min={0} onChange={(v) => edit((l) => { l.distance = v > 0 ? v : null; })} />
          <NumField label={t("vpDecay")} value={light.decay ?? 2} step={0.1} min={0} onChange={(v) => edit((l) => { l.decay = v; })} />
        </>
      )}
      <div className="vs-3d-inline">
        <CheckField label={t("vpCastShadow")} checked={light.castShadow} onChange={(v) => edit((l) => { l.castShadow = v; })} />
        <CheckField label={t("vpVisible")} checked={light.visible} onChange={(v) => edit((l) => { l.visible = v; })} />
      </div>
      <button className="vs-btn" style={{ fontSize: 11 }} onClick={() => historyScene3D("Delete 3D Light", (sc) => { sc.lights = sc.lights.filter((x) => x.id !== light.id); })}>
        {t("vpDeleteLight")}
      </button>
    </Section>
  );
}
