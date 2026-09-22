import { useCallback, useEffect, useRef, useState } from "react";
import { useEditorStore } from "../../state/store";
import { runtime } from "../../editor/core/runtime";
import { Layer, ImageLayer } from "../../editor/core/types";
import { pixelStore } from "../../editor/core/document";
import { createBlankImageLayer } from "../../editor/layers/layerFactory";
import { PanelShell } from "./PanelShell";

function LayerThumb({ layer }: { layer: Layer }) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);

  if (layer.type === "image" && layer.visible) {
    const canvas = pixelStore.get((layer as ImageLayer).imageId);
    if (canvas && !thumbUrl) {
      const t = document.createElement("canvas");
      t.width = 28;
      t.height = 28;
      const ctx = t.getContext("2d")!;
      ctx.fillStyle = "#2a2f37";
      ctx.fillRect(0, 0, 28, 28);
      const scale = Math.min(28 / canvas.width, 28 / canvas.height);
      ctx.drawImage(canvas, (28 - canvas.width * scale) / 2, (28 - canvas.height * scale) / 2, canvas.width * scale, canvas.height * scale);
      setThumbUrl(t.toDataURL());
    }
  }

  const icon = layer.type === "text" ? "T" : layer.type === "group" ? "📁" : layer.type === "shape" ? "△" : layer.type === "adjustment" ? "◐" : "";

  return (
    <div className="vs-layer-thumb">
      {thumbUrl ? <img src={thumbUrl} alt="" style={{ width: 28, height: 28, objectFit: "contain" }} /> : <span style={{ fontSize: 14, color: "var(--text-muted)" }}>{icon}</span>}
    </div>
  );
}

interface ContextState {
  x: number;
  y: number;
  id: string;
  targetId?: string;
}

