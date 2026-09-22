import { create } from "zustand";
import { EditorDocument } from "../editor/core/document";
import type { Layer } from "../editor/core/types";
import type { RecentProject, EditorPreferences } from "../editor/project/projectStorage";
import type { AISettings, AIJob, AIResult } from "../ai/types";
import { loadAiSettings, persistAiSettings } from "../ai/services/AISettingsStore";
import type { Scene3D } from "../3d/types/types3d";
import type { Artboard } from "../editor/core/artboards";
import { DEFAULT_GRID_SETTINGS, type GridSettings } from "../editor/core/gridSettings";

export type ToolId =
  | "move"
  | "selection"
  | "crop"
  | "brush"
  | "pencil"
  | "eraser"
  | "bucket"
  | "eyedropper"
  | "clone"
  | "heal"
  | "dodge"
  | "burn"
  | "smudge"
  | "text"
  | "shape"
  | "pen"
  | "hand"
  | "zoom"
  | "gradient";

export interface BrushOptions {
  size: number;
  opacity: number;
  hardness: number;
  spacing: number;
  flow: number;
  dynamics: number;
  scatter: number;
  color: string;
}

export interface CropOptions {
  aspect: "free" | "1:1" | "4:3" | "3:2" | "16:9" | "16:10" | "5:7";
}

export interface TextToolOptions {
  fontFamily: string;
  fontSize: number;
  fontWeight: number;
  fontStyle: "normal" | "italic";
  color: string;
  align: "left" | "center" | "right";
  direction: "ltr" | "rtl";
  letterSpacing: number;
}

export interface ShapeOptions {
  kind: "rect" | "ellipse" | "line" | "arrow" | "roundedRect" | "polygon" | "star";
  fill: string;
  stroke: string;
  strokeWidth: number;
  cornerRadius: number;
  points: number;
  starRatio: number;
}

export interface SelectionOptions {
  mode: "replace" | "add" | "subtract" | "intersect";
  shape: "rect" | "ellipse" | "lasso";
  useWand: boolean;
  tolerance: number;
}

export interface GradientOptions {
  kind: "linear" | "radial";
  colorStart: string;
  colorEnd: string;
}

export interface PencilOptions {
  size: number;
  opacity: number;
  spacing: number;
  color: string;
}

export interface BucketOptions {
  tolerance: number;
}

export interface CloneOptions {
  size: number;
  opacity: number;
  spacing: number;
}

export interface HealOptions {
  size: number;
  opacity: number;
  spacing: number;
}

export interface DodgeOptions {
  size: number;
  strength: number;
  spacing: number;
}

export interface BurnOptions {
  size: number;
  strength: number;
  spacing: number;
}

export interface SmudgeOptions {
  size: number;
  strength: number;
  spacing: number;
}

export interface PenOptions {
  fill: string;
  stroke: string;
  strokeWidth: number;
}

export interface ToolOptions {
  brush: BrushOptions;
  pencil: PencilOptions;
  bucket: BucketOptions;
  clone: CloneOptions;
  heal: HealOptions;
  dodge: DodgeOptions;
  burn: BurnOptions;
  smudge: SmudgeOptions;
  pen: PenOptions;
  crop: CropOptions;
  text: TextToolOptions;
  shape: ShapeOptions;
  selection: SelectionOptions;
  gradient: GradientOptions;
}

export interface CursorInfo {
  x: number;
  y: number;
  rgb: { r: number; g: number; b: number; a: number } | null;
}

export type DialogName =
  | "newProject"
  | "export"
  | "fill"
  | "imageSize"
  | "canvasSize"
  | "effect"
  | "adjustments"
  | "curves"
  | "levels"
  | "adjustment"
  | "textEdit"
  | "pathEdit"
  | "shortcuts"
  | "about"
  | "userGuide"
  | "preferences"
  | "unsavedChanges"
  | "recovery"
  | "addPrimitive3d"
  | "addLight3d"
  | "import3d"
  | "documentInfo"
  | "printNotice"
  | "exitNotice"
  | "morphology"
  | "gridSettings"
  | "artboard";

