import { useState } from "react";
import { useEditorStore } from "../../state/store";
import { t } from "../../i18n";
import { importModelToScene } from "../../3d/core/sceneDataStore";

export function Import3DDialog() {
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<{ name: string; ok: boolean }[]>([]);

  const handleFiles = async (files: File[]) => {
    setBusy(true);
    const out: { name: string; ok: boolean }[] = [];
    for (const f of files) {
      const id = await importModelToScene(f);
      out.push({ name: f.name, ok: !!id });
    }
    setResults((prev) => [...prev, ...out]);
    setBusy(false);
  };

  return (
    <div className="vs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="vs-modal" style={{ minWidth: 380 }}>
        <div className="vs-modal-header"><span>{t("vpImportModel")}</span></div>
        <div className="vs-modal-body" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div
            className="vs-3d-dropzone"
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); void handleFiles(Array.from(e.dataTransfer.files ?? [])); }}
          >
            {t("vpDropHere")}
          </div>
          <label className="vs-field" style={{ cursor: "pointer" }}>
            <span>{t("vpChooseFiles")}</span>
            <input
              type="file"
              multiple
              accept=".glb,.gltf,.obj,.stl,model/gltf-binary,model/gltf+json,model/stl"
              onChange={(e) => { void handleFiles(Array.from(e.target.files ?? [])); e.target.value = ""; }}
            />
          </label>
          <div className="vs-hint">{t("vpFormatsHint")}</div>
          {busy && <div className="vs-hint">{t("vpImporting")}</div>}
          {results.map((r, i) => (
            <div key={i} className="vs-hint" style={{ color: r.ok ? "var(--text)" : "#e06c75" }}>
              {r.ok ? "✓" : "✕"} {r.name}
            </div>
          ))}
        </div>
        <div className="vs-modal-footer">
          <button className="vs-btn primary" onClick={closeDialog}>{t("close")}</button>
        </div>
      </div>
    </div>
  );
}
