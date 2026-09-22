import { useEditorStore } from "../../state/store";
import { t } from "../../i18n";

/**
 * Honest, read-only notice dialog used by File → Print… and File → Exit.
 * No fake behaviour: printing and browser exit are surfaced as unavailable
 * rather than silently doing nothing.
 */
export function NoticeDialog() {
  const dialog = useEditorStore((s) => s.dialog);
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const isPrint = dialog?.name === "printNotice";
  const title = isPrint ? t("print") : t("exit");
  const message = isPrint ? t("printNotice") : t("exitNotice");
  return (
    <div className="vs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="vs-modal" style={{ minWidth: 340 }}>
        <div className="vs-modal-header">
          <span>{title}</span>
          <button className="vs-btn" style={{ padding: "2px 8px", fontSize: 14 }} onClick={closeDialog}>×</button>
        </div>
        <div className="vs-modal-body" style={{ padding: "16px 20px", color: "var(--text-dim)", fontSize: 13, lineHeight: 1.5 }}>
          {message}
        </div>
        <div className="vs-modal-footer">
          <button className="vs-btn primary" onClick={closeDialog}>{t("close")}</button>
        </div>
      </div>
    </div>
  );
}
