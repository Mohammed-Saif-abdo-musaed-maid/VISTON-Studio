import { lazy, Suspense, useCallback, useRef, type CSSProperties, type PointerEvent as ReactPointerEvent } from "react";
import { MenuBar } from "../menus/MenuBar";
import { TopToolbar } from "../toolbar/TopToolbar";
import { ToolOptionsBar } from "../options/ToolOptionsBar";
import { LeftToolbar } from "../toolbar/LeftToolbar";
import { CanvasHost } from "../canvas/CanvasHost";
import { LayersPanel } from "../panels/LayersPanel";
import { PropertiesPanel } from "../panels/PropertiesPanel";
import { HistoryPanel } from "../panels/HistoryPanel";
import { HistogramPanel } from "../panels/HistogramPanel";
import { AIPanel } from "../panels/AIPanel";
import { ProductPanel } from "../panels/ProductPanel";
import { SwatchesPanel } from "../panels/SwatchesPanel";
import { Scene3DPanel } from "../panels/Scene3DPanel";
import { StatusBar } from "../statusbar/StatusBar";
import { DialogHost } from "../dialogs/DialogHost";
import { ProjectTabs } from "./ProjectTabs";
import { useEditorStore } from "../../state/store";
import { BeforeAfterViewer } from "../compare/BeforeAfterViewer";

// The 3D workspace is loaded on demand so three.js and the WebGL viewport are
// never fetched until the user actually opens the 3D workspace.
const Viewport3D = lazy(() => import("../view3d/Viewport3D").then((m) => ({ default: m.Viewport3D })));
const Viewport3DToolbar = lazy(() => import("../view3d/Viewport3DToolbar").then((m) => ({ default: m.Viewport3DToolbar })));
const Viewport3DOptionsBar = lazy(() => import("../view3d/Viewport3DToolbar").then((m) => ({ default: m.Viewport3DOptionsBar })));

function PanelResizer() {
  const drag = useRef<{ startX: number; startWidth: number } | null>(null);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = { startX: e.clientX, startWidth: useEditorStore.getState().panelWidth };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!drag.current) return;
    const delta = drag.current.startX - e.clientX;
    useEditorStore.getState().setPanelWidth(drag.current.startWidth + delta);
  };

  const onPointerUp = (e: ReactPointerEvent<HTMLDivElement>) => {
    drag.current = null;
    (e.target as HTMLElement).releasePointerCapture(e.pointerId);
  };

  return (
    <div
      className="vs-panel-resizer"
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize panels"
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onDoubleClick={() => useEditorStore.getState().setPanelWidth(264)}
    />
  );
}

export function Workspace() {
  const panels = useEditorStore((s) => s.panels);
  const panelWidth = useEditorStore((s) => s.panelWidth);
  const view3d = useEditorStore((s) => s.view3d);
  const compare = useEditorStore((s) => s.compare);
  const anyPanelVisible = panels.layers || panels.properties || panels.history || panels.histogram || panels.ai || panels["3d"] || panels.product || panels.swatches;
  const busy = useEditorStore((s) => s.busy);
  const visiblePanels = useCallback(() => anyPanelVisible, [anyPanelVisible]);

  return (
    <div className="vs-workspace" style={{ "--panel-w": `${panelWidth}px` } as CSSProperties}>
      <MenuBar />
      <TopToolbar />
      <ProjectTabs />
      {view3d ? <Suspense fallback={null}><Viewport3DOptionsBar /></Suspense> : <ToolOptionsBar />}
      {view3d ? <Suspense fallback={null}><Viewport3DToolbar /></Suspense> : <LeftToolbar />}
      <div className="vs-mainbar">
        {view3d ? <Suspense fallback={<div className="vs-3d-area" />}><Viewport3D /></Suspense> : <CanvasHost>{compare && <BeforeAfterViewer />}</CanvasHost>}
        {visiblePanels() && <PanelResizer />}
        {visiblePanels() && (
          <div className="vs-panels">
            {panels.layers && <LayersPanel />}
            {panels.properties && <PropertiesPanel />}
            {panels.history && <HistoryPanel />}
            {panels.histogram && <HistogramPanel />}
            {panels.ai && <AIPanel />}
            {panels["3d"] && <Scene3DPanel />}
            {panels.product && <ProductPanel />}
            {panels.swatches && <SwatchesPanel />}
          </div>
        )}
      </div>
      <StatusBar />
      <DialogHost />
      {busy && (
        <div className="vs-busy-overlay">
          <div className="vs-spinner" />
        </div>
      )}
    </div>
  );
}