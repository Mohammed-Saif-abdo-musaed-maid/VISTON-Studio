import type { ReactNode } from "react";
import { useEditorStore, type PanelId } from "../../state/store";

interface PanelShellProps {
  id: PanelId;
  title: string;
  children: ReactNode;
  grow?: boolean;
  right?: ReactNode;
  actions?: ReactNode;
}

export function PanelShell({ id, title, children, grow, right, actions }: PanelShellProps) {
  const collapsed = useEditorStore((s) => s.panelCollapsed[id]);
  const toggle = () => useEditorStore.getState().togglePanelCollapsed(id);

  return (
    <section className={`vs-panel ${grow ? "grow" : ""}`} aria-label={title}>
      <div className="vs-panel-header">
        <button
          type="button"
          className="vs-panel-toggle"
          onClick={toggle}
          aria-expanded={!collapsed}
          aria-controls={`vs-panel-body-${id}`}
        >
          <span className={`vs-caret ${collapsed ? "" : "open"}`}>▸</span>
          {title}
        </button>
        <div className="vs-panel-header-right">{right}</div>
      </div>
      {actions && <div className="vs-panel-actions">{actions}</div>}
      <div id={`vs-panel-body-${id}`} className={`vs-panel-body ${collapsed ? "collapsed" : ""}`} hidden={collapsed}>
        {children}
      </div>
    </section>
  );
}