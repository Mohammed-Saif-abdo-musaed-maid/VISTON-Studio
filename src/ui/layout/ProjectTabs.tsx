import { useEditorStore } from "../../state/store";
import { runtime } from "../../editor/core/runtime";

export function ProjectTabs() {
  const tabs = useEditorStore((s) => s.openTabs);
  const activeKey = useEditorStore((s) => s.activeKey);
  const engine = runtime.engine;

  if (tabs.length <= 1) return null;

  const switchTo = (key: string) => engine?.switchToDocument(key);
  const closeTab = (e: React.MouseEvent, key: string) => {
    e.stopPropagation();
    void engine?.closeDocument(key);
  };

  return (
    <div className="vs-tabs-bar">
      {tabs.map((t) => (
        <div
          key={t.key}
          className={`vs-tab ${t.key === activeKey ? "active" : ""}`}
          onClick={() => switchTo(t.key)}
          title={t.name}
        >
          <span className="vs-tab-name">{t.name}{t.dirty ? " *" : ""}</span>
          <button className="vs-tab-close" onClick={(e) => closeTab(e, t.key)} title="Close">&times;</button>
        </div>
      ))}
    </div>
  );
}
