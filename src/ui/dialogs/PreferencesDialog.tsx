import { useState } from "react";
import { useEditorStore } from "../../state/store";
import { runtime } from "../../editor/core/runtime";
import { t, LANGUAGES } from "../../i18n";
import { LanguageSelector } from "../panels/LanguageSelector";
import { aiService } from "../../ai/services/AIService";
import { AI_PROVIDER_LABELS } from "../../ai/services/AIService";

export function PreferencesDialog() {
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const prefs = useEditorStore((s) => s.preferences);
  const aiSettings = useEditorStore((s) => s.aiSettings);
  const [autosave, setAutosave] = useState(prefs.autosaveEnabled);
  const [interval, setInterval] = useState(prefs.autosaveIntervalSec);
  const [dpi, setDpi] = useState(prefs.defaultDpi);
  const [three, setThree] = useState(prefs.three3D);

  const [aiProvider, setAiProvider] = useState(aiSettings.provider);
  const [aiEndpoint, setAiEndpoint] = useState(aiSettings.remoteEndpoint);
  const [aiModel, setAiModel] = useState(aiSettings.defaultModel);
  const [aiCache, setAiCache] = useState(aiSettings.cacheEnabled);
  const [aiMock, setAiMock] = useState(aiSettings.mockEnabled);
  const [apiKey, setApiKey] = useState("");

  const apply = () => {
    runtime.engine?.updatePreferences({ autosaveEnabled: autosave, autosaveIntervalSec: interval, defaultDpi: dpi, three3D: three });
    useEditorStore.getState().setAiSettings({
      provider: aiProvider,
      remoteEndpoint: aiEndpoint.trim(),
      defaultModel: aiModel.trim() || "default",
      cacheEnabled: aiCache,
      mockEnabled: aiMock,
    });
    aiService.setRemoteApiKey(apiKey ? apiKey : null);
    closeDialog();
  };

  return (
    <div className="vs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="vs-modal" style={{ minWidth: 380, maxHeight: "82vh" }}>
        <div className="vs-modal-header"><span>{t("preferences")}</span></div>
        <div className="vs-modal-body" style={{ display: "flex", flexDirection: "column", gap: 10, overflowY: "auto" }}>
          <label className="vs-field" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={autosave} onChange={(e) => setAutosave(e.target.checked)} />
            <span>{t("enableAutosave")}</span>
          </label>

          {autosave && (
            <label className="vs-field">
              <span>{t("autosaveInterval")}</span>
              <input className="vs-input" type="number" min={30} max={3600} value={interval}
                onChange={(e) => setInterval(Math.max(30, parseInt(e.target.value) || 120))} />
            </label>
          )}

          <label className="vs-field">
            <span>{t("defaultDpi")}</span>
            <input className="vs-input" type="number" min={1} max={3000} value={dpi}
              onChange={(e) => setDpi(Math.max(1, parseInt(e.target.value) || 96))} />
          </label>

          <LanguageSelector />

          <div className="vs-panel-sep" />

          <span style={{ fontWeight: 600 }}>{t("three3DLabel")}</span>

          <label className="vs-field">
            <span>{t("three3DDisplayMode")}</span>
            <select
              className="vs-input"
              value={three.defaultDisplayMode}
              onChange={(e) => setThree({ ...three, defaultDisplayMode: e.target.value as "solid" | "wireframe" | "material" })}
            >
              <option value="solid">{t("vpSolid")}</option>
              <option value="wireframe">{t("vpWireframe")}</option>
              <option value="material">{t("vpMaterial")}</option>
            </select>
          </label>

          <label className="vs-field">
            <span>{t("three3DSnapSize")}</span>
            <input className="vs-input" type="number" step={0.05} min={0} value={three.snapSize}
              onChange={(e) => setThree({ ...three, snapSize: Math.max(0, parseFloat(e.target.value) || 0) })} />
          </label>

          <label className="vs-field" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={three.gridVisible} onChange={(e) => setThree({ ...three, gridVisible: e.target.checked })} />
            <span>{t("vpGrid")}</span>
          </label>

          <label className="vs-field" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={three.axesVisible} onChange={(e) => setThree({ ...three, axesVisible: e.target.checked })} />
            <span>{t("vpAxes")}</span>
          </label>

          <label className="vs-field" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={three.antialias} onChange={(e) => setThree({ ...three, antialias: e.target.checked })} />
            <span>{t("three3DAntialias")}</span>
          </label>

          <div className="vs-panel-sep" />

          <span style={{ fontWeight: 600 }}>{t("aiSettings")}</span>

          <label className="vs-field">
            <span>{t("aiProvider")}</span>
            <select
              className="vs-input"
              value={aiProvider}
              onChange={(e) => setAiProvider(e.target.value)}
            >
              {aiService.providers().map((p) => (
                <option key={p.id} value={p.id}>
                  {AI_PROVIDER_LABELS[p.id] ?? p.name}
                </option>
              ))}
            </select>
          </label>

          <label className="vs-field">
            <span>{t("aiRemoteEndpoint")}</span>
            <input className="vs-input" type="text" placeholder="https://…" value={aiEndpoint}
              onChange={(e) => setAiEndpoint(e.target.value)} />
          </label>

          <label className="vs-field">
            <span>{t("aiRemoteModel")}</span>
            <input className="vs-input" type="text" value={aiModel} placeholder="default"
              onChange={(e) => setAiModel(e.target.value)} />
          </label>

          <label className="vs-field">
            <span>{t("aiApiKey")}</span>
            <input className="vs-input" type="password" placeholder="remote:••••" value={apiKey}
              onChange={(e) => setApiKey(e.target.value)} />
            <span className="vs-hint">{t("aiApiKeyHint")}</span>
          </label>

          <label className="vs-field" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
            <input type="checkbox" checked={aiCache} onChange={(e) => setAiCache(e.target.checked)} />
            <span>{t("aiCacheEnabled")}</span>
          </label>

          {import.meta.env.DEV && (
            <label className="vs-field" style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input type="checkbox" checked={aiMock} onChange={(e) => setAiMock(e.target.checked)} />
              <span>{t("aiMockEnabled")}</span>
            </label>
          )}
        </div>
        <div className="vs-modal-footer">
          <button className="vs-btn" onClick={closeDialog}>{t("cancel")}</button>
          <button className="vs-btn primary" onClick={apply}>{t("apply")}</button>
        </div>
      </div>
    </div>
  );
}