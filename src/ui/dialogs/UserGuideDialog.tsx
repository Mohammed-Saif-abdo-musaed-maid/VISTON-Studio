import { useEditorStore } from "../../state/store";
import { t } from "../../i18n";

const PDF_URL = `${import.meta.env.BASE_URL}user-guide.pdf`;

function PdfIcon({ size = 40 }: { size?: number }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      style={{ color: "var(--accent)", flexShrink: 0 }}
    >
      <path d="M14 3H7a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V7Z" />
      <path d="M14 3v4h4" />
      <path d="M9.5 11v5M12.5 11h1.2a1.3 1.3 0 0 1 0 2.6h-1.2M14.5 11v5M15.5 13.3H16" />
    </svg>
  );
}

export function UserGuideDialog() {
  const closeDialog = useEditorStore((s) => s.closeDialog);

  return (
    <div className="vs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="vs-modal" style={{ minWidth: 400, maxWidth: 480 }}>
        <div className="vs-modal-header">
          <span>📖 {t("userGuideTitle")}</span>
          <button className="vs-btn" style={{ padding: "2px 8px", fontSize: 14 }} onClick={closeDialog}>×</button>
        </div>
        <div className="vs-modal-body">
          <div style={{ color: "var(--text-dim)", fontSize: 13, lineHeight: 1.5, marginBottom: 16 }}>
            {t("userGuideDescription")}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 14,
              padding: 16,
              border: "1px solid var(--border)",
              borderRadius: "var(--radius-lg)",
              background: "var(--bg-hover)",
            }}
          >
            <PdfIcon />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 14, fontWeight: 600, color: "var(--text)" }}>{t("userGuideFileName")}</div>
              <div style={{ fontSize: 11, color: "var(--text-dim)", marginTop: 2 }}>{t("userGuideFileType")}</div>
            </div>
            <a className="vs-btn primary" href={PDF_URL} download="user-guide.pdf" style={{ whiteSpace: "nowrap" }}>
              {t("userGuideDownload")}
            </a>
          </div>
        </div>
        <div className="vs-modal-footer">
          <button className="vs-btn" onClick={closeDialog}>{t("close")}</button>
        </div>
      </div>
    </div>
  );
}