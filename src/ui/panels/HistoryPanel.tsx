import { useEditorStore } from "../../state/store";
import { editorEngine } from "../../editor/core/engine";
import { t } from "../../i18n";
import { PanelShell } from "./PanelShell";

function formatBytes(n: number): string {
  if (!n) return "";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function HistoryPanel() {
  const items = useEditorStore((s) => s.historyItems);
  const idx = useEditorStore((s) => s.historyIndex);
  const canUndo = useEditorStore((s) => s.historyIndex > 0);
  const canRedo = useEditorStore((s) => s.historyIndex < s.historyItems.length - 1 && s.historyItems.length > 0);

  const actions = (
    <>
      <button type="button" title={t("historyUndoTitle")} disabled={!canUndo} onClick={() => editorEngine?.undo()}>↶ {t("undo")}</button>
      <button type="button" title={t("historyRedoTitle")} disabled={!canRedo} onClick={() => editorEngine?.redo()}>↷ {t("redo")}</button>
    </>
  );

  return (
    <PanelShell id="history" title={t("panelHistory")} actions={actions}>
      {items.length === 0 && <div className="vs-props-empty">{t("noHistory")}</div>}
      {items.map((item, i) => (
        <div
          key={item.id}
          className={`vs-history-item ${i === idx ? "active" : i > idx ? "past" : ""}`}
          title={`${item.name}${item.bytes ? ` — ${formatBytes(item.bytes)}` : ""}\n${t("historyJumpHint")}`}
          onClick={() => editorEngine?.jumpToHistory(i)}
          style={{ display: "flex", alignItems: "center", gap: 6 }}
        >
          <span style={{ width: 28, height: 20, flex: "0 0 auto", background: "#0d0f13", border: "1px solid var(--border)", borderRadius: 2, overflow: "hidden", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
            {item.thumb
              ? <img src={item.thumb} alt="" style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }} />
              : <span style={{ fontSize: 8, color: "var(--text-muted)" }}>—</span>}
          </span>
          <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item.name}</span>
          {item.bytes > 0 && <span style={{ color: "var(--text-muted)", fontSize: 9, flex: "0 0 auto" }}>{formatBytes(item.bytes)}</span>}
        </div>
      ))}
    </PanelShell>
  );
}