export function LayersPanel() {
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [context, setContext] = useState<ContextState | null>(null);
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set());
  const [drag, setDrag] = useState<{ id: string; above: string | null; below: string | null } | null>(null);
  const doc = useEditorStore((s) => s.doc);
  const selectedIds = useEditorStore((s) => s.selectedIds);
  const setSelected = useEditorStore((s) => s.setSelected);
  const toggleSelected = useEditorStore((s) => s.toggleSelected);
  const contextRef = useRef(context);
  contextRef.current = context;

  const layers = doc ? [...doc.layers].reverse() : [];

  const orderedRows = useCallback(() => {
    if (!doc) return [] as Layer[];
    const topLevel = doc.layers.filter((l) => !l.parentId);
    const rows: Layer[] = [];
    for (let i = topLevel.length - 1; i >= 0; i--) {
      const l = topLevel[i]!;
      rows.push(l);
      if (l.type === "group") {
        const children = doc.layers.filter((c) => c.parentId === l.id);
        if (!collapsedGroups.has(l.id)) {
          for (let j = children.length - 1; j >= 0; j--) rows.push(children[j]!);
        }
      }
    }
    return rows;
  }, [doc, collapsedGroups]);

  const rows = orderedRows();

  const onRowClick = (e: React.MouseEvent, id: string) => {
    if (e.ctrlKey || e.metaKey) {
      toggleSelected(id);
    } else if (e.shiftKey && selectedIds.length > 0) {
      const order = rows.map((l) => l.id);
      const first = order.indexOf(selectedIds[0]);
      const second = order.indexOf(id);
      if (first >= 0 && second >= 0) {
        const [lo, hi] = first <= second ? [first, second] : [second, first];
        setSelected(order.slice(lo, hi + 1));
      }
    } else {
      setSelected([id]);
    }
  };

  const moveLayer = (id: string, dir: -1 | 1) => {
    const eng = runtime.engine;
    if (!eng || !doc) return;
    const idx = doc.layers.findIndex((l) => l.id === id);
    if (idx < 0) return;
    eng.moveLayerInStack(id, idx + dir);
    eng.requestRender();
  };

  const openContext = (e: React.MouseEvent, id: string) => {
    e.preventDefault();
    e.stopPropagation();
    setSelected([id]);
    setContext({ x: e.clientX, y: e.clientY, id });
  };

  useEffect(() => {
    if (!context) return;
    const close = (e?: Event) => {
      if (e && (e.target as HTMLElement).closest?.(".vs-context-menu")) return;
      setContext(null);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setContext(null); };
    window.addEventListener("pointerdown", close as EventListener);
    window.addEventListener("blur", close as EventListener);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("pointerdown", close as EventListener);
      window.removeEventListener("blur", close as EventListener);
      window.removeEventListener("keydown", onKey);
    };
  }, [context]);

  const closeMenu = () => setContext(null);

  const runSelected = (fn: (eng: NonNullable<typeof runtime.engine>, id: string) => void) => {
    const id = context?.id;
    const eng = runtime.engine;
    closeMenu();
    if (!eng || !id) return;
    fn(eng, id);
  };

  // ── drag & drop reorder ──
  const dragOverRow = useCallback((e: React.DragEvent, id: string) => {
    if (!drag) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const above = (e.clientY - rect.top) < rect.height / 2;
    const key = id + (above ? "a" : "b");
    setDrag((prev) => (prev && prev.id + (above ? "a" : "b") === key ? prev : { id: prev!.id, above: above ? id : null, below: above ? null : id }));
  }, [drag]);

  const dropRow = (e: React.DragEvent) => {
    e.preventDefault();
    if (!drag || !doc) return;
    const eng = runtime.engine;
    const dragged = drag.id;
    const rest = doc.layers.map((l) => l.id).filter((id) => id !== dragged);
    let targetIndex: number;
    if (drag.above) {
      const t = rest.indexOf(drag.above);
      targetIndex = t >= 0 ? t + 1 : rest.length;
    } else if (drag.below) {
      const t = rest.indexOf(drag.below);
      targetIndex = t >= 0 ? t : 0;
    } else {
      targetIndex = rest.length;
    }
    setDrag(null);
    if (!eng || dragged === (drag.above ?? drag.below)) return;
    eng.moveLayerInStack(dragged, targetIndex);
    eng.requestRender();
  };

  const toggleGroup = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setCollapsedGroups((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <PanelShell id="layers" title="Layers" grow>
      <div style={{ display: "flex", gap: 4, marginBottom: 6, flexWrap: "wrap" }}>
        <button className="vs-btn" style={{ flex: 1, padding: "3px 6px", fontSize: 11 }} onClick={() => {
          const d = useEditorStore.getState().doc;
          if (!d) return;
          runtime.engine?.addLayer(createBlankImageLayer("Layer", d.width, d.height, "transparent"), "New Layer");
        }}>+ Layer</button>
        <button className="vs-btn" style={{ padding: "3px 6px", fontSize: 11 }} title="Duplicate selected layer (Ctrl+J)" onClick={() => runtime.engine?.duplicateSelected()}>⧉</button>
        <button className="vs-btn" style={{ padding: "3px 6px", fontSize: 11 }} title="Delete selected layers" onClick={() => { const sel = useEditorStore.getState().selectedIds; if (sel.length) runtime.engine?.deleteLayers(sel); }}>✕</button>
        <button className="vs-btn" style={{ padding: "3px 6px", fontSize: 11 }} title="Group selected layers (Ctrl+G)" onClick={() => runtime.engine?.groupSelected()}>Group</button>
        <button className="vs-btn" style={{ padding: "3px 6px", fontSize: 11 }} title="Ungroup selected group (Ctrl+Shift+G)" onClick={() => runtime.engine?.ungroupSelected()}>Ungroup</button>
      </div>
      <div style={{ display: "flex", gap: 2, marginBottom: 4 }}>
        <button className="vs-btn" style={{ padding: "2px 6px", fontSize: 11 }} title="Move selected layer up" onClick={() => { const id = selectedIds[selectedIds.length - 1]; if (id) moveLayer(id, -1); }}>↑</button>
        <button className="vs-btn" style={{ padding: "2px 6px", fontSize: 11 }} title="Move selected layer down" onClick={() => { const id = selectedIds[selectedIds.length - 1]; if (id) moveLayer(id, 1); }}>↓</button>
        <span style={{ marginLeft: "auto", fontSize: 10, color: "var(--text-muted)" }}>{selectedIds.length > 1 ? `${selectedIds.length} selected` : ""}</span>
      </div>
      {drag && <div className="vs-layer-drop-indicator" />}
      {rows.map((layer) => {
        const isActive = selectedIds.includes(layer.id);
        const isGroup = layer.type === "group";
        const collapsedGroup = isGroup && collapsedGroups.has(layer.id);
        const isChild = !!layer.parentId;
        return (
          <div key={layer.id}>
            {drag && drag.above === layer.id && <div className="vs-layer-drop-indicator" />}
            <div
              draggable={!renamingId}
              className={`vs-layer-item ${isActive ? "selected" : ""} ${layer.clipTo ? "clipped" : ""} ${drag?.id === layer.id ? "dragging" : ""}`}
              onClick={(e) => onRowClick(e, layer.id)}
              onContextMenu={(e) => openContext(e, layer.id)}
              onDragStart={(e) => {
                e.dataTransfer.setData("text/plain", layer.id);
                e.dataTransfer.effectAllowed = "move";
                setDrag({ id: layer.id, above: null, below: null });
              }}
              onDragEnd={() => setDrag(null)}
              onDragOver={(e) => dragOverRow(e, layer.id)}
              onDrop={dropRow}
            >
              {isChild && <span className="vs-layer-indent" />}
              <button
                type="button"
                className={`vs-group-caret ${!collapsedGroup ? "open" : ""}`}
                style={{ visibility: isGroup ? "visible" : "hidden" }}
                onClick={(e) => toggleGroup(layer.id, e)}
                aria-label={collapsedGroup ? "Expand group" : "Collapse group"}
              >▸</button>
              <LayerThumb layer={layer} />
              {renamingId === layer.id ? (
                <input
                  autoFocus
                  defaultValue={layer.name}
                  style={{ flex: 1, background: "var(--input-bg)", border: "1px solid var(--accent)", color: "var(--text)", padding: "1px 4px", fontSize: 11, borderRadius: 2 }}
                  onBlur={(e) => { runtime.engine?.renameLayer(layer.id, e.target.value); setRenamingId(null); }}
                  onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); if (e.key === "Escape") setRenamingId(null); }}
                  onClick={(e) => e.stopPropagation()}
                />
              ) : (
                <span
                  className="vs-layer-name"
                  title={layer.clipTo ? "Clipped to layer below" : undefined}
                  onDoubleClick={(e) => { e.stopPropagation(); setRenamingId(layer.id); }}
                >
                  {layer.name}
                </span>
              )}
              {layer.type === "adjustment" && <span className="vs-layer-badge adj">F</span>}
              {isGroup && <span className="vs-layer-badge group">GRP</span>}
              {layer.clipTo && <span className="vs-layer-badge clip">CLIP</span>}
              {layer.mask && <span className="vs-layer-badge mask">M</span>}
              <div className="vs-layer-actions">
                <button
                  className={layer.mask ? "off" : ""}
                  title={layer.mask ? (layer.mask.enabled ? "Mask enabled" : "Mask disabled") : "No mask. Click to add."}
                  onClick={(e) => { e.stopPropagation(); if (layer.mask) runtime.engine?.toggleMaskEnabled(layer.id); else runtime.engine?.addMaskToLayer(layer.id); }}
                >
                  ◍
                </button>
                <button
                  className={layer.visible ? "" : "off"}
                  title={layer.visible ? "Hide" : "Show"}
                  onClick={(e) => { e.stopPropagation(); runtime.engine?.updateLayerMeta(layer.id, { visible: !layer.visible }); runtime.engine?.requestRender(); }}
                >
                  👁
                </button>
                <button
                  className={layer.locked ? "" : "off"}
                  title={layer.locked ? "Unlock" : "Lock"}
                  onClick={(e) => { e.stopPropagation(); runtime.engine?.updateLayerMeta(layer.id, { locked: !layer.locked }); }}
                >
                  {layer.locked ? "🔒" : "🔓"}
                </button>
              </div>
            </div>
            {drag && drag.below === layer.id && <div className="vs-layer-drop-indicator" />}
          </div>
        );
      })}

      {context && (
        <div className="vs-context-menu" style={{ top: context.y, left: context.x }}>
          <button onClick={() => { const d = useEditorStore.getState().doc; const eng = runtime.engine; closeMenu(); if (!eng || !d) return; eng.addLayer(createBlankImageLayer("Layer", d.width, d.height, "transparent"), "New Layer"); }}>New Layer</button>
          <button onClick={() => { const eng = runtime.engine; const id = context.id; closeMenu(); if (eng && id) eng.duplicateSelected(); }}>Duplicate<kbd className="vs-context-shortcut">Ctrl+J</kbd></button>
          <button onClick={() => { setRenamingId(context.id); closeMenu(); }}>Rename</button>
          <button onClick={() => { const eng = runtime.engine; const id = context?.id; closeMenu(); if (eng && id) eng.deleteLayers([id]); }}>Delete Layer</button>
          <button onClick={() => runSelected((eng, id) => { eng.updateLayerMeta(id, { visible: !(useEditorStore.getState().doc?.getLayer(id)?.visible ?? true) }); eng.requestRender(); })}>Toggle Visibility</button>
          <button onClick={() => runSelected((eng, id) => { const l = useEditorStore.getState().doc?.getLayer(id); if (l) eng.updateLayerMeta(id, { locked: !l.locked }); })}>Toggle Lock</button>
          <div className="vs-context-sep" />
          <button onClick={() => { const eng = runtime.engine; closeMenu(); if (eng) eng.groupSelected(); }}>Group Layers</button>
          <button onClick={() => { const eng = runtime.engine; closeMenu(); if (eng) eng.ungroupSelected(); }}>Ungroup</button>
          <button onClick={() => { const eng = runtime.engine; closeMenu(); if (eng) eng.mergeDown(); }}>Merge Down</button>
          <div className="vs-context-sep" />
          <button onClick={() => runSelected((eng, id) => { eng.toggleClipping(id); })}>Toggle Clip to Below</button>
          <button onClick={() => runSelected((eng, id) => { const l = useEditorStore.getState().doc?.getLayer(id); if (l) { if (l.mask) eng.toggleMaskEnabled(id); else eng.addMaskToLayer(id); } })}>Toggle Mask</button>
        </div>
      )}
    </PanelShell>
  );
}