import { useState, useRef, useEffect, type ReactNode } from "react";
import { useEditorStore, type PanelId } from "../../state/store";
import { runtime } from "../../editor/core/runtime";
import { selectionEngine } from "../../editor/selection/selectionEngine";
import { createBlankImageLayer } from "../../editor/layers/layerFactory";
import { viewport3d } from "../view3d/viewport3dController";
import { addGroupToScene } from "../../3d/core/sceneDataStore";
import { findCommand } from "../../app/commands";
import { importAcceptString } from "../../editor/import/importFormats";
import { t, LANGUAGES, DEFAULT_LANGUAGE, getLanguage, setLanguage, getDirection } from "../../i18n";

export interface MenuItem {
  label: string;
  shortcut?: string;
  action?: () => void;
  separator?: boolean;
  disabled?: boolean;
  submenu?: MenuItem[];
  /** Optional monochrome line icon rendered before the label. */
  icon?: string;
  /** Native tooltip, used for honest disabled states (e.g. Exit). */
  title?: string;
}

const FILE_ICON_PATHS: Record<string, string> = {
  new: "M12 5v14M5 12h14",
  open: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z",
  recent: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2",
  import: "M12 3v10M8 9l4 4 4-4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  clipboard: "M9 3h6v3H9zM7 5H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1",
  place: "M4 4h16v16H4zM12 8v8M8 12h8",
  save: "M5 3h11l3 3v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1ZM8 3v5h6V3M8 14h8",
  saveAs: "M5 3h9l3 3v6M5 3a1 1 0 0 0-1 1v16a1 1 0 0 0 1 1h8M18 15v6M15 18h6",
  saveCopy: "M8 3h9l3 3v9a1 1 0 0 1-1 1h-1M4 8h9l3 3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1Z",
  export: "M12 14V4M8 8l4-4 4 4M4 17v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2",
  exportAs: "M12 13V4M8 7l4-3 4 3M4 16v3a1 1 0 0 0 1 1h5M20 16a3 3 0 1 0 0 6 3 3 0 0 0 0-6M20 19v1.5",
  close: "M6 6l12 12M18 6L6 18",
  closeAll: "M4 4h11v11H4zM9 9h11v11H9z",
  documentInfo: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 8h.01M12 11v5",
  print: "M7 8V3h10v5M7 18H4a1 1 0 0 1-1-1v-5a1 1 0 0 1 1-1h16a1 1 0 0 1 1 1v5a1 1 0 0 1-1 1h-3M7 14h10v7H7z",
  preferences: "M4 7h16M4 12h16M4 17h16M9 5v4M15 10v4M7 15v4",
  exit: "M12 3v8M7.5 6.5a7 7 0 1 0 9 0",
  recovery: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18M12 7v5l3 2",
};

