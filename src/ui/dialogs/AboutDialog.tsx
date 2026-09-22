import { useEditorStore } from "../../state/store";

export function AboutDialog() {
  const closeDialog = useEditorStore((s) => s.closeDialog);
  const iconUrl = `${import.meta.env.BASE_URL}icons/viston-ms.svg`;

  return (
    <div className="vs-modal-overlay" onClick={(e) => { if (e.target === e.currentTarget) closeDialog(); }}>
      <div className="vs-modal">
        <div className="vs-modal-header"><span>About Vision Studio</span></div>
        <div className="vs-modal-body" style={{ textAlign: "center", padding: 24 }}>
          <img
            src={iconUrl}
            alt="VISTON STUDIO"
            width={64}
            height={64}
            style={{ borderRadius: 14, boxShadow: "0 4px 14px rgba(14, 40, 84, 0.35)", marginBottom: 12 }}
          />
          <div style={{ fontSize: 28, fontWeight: 700, marginBottom: 8, color: "var(--accent)" }}>Vision Studio</div>
          <div style={{ color: "var(--text-dim)", marginBottom: 16 }}>Professional Image Editor</div>
          <div style={{ color: "var(--text-muted)", fontSize: 11, lineHeight: 1.6 }}>
            Version 0.1.0<br />
            Built with React, TypeScript, HTML Canvas<br />
            <br />
            Features: Multi-layer editing, brush, text, shapes,<br />
            selections, adjustments, filters, project save/load, export.
          </div>
        </div>
        <div className="vs-modal-footer">
          <button className="vs-btn primary" onClick={closeDialog}>Close</button>
        </div>
      </div>
    </div>
  );
}