export interface DialogState {
  name: DialogName;
  payload?: Record<string, unknown>;
}

export interface PendingDocAction {
  kind: "new" | "open" | "close" | "closeAll";
  docKey?: string;
}

export interface OpenTabInfo {
  key: string;
  name: string;
  dirty: boolean;
}

export interface HistoryViewItem {
  id: number;
  name: string;
  bytes: number;
  thumb: string | null;
}

export type PanelId = "layers" | "properties" | "history" | "histogram" | "ai" | "3d" | "product" | "swatches";

export interface Guide {
  id: string;
  orientation: "h" | "v";
  position: number;
}

const SWATCHES_KEY = "vs-swatches-v1";

export function loadSwatches(): string[] {
  try {
    const raw = localStorage.getItem(SWATCHES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as string[];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((c) => typeof c === "string" && /^#[0-9a-fA-F]{6}$/.test(c));
  } catch {
    return [];
  }
}

export function persistSwatches(swatches: string[]): void {
  try {
    localStorage.setItem(SWATCHES_KEY, JSON.stringify(swatches));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

const UI_STATE_KEY = "vs-ui-state-v1";

interface PersistedUiState {
  panels?: Record<PanelId, boolean>;
  panelWidth?: number;
  panelCollapsed?: Record<PanelId, boolean>;
}

export function loadUiState(): PersistedUiState {
  try {
    const raw = localStorage.getItem(UI_STATE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as PersistedUiState;
    return typeof parsed === "object" && parsed !== null ? parsed : {};
  } catch {
    return {};
  }
}

export function persistUiState(patch: PersistedUiState): void {
  const current = loadUiState();
  const merged = { ...current, ...patch };
  try {
    localStorage.setItem(UI_STATE_KEY, JSON.stringify(merged));
  } catch {
    /* storage unavailable â€” non-fatal */
  }
}

export interface PanelLayout {
  visible: Record<PanelId, boolean>;
  width: number;
  collapsed: Record<PanelId, boolean>;
}

export const DEFAULT_PANEL_WIDTH = 264;
export const MIN_PANEL_WIDTH = 170;
export const MAX_PANEL_WIDTH = 520;

const uiState = loadUiState();
const initialPanels: Record<PanelId, boolean> = { layers: true, properties: true, history: true, histogram: true, ai: true, "3d": true, product: false, swatches: false };
const initialCollapsed: Record<PanelId, boolean> = { layers: false, properties: false, history: false, histogram: false, ai: false, "3d": false, product: false, swatches: false };

export interface EditorState {
  projectName: string;
  dirty: boolean;
  doc: EditorDocument | null;
selectedIds: string[];
    tool: ToolId;
    toolOptions: ToolOptions;
    editingMaskId: string | null;
  zoomDisplay: number;
  showGrid: boolean;
  showRulers: boolean;
  snapToGrid: boolean;
  snapToGuides: boolean;
  snapToLayers: boolean;
  snapToCenter: boolean;
  snapToEdges: boolean;
  snapToArtboards: boolean;
  showGuides: boolean;
  guides: Guide[];
  gridSettings: GridSettings;
  artboards: Artboard[];
  activeArtboardId: string | null;
  swatches: string[];
  panels: Record<PanelId, boolean>;
  panelWidth: number;
  panelCollapsed: Record<PanelId, boolean>;
status: string;
    cursor: CursorInfo | null;
    dialog: DialogState | null;
    historyItems: HistoryViewItem[];
    historyIndex: number;
    busy: boolean;
    lastError: string | null;

    savedPath: string | null;
    savedName: string | null;
    lastSavedAt: number | null;
    openTabs: OpenTabInfo[];
    activeKey: string | null;
    pendingDocAction: PendingDocAction | null;
    language: "en" | "ar";
    preferences: EditorPreferences;
    recentProjects: RecentProject[];

    aiJobs: AIJob[];
    aiSettings: AISettings;
    aiLastResult: AIResult | null;

    view3d: boolean;
    compare: boolean;
    scenes3D: Scene3D[];
    activeSceneId: string | null;
    selected3DIds: string[];

  setDoc: (doc: EditorDocument | null) => void;
  setSelected: (ids: string[]) => void;
  toggleSelected: (id: string) => void;
  clearSelected: () => void;
  selectTopAtPoint: (x: number, y: number) => void;
  setMaskEditing: (id: string | null) => void;
  setTool: (tool: ToolId) => void;
  setToolOption: <K extends keyof ToolOptions>(key: K, patch: Partial<ToolOptions[K]>) => void;
  setZoomDisplay: (z: number) => void;
  setStatus: (msg: string) => void;
  setCursor: (cursor: CursorInfo | null) => void;
  setGrid: (v: boolean) => void;
  setRulers: (v: boolean) => void;
  setShowGuides: (v: boolean) => void;
  addGuide: (orientation: "h" | "v", position: number) => string;
  moveGuide: (id: string, position: number) => void;
  removeGuide: (id: string) => void;
  clearGuides: () => void;
  setGuides: (guides: Guide[]) => void;
  setGridSettings: (patch: Partial<GridSettings>) => void;
  setArtboards: (artboards: Artboard[]) => void;
  addArtboard: (ab: Artboard) => void;
  updateArtboard: (id: string, patch: Partial<Artboard>) => void;
  removeArtboard: (id: string) => void;
  setActiveArtboard: (id: string | null) => void;
  setSnapToGuides: (v: boolean) => void;
  setSnapToLayers: (v: boolean) => void;
  setSnapToCenter: (v: boolean) => void;
  setSnapToEdges: (v: boolean) => void;
  setSnapToArtboards: (v: boolean) => void;
  addSwatch: (color: string) => void;
  removeSwatch: (color: string) => void;
  setSwatches: (swatches: string[]) => void;
setSnapToGrid: (v: boolean) => void;
    togglePanel: (p: PanelId) => void;
    setPanel: (p: PanelId, v: boolean) => void;
    setPanelWidth: (w: number) => void;
    setPanelCollapsed: (p: PanelId, v: boolean) => void;
    togglePanelCollapsed: (p: PanelId) => void;
    openDialog: (d: DialogState) => void;
    closeDialog: () => void;
    setLanguage: (lang: "en" | "ar") => void;
  setHistoryView: (items: HistoryViewItem[], index: number) => void;
  setBusy: (busy: boolean) => void;
  setLastError: (err: string | null) => void;
  setProjectName: (name: string) => void;
  setDirty: (dirty: boolean) => void;
  setSavedState: (patch: { path?: string | null; name?: string | null; at?: number | null }) => void;
  setOpenTabs: (tabs: OpenTabInfo[]) => void;
  setPendingDocAction: (action: PendingDocAction | null) => void;
  setPreferences: (prefs: EditorPreferences) => void;
  setRecentProjects: (list: RecentProject[]) => void;
  setAiJobState: (jobs: AIJob[]) => void;
  setAiResult: (result: AIResult | null) => void;
  setAiSettings: (patch: Partial<AISettings>) => void;
  setView3d: (v: boolean) => void;
    setCompare: (v: boolean) => void;
  setScenes3D: (scenes: Scene3D[], activeSceneId: string | null) => void;
  setActiveScene3D: (id: string | null) => void;
  setSelected3D: (ids: string[]) => void;
  toggleSelected3D: (id: string) => void;
}

const DEFAULT_TOOL_OPTIONS: ToolOptions = {
  brush: {
    size: 24,
    opacity: 1,
    hardness: 0.7,
    spacing: 0.12,
    flow: 1,
    dynamics: 0,
    scatter: 0,
    color: "#000000",
  },
  crop: { aspect: "free" },
  text: {
    fontFamily: "Arial",
    fontSize: 48,
    fontWeight: 400,
    fontStyle: "normal",
    color: "#222222",
    align: "center",
    direction: "ltr",
    letterSpacing: 0,
  },
  shape: {
    kind: "rect",
    fill: "#4f8cff",
    stroke: "#222222",
    strokeWidth: 2,
    cornerRadius: 0,
    points: 5,
    starRatio: 0.4,
  },
  selection: { mode: "replace", shape: "rect", useWand: false, tolerance: 16 },
  gradient: { kind: "linear", colorStart: "#ffffff", colorEnd: "#000000" },
  pencil: { size: 4, opacity: 1, spacing: 0.12, color: "#000000" },
  bucket: { tolerance: 32 },
  clone: { size: 40, opacity: 1, spacing: 0.15 },
  heal: { size: 40, opacity: 1, spacing: 0.15 },
  dodge: { size: 60, strength: 0.5, spacing: 0.15 },
  burn: { size: 60, strength: 0.5, spacing: 0.15 },
  smudge: { size: 60, strength: 0.5, spacing: 0.15 },
  pen: { fill: "transparent", stroke: "#222222", strokeWidth: 3 },
};

export const useEditorStore = create<EditorState>((set, get) => ({
  projectName: "Untitled",
  dirty: false,
  doc: null,
  selectedIds: [],
  tool: "move",
  toolOptions: DEFAULT_TOOL_OPTIONS,
  zoomDisplay: 1,
  showGrid: false,
  showRulers: true,
  snapToGrid: false,
  snapToGuides: false,
  snapToLayers: false,
  snapToCenter: false,
  snapToEdges: false,
  snapToArtboards: false,
  showGuides: true,
  guides: [],
  gridSettings: { ...DEFAULT_GRID_SETTINGS },
  artboards: [],
  activeArtboardId: null,
  swatches: loadSwatches(),
  panels: { ...initialPanels, ...(uiState.panels ?? {}) },
  panelWidth: Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, uiState.panelWidth ?? DEFAULT_PANEL_WIDTH)),
  panelCollapsed: { ...initialCollapsed, ...(uiState.panelCollapsed ?? {}) },
  status: "Ready",
  cursor: null,
  dialog: null,
  historyItems: [],
  historyIndex: -1,
  busy: false,
  lastError: null,
  editingMaskId: null,

  savedPath: null,
  savedName: null,
  lastSavedAt: null,
  openTabs: [],
  activeKey: null,
  pendingDocAction: null,
  preferences: { autosaveEnabled: true, autosaveIntervalSec: 120, defaultDpi: 96, three3D: { defaultDisplayMode: "material", snapSize: 0.1, gridVisible: true, axesVisible: true, antialias: true } },
  recentProjects: [],
  language: "en",

  aiJobs: [],
  aiSettings: loadAiSettings(),
  aiLastResult: null,

  view3d: false,
  compare: false,
  scenes3D: [],
  activeSceneId: null,
  selected3DIds: [],

  setDoc: (doc) => set({ doc }),
  setSelected: (ids) => set({ selectedIds: ids }),
  toggleSelected: (id) => {
    const cur = get().selectedIds;
    if (cur.includes(id)) set({ selectedIds: cur.filter((i) => i !== id) });
    else set({ selectedIds: [...cur, id] });
  },
  clearSelected: () => set({ selectedIds: [] }),
  setMaskEditing: (id) => set({ editingMaskId: id }),
  selectTopAtPoint: (x, y) => {
    const doc = get().doc;
    if (!doc) return;
    for (let i = doc.layers.length - 1; i >= 0; i--) {
      const l = doc.layers[i];
      if (l.type === "group") continue;
      if (!l.visible) continue;
      const t = l.transform;
      const corners: Array<[number, number]> = [
        [-0.5, -0.5],
        [t.width + 0.5, -0.5],
        [t.width + 0.5, t.height + 0.5],
        [-0.5, t.height + 0.5],
      ];
      const rad = (t.rotation * Math.PI) / 180;
      const cos = Math.cos(rad);
      const sin = Math.sin(rad);
      const inside = corners.every(([cx, cy]) => {
        const px = t.x + cx * cos - cy * sin;
        const py = t.y + cx * sin + cy * cos;
        return px <= x + 8 && px >= x - 8 && py <= y + 8 && py >= y - 8;
      });
      const inBox = x >= t.x && x <= t.x + t.width && y >= t.y && y <= t.y + t.height;
      if (inside || inBox) {
        set({ selectedIds: [l.id] });
        return;
      }
    }
    set({ selectedIds: [] });
  },
  setTool: (tool) => set({ tool }),
  setToolOption: (key, patch) =>
    set((s) => ({
      toolOptions: { ...s.toolOptions, [key]: { ...s.toolOptions[key], ...patch } },
    })),
  setZoomDisplay: (z) => set({ zoomDisplay: z }),
  setStatus: (msg) => set({ status: msg }),
  setCursor: (cursor) => set({ cursor }),
setGrid: (showGrid) => set({ showGrid }),
  setRulers: (showRulers) => set({ showRulers }),
  setShowGuides: (showGuides) => set({ showGuides }),
  addGuide: (orientation, position) => {
      const id = `guide-${Date.now()}-${Math.floor(Math.random() * 1e6)}`;
      set((s) => ({ guides: [...s.guides, { id, orientation, position: Math.round(position) }] }));
      return id;
    },
  moveGuide: (id, position) =>
    set((s) => ({ guides: s.guides.map((g) => (g.id === id ? { ...g, position: Math.round(position) } : g)) })),
  removeGuide: (id) =>
    set((s) => ({ guides: s.guides.filter((g) => g.id !== id) })),
  clearGuides: () => set({ guides: [] }),
  setGuides: (guides) => set({ guides }),
  setGridSettings: (patch) =>
    set((s) => {
      const gridSettings = { ...s.gridSettings, ...patch };
      if (typeof gridSettings.spacing === "number") gridSettings.spacing = Math.max(2, Math.round(gridSettings.spacing));
      if (typeof gridSettings.subdivisions === "number") gridSettings.subdivisions = Math.min(32, Math.max(1, Math.round(gridSettings.subdivisions)));
      return { gridSettings };
    }),
  setArtboards: (artboards) => set({ artboards }),
  addArtboard: (ab) => set((s) => ({ artboards: [...s.artboards, ab], activeArtboardId: ab.id })),
  updateArtboard: (id, patch) =>
    set((s) => ({ artboards: s.artboards.map((a) => (a.id === id ? { ...a, ...patch } : a)) })),
  removeArtboard: (id) =>
    set((s) => ({
      artboards: s.artboards.filter((a) => a.id !== id),
      activeArtboardId: s.activeArtboardId === id ? null : s.activeArtboardId,
    })),
  setActiveArtboard: (activeArtboardId) => set({ activeArtboardId }),
  setSnapToGuides: (snapToGuides) => set({ snapToGuides }),
  setSnapToLayers: (snapToLayers) => set({ snapToLayers }),
  setSnapToCenter: (snapToCenter) => set({ snapToCenter }),
  setSnapToEdges: (snapToEdges) => set({ snapToEdges }),
  setSnapToArtboards: (snapToArtboards) => set({ snapToArtboards }),
  addSwatch: (color) =>
    set((s) => {
      if (!/^#[0-9a-fA-F]{6}$/.test(color)) return s;
      const next = s.swatches.includes(color.toLowerCase()) ? s.swatches : [...s.swatches, color.toLowerCase()];
      persistSwatches(next);
      return { swatches: next };
    }),
  removeSwatch: (color) =>
    set((s) => {
      const next = s.swatches.filter((c) => c !== color);
      persistSwatches(next);
      return { swatches: next };
    }),
  setSwatches: (swatches) => {
    const next = swatches.filter((c) => /^#[0-9a-fA-F]{6}$/.test(c));
    persistSwatches(next);
    set({ swatches: next });
  },
setSnapToGrid: (snapToGrid) => set({ snapToGrid }),
  togglePanel: (p) => {
    set((s) => {
      const visible = { ...s.panels, [p]: !s.panels[p] };
      persistUiState({ panels: visible });
      return { panels: visible };
    });
  },
  setPanel: (p, v) => {
    set((s) => {
      const visible = { ...s.panels, [p]: v };
      persistUiState({ panels: visible });
      return { panels: visible };
    });
  },
  setPanelWidth: (w) => {
    const width = Math.max(MIN_PANEL_WIDTH, Math.min(MAX_PANEL_WIDTH, Math.round(w)));
    set({ panelWidth: width });
    persistUiState({ panelWidth: width });
  },
  setPanelCollapsed: (p, v) => {
    set((s) => {
      const collapsed = { ...s.panelCollapsed, [p]: v };
      persistUiState({ panelCollapsed: collapsed });
      return { panelCollapsed: collapsed };
    });
  },
  togglePanelCollapsed: (p) => {
    set((s) => {
      const collapsed = { ...s.panelCollapsed, [p]: !s.panelCollapsed[p] };
      persistUiState({ panelCollapsed: collapsed });
      return { panelCollapsed: collapsed };
    });
  },
  openDialog: (dialog) => set({ dialog }),
  closeDialog: () => set({ dialog: null }),
  setLanguage: (language) => set({ language }),
  setHistoryView: (items, index) => set({ historyItems: items, historyIndex: index }),
  setBusy: (busy) => set({ busy }),
  setLastError: (lastError) => set({ lastError }),
  setProjectName: (projectName) => set({ projectName }),
  setDirty: (dirty) => set({ dirty }),
  setSavedState: (patch) =>
    set({
      savedPath: patch.path !== undefined ? patch.path : get().savedPath,
      savedName: patch.name !== undefined ? patch.name : get().savedName,
      lastSavedAt: patch.at !== undefined ? patch.at : get().lastSavedAt,
    }),
  setOpenTabs: (openTabs) => set({ openTabs }),
  setPendingDocAction: (pendingDocAction) => set({ pendingDocAction }),
  setPreferences: (preferences) => set({ preferences }),
  setRecentProjects: (recentProjects) => set({ recentProjects }),
  setAiJobState: (aiJobs) => set({ aiJobs }),
  setAiResult: (aiLastResult) => set({ aiLastResult }),
  setAiSettings: (patch) => set({ aiSettings: persistAiSettings(patch) }),
  setView3d: (view3d) => set({ view3d }),
  setCompare: (compare) => set({ compare }),
  setScenes3D: (scenes3D, activeSceneId) => set({ scenes3D, activeSceneId }),
  setActiveScene3D: (activeSceneId) => set({ activeSceneId }),
  setSelected3D: (selected3DIds) => set({ selected3DIds }),
  toggleSelected3D: (id) => {
    const cur = get().selected3DIds;
    if (cur.includes(id)) set({ selected3DIds: cur.filter((i) => i !== id) });
    else set({ selected3DIds: [...cur, id] });
  },
}));

export function selectedLayers(state: EditorState): Layer[] {
  if (!state.doc) return [];
  return state.doc.layers.filter((l) => state.selectedIds.includes(l.id));
}

export function topSelectedLayer(state: EditorState): Layer | undefined {
  if (!state.doc) return undefined;
  const ids = state.selectedIds;
  for (let i = state.doc.layers.length - 1; i >= 0; i--) {
    if (ids.includes(state.doc.layers[i].id)) return state.doc.layers[i];
  }
  return undefined;
}