function FileIcon({ name }: { name?: string }) {
  const d = name ? FILE_ICON_PATHS[name] : undefined;
  if (!d) return null;
  return (
    <svg
      className="vs-menu-item-icon"
      viewBox="0 0 24 24"
      width={15}
      height={15}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}

const PANEL_LABEL_KEY: Record<PanelId, string> = {
  layers: "panelLayers",
  properties: "panelProperties",
  history: "panelHistory",
  histogram: "panelHistogram",
  ai: "aiPanel",
  "3d": "panel3d",
  product: "panelProduct",
  swatches: "panelSwatches",
};

export function buildMenu(): MenuItem[][] {
  const e = runtime.engine;
  const state = useEditorStore.getState();
  const hasDoc = !!e?.doc();
  const recentProjects = state.recentProjects;
  const sc = (id: string) => findCommand(id)?.shortcutText;
  const isDesktop = typeof window !== "undefined" && (window as unknown as { __VISTON_DESKTOP__?: boolean }).__VISTON_DESKTOP__ === true;

  const recentItems: MenuItem[] = recentProjects.length === 0
    ? [{ label: t("noRecentProjects"), disabled: true, icon: "recent" }]
    : [
        ...recentProjects.map((r) => ({
          label: r.name,
          action: () => e?.openFromRecent(r.path),
          icon: "recent",
        })),
        { separator: true, label: "" },
        { label: t("clearRecent"), icon: "closeAll", action: () => e?.clearRecentDocuments() },
      ];

  const importItems: MenuItem[] = [
    { label: t("importImage"), icon: "import", action: () => openFile(importAcceptString(), (f) => { void e?.importImageFile(f); }) },
    { label: t("importClipboard"), icon: "clipboard", disabled: !hasDoc, action: () => e?.pasteClipboard() },
    { label: t("placeAsLayer"), icon: "place", disabled: !hasDoc, action: () => openFile(importAcceptString(), (f) => { void e?.placeImageFile(f); }) },
  ];

  const exportItems: MenuItem[] = [
    { label: t("exportPng"), icon: "export", disabled: !hasDoc, action: () => void e?.exportComposite({ format: "png" }) },
    { label: t("exportJpeg"), icon: "export", disabled: !hasDoc, action: () => void e?.exportComposite({ format: "jpeg", quality: 92 }) },
    { label: t("exportWebp"), icon: "export", disabled: !hasDoc, action: () => void e?.exportComposite({ format: "webp", quality: 92 }) },
    { label: t("exportBmp"), icon: "export", disabled: !hasDoc, action: () => void e?.exportComposite({ format: "bmp" }) },
    { separator: true, label: "" },
    { label: t("exportSelected"), icon: "export", disabled: !hasDoc, action: () => void e?.exportSelection({ format: "png" }) },
    { label: t("exportLayer"), icon: "export", disabled: !hasDoc, action: () => void e?.exportLayer({ format: "png" }) },
    { label: t("exportArtboard"), icon: "export", disabled: !hasDoc || state.artboards.length === 0, action: () => void e?.exportArtboard({ format: "png" }) },
  ];

  const artboardItems: MenuItem[] = [
    { label: t("newArtboard"), disabled: !hasDoc, action: () => useEditorStore.getState().openDialog({ name: "artboard" }) },
    { label: t("renameArtboard"), disabled: !hasDoc || !state.activeArtboardId, action: () => useEditorStore.getState().openDialog({ name: "artboard", payload: { artboardId: useEditorStore.getState().activeArtboardId } }) },
    { label: t("deleteArtboard"), disabled: !hasDoc || !state.activeArtboardId, action: () => { const id = useEditorStore.getState().activeArtboardId; if (id) e?.removeArtboard(id); } },
    { separator: true, label: "" },
    { label: t("exportArtboard"), disabled: !hasDoc || state.artboards.length === 0, action: () => void e?.exportArtboard({ format: "png" }) },
  ];

  const snapItems: MenuItem[] = [
    { label: t("snapToGrid"), action: () => useEditorStore.getState().setSnapToGrid(!useEditorStore.getState().snapToGrid) },
    { label: t("snapToGuides"), action: () => useEditorStore.getState().setSnapToGuides(!useEditorStore.getState().snapToGuides) },
    { label: t("snapToLayers"), action: () => useEditorStore.getState().setSnapToLayers(!useEditorStore.getState().snapToLayers) },
    { label: t("snapToCenter"), action: () => useEditorStore.getState().setSnapToCenter(!useEditorStore.getState().snapToCenter) },
    { label: t("snapToEdges"), action: () => useEditorStore.getState().setSnapToEdges(!useEditorStore.getState().snapToEdges) },
    { label: t("snapToArtboards"), action: () => useEditorStore.getState().setSnapToArtboards(!useEditorStore.getState().snapToArtboards) },
  ];

  const panelItems: MenuItem[] = (["layers", "properties", "history", "histogram", "ai", "3d", "product", "swatches"] as PanelId[]).map((p) => ({
    label: t(PANEL_LABEL_KEY[p]),
    action: () => useEditorStore.getState().togglePanel(p),
  }));

  const guideItems: MenuItem[] = [
    { label: t("toggleGuides"), action: () => useEditorStore.getState().setShowGuides(!useEditorStore.getState().showGuides) },
    { separator: true, label: "" },
    { label: t("newHorizontalGuide"), action: () => { const d = useEditorStore.getState().doc; e?.createGuide("h", d ? d.height / 2 : 0); } },
    { label: t("newVerticalGuide"), action: () => { const d = useEditorStore.getState().doc; e?.createGuide("v", d ? d.width / 2 : 0); } },
    { separator: true, label: "" },
    { label: t("clearGuides"), disabled: state.guides.length === 0, action: () => e?.clearAllGuides() },
  ];

  return [
    [
      {
        label: t("file"),
        submenu: [
          { label: t("newProject"), shortcut: sc("file.new"), icon: "new", action: () => e?.requestNewDocument() },
          { label: t("open"), shortcut: sc("file.open"), icon: "open", action: () => void e?.openProject() },
          { label: t("openRecent"), icon: "recent", submenu: recentItems },
          { label: t("importSubmenu"), icon: "import", submenu: importItems },
          { separator: true, label: "" },
          { label: t("save"), shortcut: sc("file.save"), icon: "save", disabled: !hasDoc, action: () => void e?.saveProject() },
          { label: t("saveAs"), shortcut: sc("file.saveAs"), icon: "saveAs", disabled: !hasDoc, action: () => void e?.saveProject({ asNew: true }) },
          { label: t("saveCopy"), icon: "saveCopy", disabled: !hasDoc, action: () => void e?.saveCopyProject() },
          { separator: true, label: "" },
          { label: t("export"), icon: "export", disabled: !hasDoc, submenu: exportItems },
          { label: t("exportAs"), shortcut: sc("file.exportAs"), icon: "exportAs", disabled: !hasDoc, action: () => useEditorStore.getState().openDialog({ name: "export" }) },
          { separator: true, label: "" },
          { label: t("close"), shortcut: sc("file.close"), icon: "close", disabled: !hasDoc, action: () => void e?.closeDocument() },
          { label: t("closeAll"), icon: "closeAll", disabled: !hasDoc, action: () => e?.closeAllDocuments() },
          { label: t("documentInfo"), icon: "documentInfo", disabled: !hasDoc, action: () => useEditorStore.getState().openDialog({ name: "documentInfo" }) },
          { separator: true, label: "" },
          { label: t("print"), icon: "print", disabled: !hasDoc, action: () => useEditorStore.getState().openDialog({ name: "printNotice" }) },
          { label: t("preferences"), icon: "preferences", action: () => useEditorStore.getState().openDialog({ name: "preferences" }) },
          { label: t("exit"), icon: "exit", disabled: !isDesktop, title: isDesktop ? undefined : t("exitNotice"), action: () => useEditorStore.getState().openDialog({ name: "exitNotice" }) },
          { separator: true, label: "" },
          { label: t("recoverDocuments"), icon: "recovery", action: () => useEditorStore.getState().openDialog({ name: "recovery" }) },
        ],
      },
      {
        label: t("edit"),
        submenu: [
          { label: t("undo"), shortcut: "Ctrl+Z", action: () => e?.undo() },
          { label: t("redo"), shortcut: "Ctrl+Shift+Z", action: () => e?.redo() },
          { separator: true, label: "" },
          { label: t("cut"), shortcut: "Ctrl+X", action: () => e?.cutSelection() },
          { label: t("copy"), shortcut: "Ctrl+C", action: () => e?.copySelection() },
          { label: t("paste"), shortcut: "Ctrl+V", action: () => e?.pasteClipboard() },
          { label: t("delete"), shortcut: "Del", action: () => e?.deleteSelection() },
          { label: t("fill"), action: () => useEditorStore.getState().openDialog({ name: "fill" }) },
          { separator: true, label: "" },
          { label: t("selectAll"), shortcut: "Ctrl+A", action: () => e?.selectAll() },
          { label: t("deselect"), shortcut: "Ctrl+D", action: () => e?.deselect() },
        ],
      },
      {
        label: t("image"),
        submenu: [
          { label: t("imageSize"), disabled: !hasDoc, action: () => useEditorStore.getState().openDialog({ name: "imageSize" }) },
          { label: t("canvasSize"), disabled: !hasDoc, action: () => useEditorStore.getState().openDialog({ name: "canvasSize" }) },
          { separator: true, label: "" },
          { label: t("crop"), disabled: !hasDoc, action: () => e?.applyCropFromTool() },
          { separator: true, label: "" },
          { label: t("rotate90CW"), disabled: !hasDoc, action: () => e?.rotateDocument90(true) },
          { label: t("rotate90CCW"), disabled: !hasDoc, action: () => e?.rotateDocument90(false) },
          { separator: true, label: "" },
          { label: t("flipHorizontal"), disabled: !hasDoc, action: () => e?.flipDocument(true) },
          { label: t("flipVertical"), disabled: !hasDoc, action: () => e?.flipDocument(false) },
        ],
      },
      {
        label: t("layer"),
        submenu: [
          { label: t("newImageLayer"), action: () => {
            const doc = e?.doc(); if (!doc) return;
            e?.addLayer(createBlankImageLayer("Layer", doc.width, doc.height, "transparent"), "New Layer");
          }},
          { label: t("newTextLayer"), action: () => useEditorStore.setState({ tool: "text" }) },
          { label: t("newShapeLayer"), action: () => useEditorStore.setState({ tool: "shape" }) },
          { separator: true, label: "" },
          { label: t("duplicateLayer"), shortcut: "Ctrl+J", action: () => e?.duplicateSelected() },
          { label: t("rasterizeLayer"), action: () => e?.rasterizeSelected() },
          { label: t("adjustmentLayer"), action: () => useEditorStore.getState().openDialog({ name: "adjustment" }) },
          { separator: true, label: "" },
          { label: t("align"), submenu: [
            { label: t("alignLeft"), action: () => e?.alignLayers("left") },
            { label: t("alignHorizontalCenters"), action: () => e?.alignLayers("hcenter") },
            { label: t("alignRight"), action: () => e?.alignLayers("right") },
            { label: t("alignTop"), action: () => e?.alignLayers("top") },
            { label: t("alignVerticalCenters"), action: () => e?.alignLayers("vcenter") },
            { label: t("alignBottom"), action: () => e?.alignLayers("bottom") },
            { separator: true, label: "" },
            { label: t("distributeHorizontally"), action: () => e?.distributeLayers("h") },
            { label: t("distributeVertically"), action: () => e?.distributeLayers("v") },
          ]},
          { label: t("deleteLayer"), shortcut: "Ctrl+Shift+D", action: () => {
            const sel = useEditorStore.getState().selectedIds;
            if (sel.length) e?.deleteLayers(sel);
          }},
          { separator: true, label: "" },
          { label: t("mergeDown"), shortcut: "Ctrl+E", action: () => e?.mergeDown() },
          { label: t("flattenImage"), action: () => e?.flattenImage() },
          { separator: true, label: "" },
          { label: t("group"), shortcut: "Ctrl+G", action: () => e?.groupSelected() },
          { label: t("ungroup"), shortcut: "Ctrl+Shift+G", action: () => e?.ungroupSelected() },
        ],
      },
      {
        label: t("select"),
        submenu: [
          { label: t("all"), shortcut: "Ctrl+A", action: () => e?.selectAll() },
          { label: t("deselect"), shortcut: "Ctrl+D", action: () => e?.deselect() },
          { label: t("invert"), action: () => e?.invertSelection() },
          { separator: true, label: "" },
          { label: t("grow"), action: () => e?.growSelection() },
          { label: t("contract"), action: () => e?.contractSelection() },
          { label: t("feather"), action: () => e?.featherSelection() },
        ],
      },
      {
        label: t("adjust"),
        submenu: [
          { label: t("adjustments"), shortcut: "Ctrl+Alt+A", action: () => useEditorStore.getState().openDialog({ name: "adjustments" }) },
          { separator: true, label: "" },
          { label: t("levels"), shortcut: "Ctrl+L", action: () => useEditorStore.getState().openDialog({ name: "levels" }) },
          { label: t("curves"), shortcut: "Ctrl+M", action: () => useEditorStore.getState().openDialog({ name: "curves" }) },
          { separator: true, label: "" },
          { label: t("brightness"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "brightness", label: t("brightness") } }) },
          { label: t("contrast"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "contrast", label: t("contrast") } }) },
          { label: t("gamma"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "gamma", label: t("gamma") } }) },
          { label: t("saturation"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "saturation", label: t("saturation") } }) },
          { separator: true, label: "" },
          { label: t("exposure"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "exposure", label: t("exposure") } }) },
          { label: t("hue"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "hue", label: t("hue") } }) },
          { label: t("temperature"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "temperature", label: t("temperature") } }) },
        ],
      },
      {
        label: t("filter"),
        submenu: [
          {
            label: t("blur"),
            submenu: [
              { label: t("gaussianBlur"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "gaussianBlur", label: t("gaussianBlur") } }) },
              { label: t("meanBlur"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "meanBlur", label: t("meanBlur") } }) },
              { label: t("medianFilter"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "medianFilter", label: t("medianFilter") } }) },
            ],
          },
          {
            label: t("sharpen"),
            submenu: [
              { label: t("sharpen"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "sharpen", label: t("sharpen") } }) },
              { label: t("unsharpMask"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "unsharpMask", label: t("unsharpMask") } }) },
              { label: t("highBoost"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "highBoost", label: t("highBoost") } }) },
              { label: t("smartSharpen"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "smartSharpen", label: t("smartSharpen") } }) },
              { label: t("sharpenDetails"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "sharpenDetails", label: t("sharpenDetails") } }) },
              { label: t("edgeSharpen"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "edgeSharpen", label: t("edgeSharpen") } }) },
              { label: t("claritySharpen"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "claritySharpen", label: t("claritySharpen") } }) },
              { label: t("textureSharpen"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "textureSharpen", label: t("textureSharpen") } }) },
              { label: t("localContrastSharpen"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "localContrastSharpen", label: t("localContrastSharpen") } }) },
              { label: t("directionalSharpen"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "directionalSharpen", label: t("directionalSharpen") } }) },
              { label: t("focusSharpen"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "focusSharpen", label: t("focusSharpen") } }) },
            ],
          },
          {
            label: t("edgeDetection"),
            submenu: [
              { label: t("sobelEdge"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "sobelEdge", label: t("sobelEdge") } }) },
              { label: t("prewittEdge"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "prewittEdge", label: t("prewittEdge") } }) },
              { label: t("laplacianEdge"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "laplacianEdge", label: t("laplacianEdge") } }) },
              { label: t("cannyEdge"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "cannyEdge", label: t("cannyEdge") } }) },
              { separator: true, label: "" },
              { label: t("laplacian"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "laplacian", label: t("laplacian") } }) },
              { label: t("sobel"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "sobel", label: t("sobel") } }) },
              { label: t("prewitt"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "prewitt", label: t("prewitt") } }) },
            ],
          },
          {
            label: t("restoration"),
            submenu: [
              {
                label: t("noiseGeneration"),
                submenu: [
                  { label: t("gaussianNoise"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "noiseGeneration", label: t("noiseGeneration"), values: { noiseType: 0, amount: 15, variance: 25, seed: 0 } } }) },
                  { label: t("uniformNoise"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "noiseGeneration", label: t("noiseGeneration"), values: { noiseType: 1, amount: 25, variance: 25, seed: 0 } } }) },
                  { label: t("saltPepperNoise"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "noiseGeneration", label: t("noiseGeneration"), values: { noiseType: 2, saltProb: 3, pepperProb: 3, seed: 0 } } }) },
                ],
              },
              { label: t("arithmeticMean"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "arithmeticMean", label: t("arithmeticMean") } }) },
              { label: t("geometricMean"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "geometricMean", label: t("geometricMean") } }) },
              { label: t("contraHarmonicMean"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "contraHarmonicMean", label: t("contraHarmonicMean") } }) },
              { label: t("alphaTrimmedMean"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "alphaTrimmedMean", label: t("alphaTrimmedMean") } }) },
              { label: t("wienerFilter"), action: () => useEditorStore.getState().openDialog({ name: "effect", payload: { op: "wienerFilter", label: t("wienerFilter") } }) },
            ],
          },
          {
            label: t("morphoProcessingMenu"),
            submenu: [
              { label: t("morphoErosion"), action: () => useEditorStore.getState().openDialog({ name: "morphology", payload: { op: "morphoErosion" } }) },
              { label: t("morphoDilation"), action: () => useEditorStore.getState().openDialog({ name: "morphology", payload: { op: "morphoDilation" } }) },
              { label: t("morphoOpening"), action: () => useEditorStore.getState().openDialog({ name: "morphology", payload: { op: "morphoOpening" } }) },
              { label: t("morphoClosing"), action: () => useEditorStore.getState().openDialog({ name: "morphology", payload: { op: "morphoClosing" } }) },
              { label: t("morphoGradient"), action: () => useEditorStore.getState().openDialog({ name: "morphology", payload: { op: "morphoGradient" } }) },
              { label: t("morphoTopHat"), action: () => useEditorStore.getState().openDialog({ name: "morphology", payload: { op: "morphoTopHat" } }) },
              { label: t("morphoBlackHat"), action: () => useEditorStore.getState().openDialog({ name: "morphology", payload: { op: "morphoBlackHat" } }) },
              { label: t("morphoHitOrMiss"), action: () => useEditorStore.getState().openDialog({ name: "morphology", payload: { op: "morphoHitOrMiss" } }) },
              { label: t("morphoBoundary"), action: () => useEditorStore.getState().openDialog({ name: "morphology", payload: { op: "morphoBoundary" } }) },
              { label: t("morphoHoleFill"), action: () => useEditorStore.getState().openDialog({ name: "morphology", payload: { op: "morphoHoleFill" } }) },
              { label: t("morphoThinning"), action: () => useEditorStore.getState().openDialog({ name: "morphology", payload: { op: "morphoThinning" } }) },
              { label: t("morphoThickening"), action: () => useEditorStore.getState().openDialog({ name: "morphology", payload: { op: "morphoThickening" } }) },
              { label: t("morphoSkeleton"), action: () => useEditorStore.getState().openDialog({ name: "morphology", payload: { op: "morphoSkeleton" } }) },
              { label: t("morphoComponents"), action: () => useEditorStore.getState().openDialog({ name: "morphology", payload: { op: "morphoComponents" } }) },
              { label: t("morphoReconstruction"), action: () => useEditorStore.getState().openDialog({ name: "morphology", payload: { op: "morphoReconstruction" } }) },
            ],
          },
        ],
      },
      {
        label: t("view"),
        submenu: [
          { label: t("zoomIn"), shortcut: "Ctrl+=", action: () => runtime.canvas?.zoomAtVP({ x: 400, y: 300 }, 1.3) },
          { label: t("zoomOut"), shortcut: "Ctrl+-", action: () => runtime.canvas?.zoomAtVP({ x: 400, y: 300 }, 1 / 1.3) },
          { label: t("fitToScreen"), shortcut: "Ctrl+0", action: () => runtime.canvas?.fitToScreen() },
          { label: t("percentage100"), shortcut: "Ctrl+1", action: () => runtime.canvas?.zoom100() },
          { separator: true, label: "" },
          { label: t("panels"), submenu: panelItems },
          { separator: true, label: "" },
          { label: t("toggleGrid"), action: () => useEditorStore.getState().setGrid(!useEditorStore.getState().showGrid) },
          { label: t("gridSettings"), disabled: !hasDoc, action: () => useEditorStore.getState().openDialog({ name: "gridSettings" }) },
          { label: t("toggleRulers"), action: () => useEditorStore.getState().setRulers(!useEditorStore.getState().showRulers) },
          { label: t("snapping"), submenu: snapItems },
          { label: t("guides"), submenu: guideItems },
          { label: t("artboards"), submenu: artboardItems },
          { separator: true, label: "" },
          { label: t("beforeAfter"), shortcut: "Ctrl+Alt+B", action: () => useEditorStore.getState().setCompare(!useEditorStore.getState().compare) },
        ],
      },
      {
        label: t("ai"),
        submenu: [
          { label: t("aiPanel"), shortcut: "Ctrl+Shift+A", action: () => useEditorStore.getState().togglePanel("ai") },
          { separator: true, label: "" },
          { label: t("aiSettings"), action: () => useEditorStore.getState().openDialog({ name: "preferences" }) },
        ],
      },
      {
        label: t("product"),
        submenu: [
          { label: t("productImportImage"), action: () => openFile("image/*", (f) => { void runtime.engine.importProductFile(f); }) },
          { label: t("panelProduct"), action: () => useEditorStore.getState().togglePanel("product") },
        ],
      },
      {
        label: t("menu3d"),
        submenu: [
          { label: t("vpToggleWorkspace"), shortcut: "Ctrl+Shift+3", action: () => useEditorStore.getState().setView3d(!useEditorStore.getState().view3d) },
          { separator: true, label: "" },
          { label: t("vpAddObject"), action: () => useEditorStore.getState().openDialog({ name: "addPrimitive3d" }) },
          { label: t("vpAddLight"), action: () => useEditorStore.getState().openDialog({ name: "addLight3d" }) },
          { label: t("vpAddGroup"), action: () => addGroupToScene() },
          { label: t("vpImportModel"), action: () => useEditorStore.getState().openDialog({ name: "import3d" }) },
          { separator: true, label: "" },
          { label: t("vpRenderToLayer"), action: () => viewport3d()?.renderToLayer() },
          { label: t("vpAddLiveLayer"), action: () => viewport3d()?.addLiveLayer() },
          { label: t("vpExportPng"), action: () => viewport3d()?.exportPng() },
          { separator: true, label: "" },
          { label: t("panel3d"), action: () => useEditorStore.getState().togglePanel("3d") },
        ],
      },
      {
        label: t("help"),
        submenu: [
          { label: t("userGuide"), icon: "documentInfo", action: () => useEditorStore.getState().openDialog({ name: "userGuide" }) },
          { label: t("keyboardShortcuts"), action: () => useEditorStore.getState().openDialog({ name: "shortcuts" }) },
          { label: t("about"), action: () => useEditorStore.getState().openDialog({ name: "about" }) },
        ],
      },
    ],
  ];
}

