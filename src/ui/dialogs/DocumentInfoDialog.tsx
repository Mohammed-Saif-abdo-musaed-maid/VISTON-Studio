import { useEditorStore } from "../../state/store";
import { runtime } from "../../editor/core/runtime";
import { t } from "../../i18n";

function formatBytes(bytes: number | null): string {
  if (bytes === null || !Number.isFinite(bytes)) return t("notSavedYet");
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function formatDate(ts: number | null): string {
  if (!ts) return "—";
  try {
    return new Date(ts).toLocaleString();
  } catch {
    return "—";
  }
}

export function DocumentInfoDialog() {
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const info = runtime.engine?.getDocumentInfo() ?? null;

  const rows: Array<[string, string]> = info
    ? [
        [t("docInfoName"), info.name],
        [t("docInfoWidth"), `${info.width} px`],
        [t("docInfoHeight"), `${info.height} px`],
        [t("docInfoDpi"), `${info.dpi}`],
        [t("docInfoColor"), `${info.colorProfile}${info.background ? ` · ${info.background}` : ""}`],
        [t("docInfoLayers"), `${info.layerCount}`],
        [t("docInfoFileSize"), formatBytes(info.fileSize)],
        [t("docInfoCreated"), formatDate(info.createdAt)],
        [t("docInfoModified"), formatDate(info.modifiedAt)],
      ]
    : [];

  return (
    <div className="vs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="vs-modal" style={{ minWidth: 360 }}>
        <div className="vs-modal-header">
          <span>{t("docInfoTitle")}</span>
          <button className="vs-btn" style={{ padding: "2px 8px", fontSize: 14 }} onClick={closeDialog}>×</button>
        </div>
        <div className="vs-modal-body">
          {info ? (
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <tbody>
                {rows.map(([label, value]) => (
                  <tr key={label}>
                    <td style={{ padding: "5px 8px", color: "var(--text-dim)", whiteSpace: "nowrap", verticalAlign: "top" }}>{label}</td>
                    <td style={{ padding: "5px 8px", color: "var(--text)", wordBreak: "break-word" }}>{value}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div style={{ padding: "8px 4px", color: "var(--text-dim)", fontSize: 13 }}>{t("notSavedYet")}</div>
          )}
        </div>
        <div className="vs-modal-footer">
          <button className="vs-btn primary" onClick={closeDialog}>{t("close")}</button>
        </div>
      </div>
    </div>
  );
}