function openFile(accept: string, cb: (f: File) => void): void {
  const input = document.createElement("input");
  input.type = "file";
  input.accept = accept;
  input.onchange = () => { if (input.files?.[0]) cb(input.files[0]); };
  input.click();
}

// Helper to render menu items with translated labels
function renderMenuItems(items: MenuItem[]): ReactNode {
  return items.map((item, j) =>
    item.separator ? (
      <div key={`sep-${j}`} className="vs-menu-sep" role="separator" />
    ) : item.submenu ? (
      <div
        key={item.label}
        className="vs-menu-item-sub has-submenu"
        role="menuitem"
        aria-haspopup="menu"
        tabIndex={-1}
        title={item.title}
        onClick={(ev) => {
          ev.stopPropagation();
          const first = ev.currentTarget.querySelector<HTMLElement>(".vs-menu-dropdown .vs-menu-item-sub:not(.disabled)");
          first?.focus();
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === "ArrowRight" || e.key === " ") {
            e.preventDefault();
            const first = e.currentTarget.querySelector<HTMLElement>(".vs-menu-dropdown .vs-menu-item-sub:not(.disabled)");
            first?.focus();
          } else if (e.key === "ArrowLeft" || e.key === "Escape") {
            e.preventDefault();
            const owner = e.currentTarget.closest<HTMLElement>(".vs-menu-dropdown")?.closest<HTMLElement>(".vs-menu-item-sub");
            if (owner) owner.focus();
            else (e.currentTarget.closest(".vs-menu-item") as HTMLElement | null)?.focus();
          }
        }}
      >
        <FileIcon name={item.icon} />
        <span className="vs-menu-item-label">{item.label}</span>
        <span className="submenu-arrow">▼</span>
        <div className="vs-menu-dropdown vs-menu-dropdown-sub" role="menu">
          {renderMenuItems(item.submenu)}
        </div>
      </div>
    ) : (
      <div
        key={item.label}
        className={`vs-menu-item-sub ${item.disabled ? "disabled" : ""}`}
        role="menuitem"
        tabIndex={-1}
        title={item.title}
        aria-disabled={item.disabled || undefined}
        onClick={() => {
          if (!item.disabled) {
            item.action?.();
          }
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            if (!item.disabled) {
              item.action?.();
            }
          } else if (e.key === "ArrowLeft" || e.key === "Escape") {
            e.preventDefault();
            const owner = e.currentTarget.closest<HTMLElement>(".vs-menu-dropdown")?.closest<HTMLElement>(".vs-menu-item-sub");
            if (owner) owner.focus();
            else (e.currentTarget.closest(".vs-menu-item") as HTMLElement | null)?.focus();
          }
        }}
        style={item.disabled ? { opacity: 0.4, pointerEvents: "none" } : undefined}
      >
        <FileIcon name={item.icon} />
        <span className="vs-menu-item-label">{item.label}</span>
        {item.shortcut && <span className="shortcut">{item.shortcut}</span>}
      </div>
    )
  );
}

export function MenuBar() {
  const [openIdx, setOpenIdx] = useState<number | null>(null);
  const ref = useRef<HTMLDivElement>(null);
  const menus = buildMenu();
  const brandIconUrl = `${import.meta.env.BASE_URL}icons/viston-ms.svg`;

  return (
    <div className="vs-menubar" ref={ref} role="menubar" aria-label={t("mainMenu")}>
      <button
        type="button"
        className="vs-app-logo-btn"
        role="menuitem"
        aria-label="VISTON Studio"
        title={t("about")}
        onClick={() => {
          setOpenIdx(null);
          useEditorStore.getState().openDialog({ name: "about" });
        }}
      >
        <img src={brandIconUrl} alt="" width={22} height={22} draggable={false} />
      </button>
      {menus[0]!.map((menu, i) => (
        <div
          key={menu.label}
          className={`vs-menu-item ${openIdx === i ? "active" : ""}`}
          role="menuitem"
          tabIndex={0}
          aria-expanded={openIdx === i}
          onPointerDown={(e) => {
            e.stopPropagation();
            setOpenIdx(openIdx === i ? null : i);
          }}
          onPointerEnter={() => { if (openIdx !== null) setOpenIdx(i); }}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              setOpenIdx(openIdx === i ? null : i);
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setOpenIdx(i);
              requestAnimationFrame(() => {
                const first = ref.current?.querySelector(".vs-menu-dropdown .vs-menu-item-sub") as HTMLElement | null;
                first?.focus();
              });
            }
            if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
              e.preventDefault();
              const len = menus[0]!.length;
              const next = (i + (e.key === "ArrowRight" ? 1 : -1) + len) % len;
              setOpenIdx(openIdx === i ? next : i);
              const itemEls = ref.current?.querySelectorAll<HTMLElement>(".vs-menu-item");
              itemEls?.[next]?.focus();
            }
          }}
        >
          {menu.label}
          {openIdx === i && menu.submenu && (
            <div className="vs-menu-dropdown" role="menu" onPointerDown={(e) => e.stopPropagation()}>
              {renderMenuItems(menu.submenu)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
