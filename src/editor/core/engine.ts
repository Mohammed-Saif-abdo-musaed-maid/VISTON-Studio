import { useEditorStore, type Guide } from "../../state/store";
import { EditorDocument, pixelStore, maskStore } from "./document";
import { HistoryManager, HistoryEntry } from "./history";
import { runtime } from "./runtime";
import { selectionEngine } from "../selection/selectionEngine";
import { processingEngine } from "../processing/processingEngine";
import { ProcessOp, ProcessParams, Adjustments, analyzeConnectedComponents, binaryFromLuminanceThreshold, MorphoComponentStats } from "../processing/processor";
import {
  Layer,
  LayerTransform,
  PathPoint,
  ShapeLayer,
  ShapeKind,
  TextLayer,
  ImageLayer,
  AdjustmentKind,
  AdjustmentParams,
  ADJUSTMENT_LABELS,
  is3DDLayer,
  ProductLightingValues,
  ProductCompositeMetadata,
  ProductShadowMetadata,
  emptyProductLighting,
} from "./types";
import type { AISelection } from "../../ai/types";
import {
  applyProductLighting as pipelineLighting,
  createContactShadowCanvas,
  createReflectionCanvas,
  maskCanvasFromAiSelection,
  refineMaskCanvas,
  suggestColorMatch,
  analyzeBackgroundLocal,
  warpPerspective,
  MaskRefineSettings,
  ContactShadowSettings,
  ReflectionSettings,
} from "../product/productPipeline";
import type { Scene3D } from "../../3d/types/types3d";
import { traceShapePath } from "../renderer/shapeRenderer";
import {
  createBlankImageLayer,
  createImageLayerFromCanvas,
  createGroupLayer,
  createTextLayer as factoryCreateTextLayer,
  createShapeLayer as factoryCreateShapeLayer,
  createAdjustmentLayer as factoryCreateAdjustmentLayer,
  duplicateLayer as dupLayer,
} from "../layers/layerFactory";
import { compositeToCanvas, renderLayerToCanvas } from "../renderer/compositor";
import { createCanvas, getContext2d, decodeImageFileSafe, snapshotCanvas, restoreSnapshot } from "../../utils/canvas";
import { downscaleCanvas, COMPARE_MAX_REF_DIM } from "../compare/compareModel";
import { clamp } from "../../utils/math";
import { genId } from "../../utils/id";
import {
  createDocumentMeta,
  sanitizeDocumentName,
  clampDocumentDimension,
  updateMeta,
  DocumentMeta,
  DocumentRecord,
  DOCUMENT_SCHEMA_VERSION,
  DEFAULT_DOCUMENT_DPI,
  MAX_DOCUMENT_DIMENSION,
} from "./documentMeta";
import {
  buildProjectFile,
  stringifyProject,
  parseProjectText,
  buildDocumentFromProject,
  ProjectFile,
  ProjectMeta,
  ProjectLoadResult,
  ProjectParseResult,
  ProjectError,
  PROJECT_COMPAT_EXTS,
  EXT,
} from "../project/projectFormat";
import {
  captureDocScenes,
  activateDocScenesForKey,
  removeDocScenes,
  ensureDocHasScene,
  getDocScenes,
  setDocScenes,
} from "../../3d/core/sceneRegistry";
import { sanitizeScene3D } from "../../3d/core/sceneModel3d";
import { serializeImportsForProject, hydrateImportsFromProject, ensureImportGeometry, listImportEntries } from "../../3d/loading/importStore3d";
import {
  writeProjectText,
  pickProjectFile,
  getRecentProjects,
  addRecentProject,
  touchRecentProject,
  removeRecentProject,
  clearRecentProjects,
  getPreferences,
  setPreferences,
  setAutosaveSlot,
  deleteAutosaveSlot,
  listAutosaveSlots,
  autosaveSlotSize,
  EditorPreferences,
  RecentProject,
  AutosaveSlot,
} from "../project/projectStorage";
import { emptyExtras, sanitizeExtras, type DocumentExtras } from "./documentExtras";
import { artboardBounds, clampArtboardToDoc, findArtboardAt, makeArtboard, normalizeArtboardRect, type Artboard } from "./artboards";
import { gridStep } from "./gridSettings";
import { assertImportable } from "../import/importFormats";
import { snapMove, type SnapContext, type SnapLine, type SnapRect, type SnapSettings } from "../snap/snapEngine";
import { encodeCanvasToBlob, exportFormatExtension, exportFormatSupportsAlpha, type ExportFormat } from "../export/exportFormats";

export type EffectKind = ProcessOp;

export interface ExportOptions {
  format: ExportFormat;
  quality?: number;
  width?: number;
  height?: number;
  transparent?: boolean;
  baseName?: string;
  /** Optional file-name suffix (e.g. "selection", "layer-name"). */
  suffix?: string;
}

export interface ExportResult {
  ok: boolean;
  fileName?: string;
  error?: string;
}

function debounce<A extends unknown[]>(fn: (...a: A) => void, ms: number): (...a: A) => void {
  let t: number | undefined;
  return (...a: A) => { if (t) clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
}

let clipboardCanvas: HTMLCanvasElement | null = null;
let clipboardOriginX = 0;
let clipboardOriginY = 0;

function hexToRgb(color: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(color.trim());
  if (m) {
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  return [0, 0, 0];
}

function maskBorder(mask: Uint8ClampedArray, w: number, h: number): { x: number; y: number; width: number; height: number } {
  let minX = w, minY = h, maxX = -1, maxY = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (mask[y * w + x] > 0) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < minX || maxY < minY) return { x: 0, y: 0, width: 0, height: 0 };
  return { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
}

export function getClipboard(): HTMLCanvasElement | null { return clipboardCanvas; }

function layerSnapshot(l: Layer): Layer {
  const base: Layer = { ...l, transform: { ...l.transform } };
  if (base.type === "text") Object.assign(base, { ...l } as TextLayer, { transform: { ...l.transform } });
  if (base.type === "shape") Object.assign(base, { ...l } as ShapeLayer, { transform: { ...l.transform } });
  if (base.type === "image") Object.assign(base, { ...l } as ImageLayer, { transform: { ...l.transform } });
  if (base.type === "adjustment") Object.assign(base, { ...l }, { transform: { ...l.transform } });
  return base;
}

function layersSnapshot(layers: Layer[]): Layer[] {
  return layers.map(layerSnapshot);
}

/** What a morphological processing operation is applied to. */
export type MorphoTarget = "layer" | "mask" | "selection";

/** Coalesced undo/redo session for continuous layer meta edits (opacity slider, transform fields...). */
interface MetaSession {
  id: string;
  before: Layer;
  entryName: string;
  docKey: string | null;
  timer: ReturnType<typeof setTimeout> | undefined;
}

function clonePathData(pts: PathPoint[] | null | undefined): PathPoint[] {
  return (pts ?? []).map((p) => ({ x: p.x, y: p.y, inX: p.inX ?? 0, inY: p.inY ?? 0, outX: p.outX ?? 0, outY: p.outY ?? 0, smooth: !!p.smooth }));
}

export class EditorEngine {
  version = 0;
  private _uiFxApplied?: () => void;
  private _useLayerFx = true;
  private syncUiD = debounce(() => this.syncUiFast(), 50);

  get uiFxApplied() { return this._uiFxApplied; }
  set uiFxApplied(fn: (() => void) | undefined) { this._uiFxApplied = fn; }
  get useLayerFx() { return this._useLayerFx; }
  set useLayerFx(v: boolean) { this._useLayerFx = v; }

  // ── document registry ──
  private _records = new Map<string, DocumentRecord>();
  private _docs = new Map<string, EditorDocument>();
  private _managerByKey = new Map<string, HistoryManager>();
  private _activeKey: string | null = null;
  private _autosaveTimer: number | undefined;
  private _metaSession: MetaSession | null = null;

  get history(): HistoryManager {
    return this._activeManager();
  }

  private _activeManager(): HistoryManager {
    if (this._activeKey && this._managerByKey.has(this._activeKey)) {
      return this._managerByKey.get(this._activeKey)!;
    }
    const m = new HistoryManager({
      maxEntries: 200,
      maxBytes: 512 * 1024 * 1024,
      onChange: () => this.syncHistoryView(),
    });
    if (this._activeKey) this._managerByKey.set(this._activeKey, m);
    return m;
  }

  init(): void {
    this._records.clear();
    this._managerByKey.clear();
    this._activeKey = null;
    this.bootstrapPreferences();
    this.createNewDocument({ width: 1280, height: 800, background: "#ffffff", name: "Untitled" });
    this.ensureAutosaveTimer();
  }

  getRecords(): DocumentRecord[] {
    return Array.from(this._records.values());
  }

  getActiveRecord(): DocumentRecord | null {
    return this._activeKey ? this._records.get(this._activeKey) ?? null : null;
  }

  getActiveMeta(): DocumentMeta | null {
    return this.getActiveRecord()?.meta ?? null;
  }

  activeDocumentName(): string {
    return this.getActiveMeta()?.name ?? useEditorStore.getState().projectName ?? "Untitled";
  }

  getOpenTabKeys(): string[] {
    return Array.from(this._records.keys());
  }

  private syncTabs(): void {
    const tabs = this.getRecords().map((r) => ({ key: r.key, name: r.meta.name, dirty: r.dirty }));
    useEditorStore.setState({ openTabs: tabs });
    this.syncTitle();
  }

  private syncTitle(): void {
    const meta = this.getActiveMeta();
    const name = meta?.name ?? "Vision Studio";
    const dirty = this.getActiveRecord()?.dirty ?? false;
    try {
      document.title = `${name}${dirty ? " •" : ""} — Vision Studio`;
    } catch { /* noop */ }
  }

  private markDirty(): void {
    const rec = this.getActiveRecord();
    if (rec) {
      rec.dirty = true;
      rec.meta = updateMeta(rec.meta, { modifiedAt: Date.now() });
    }
    useEditorStore.setState({ dirty: true });
    this.syncTabs();
  }

  private markClean(): void {
    const rec = this.getActiveRecord();
    if (rec) {
      rec.dirty = false;
    }
    useEditorStore.setState({ dirty: false });
    this.syncTabs();
  }

  setDoc(doc: EditorDocument, name?: string): void {
    this.history.reset();
    this.version++;
    selectionEngine.clear();
    if (name) useEditorStore.setState({ projectName: name, dirty: false });
    useEditorStore.setState({ doc, selectedIds: [] });
    this.syncHistoryView();
    runtime.canvas?.resetCamera();
    runtime.canvas?.requestRender();
  }

  /**
   * Adopt an existing document object (from new/open/load) as a document.
   * Registers its record + history manager and makes it the active tab.
   */
  private _openDoc(
    doc: EditorDocument,
    meta: DocumentMeta,
    opts: {
      dirty?: boolean;
      savedPath?: string | null;
      savedName?: string;
      lastSavedAt?: number | null;
      selectedIds?: string[];
      savedSize?: number | null;
      extras?: DocumentExtras;
    } = {}
  ): void {
    const key = meta.id;
    if (this._activeKey && this._activeKey !== key) this.captureExtras(this._activeKey);
    let rec = this._records.get(key);
    if (!rec) {
      rec = {
        key,
        meta,
        savedPath: opts.savedPath ?? null,
        savedName: opts.savedName ?? meta.name,
        dirty: opts.dirty ?? false,
        lastSavedAt: opts.lastSavedAt ?? null,
        selectedIds: opts.selectedIds ?? [],
        savedSize: opts.savedSize ?? null,
        extras: opts.extras ?? emptyExtras(),
      };
      this._records.set(key, rec);
    } else {
      rec.meta = meta;
      rec.savedPath = opts.savedPath ?? rec.savedPath;
      rec.savedName = opts.savedName ?? rec.savedName;
      rec.dirty = opts.dirty ?? rec.dirty;
      rec.lastSavedAt = opts.lastSavedAt ?? rec.lastSavedAt;
      if (opts.savedSize !== undefined) rec.savedSize = opts.savedSize;
      if (opts.extras) rec.extras = opts.extras;
    }
    let manager = this._managerByKey.get(key);
    if (!manager) {
      manager = new HistoryManager({
        maxEntries: 200,
        maxBytes: 512 * 1024 * 1024,
        onChange: () => this.syncHistoryView(),
      });
      this._managerByKey.set(key, manager);
    } else {
      manager.reset();
    }
    this._activeKey = key;
    this._docs.set(key, doc);
    if (!this._origRefs.has(key)) {
      this.captureBeforeRef(key, doc);
    }
    this.version++;
    selectionEngine.clear();
    useEditorStore.setState({
      doc,
      projectName: meta.name,
      dirty: rec.dirty,
      selectedIds: [],
      savedPath: rec.savedPath,
      savedName: rec.savedName,
      lastSavedAt: rec.lastSavedAt,
      activeKey: key,
    });
    this.syncHistoryView();
    runtime.canvas?.resetCamera();
    runtime.canvas?.requestRender();
    this.syncTabs();
    activateDocScenesForKey(key);
    this.applyExtras(key);
  }

  /**
   * Persist the live guides/artboards/grid of the active document onto its
   * record so tab switches and saves capture the latest edits.
   */
  private captureExtras(key: string): void {
    const rec = this._records.get(key);
    if (!rec) return;
    const st = useEditorStore.getState();
    rec.extras = {
      guides: st.guides.map((g) => ({ ...g })),
      artboards: st.artboards.map((a) => ({ ...a })),
      grid: { ...st.gridSettings },
    };
  }

  /** Restore a document's guides/artboards/grid into the live store. */
  private applyExtras(key: string): void {
    const rec = this._records.get(key);
    const ex = rec?.extras ?? emptyExtras();
    useEditorStore.setState({
      guides: ex.guides.map((g) => ({ ...g })),
      artboards: ex.artboards.map((a) => ({ ...a })),
      gridSettings: { ...ex.grid },
      activeArtboardId: null,
    });
  }

  switchToDocument(key: string): void {
    // Capture the outgoing document's exact live state on the registry.
    if (this._activeKey && this._activeKey !== key) {
      const outgoing = useEditorStore.getState().doc;
      if (outgoing) this._docs.set(this._activeKey, outgoing);
      captureDocScenes(this._activeKey);
      this.captureExtras(this._activeKey);
    }
    const cur = this.getActiveRecord();
    if (cur && cur.key === key) return;
    const rec = this._records.get(key);
    if (!rec) return;
    const targetDoc = this._docs.get(key);
    if (!targetDoc) return;
    if (cur) {
      cur.selectedIds = useEditorStore.getState().selectedIds;
    }
    this._activeKey = key;
    useEditorStore.setState({
      doc: targetDoc,
      projectName: rec.meta.name,
      dirty: rec.dirty,
      selectedIds: rec.selectedIds,
      savedPath: rec.savedPath,
      savedName: rec.savedName,
      lastSavedAt: rec.lastSavedAt,
      activeKey: key,
    });
    this.version++;
    selectionEngine.clear();
    this.syncHistoryView();
    runtime.canvas?.resetCamera();
    runtime.canvas?.requestRender();
    this.syncTabs();
    activateDocScenesForKey(key);
    this.applyExtras(key);
  }

  async closeDocument(key?: string): Promise<void> {
    const target = key && this._records.has(key) ? key : this._activeKey;
    if (!target) return;
    const rec = this._records.get(target);
    if (rec?.dirty) {
      this.ensureUnsavedConfirmation({ kind: "close", docKey: target });
      return;
    }
    this._doClose(target);
  }

  private _doClose(key: string): void {
    const rec = this._records.get(key);
    if (!rec) return;
    removeDocScenes(key);
    // Cleanup: drop pixel data that is not used by any remaining document.
    const remainingImages = new Set<string>();
    const collectImageIds = (layers: readonly Layer[]): void => {
      for (const l of layers) {
        if (l.type === "image" || is3DDLayer(l)) remainingImages.add((l as { imageId: string }).imageId);
      }
    };
    for (const [k] of this._records) {
      if (k === key) continue;
      const other = this._docs.get(k) ?? (k === this._activeKey ? this.doc() : null);
      if (other) collectImageIds(other.layers);
    }
    const closed = key === this._activeKey ? this.doc() : this._docs.get(key);
    if (closed) {
      for (const l of closed.layers) {
        if ((l.type === "image" || is3DDLayer(l)) && !remainingImages.has((l as { imageId: string }).imageId)) pixelStore.delete((l as { imageId: string }).imageId);
      }
    }
    const wasActive = this._activeKey === key;
    deleteAutosaveSlot(rec.meta.id);
    this._records.delete(key);
    this._docs.delete(key);
    this._managerByKey.delete(key);
    this._origRefs.delete(key);
    const keys = this.getOpenTabKeys();
    if (wasActive) {
      useEditorStore.setState({ doc: null });
      if (keys.length > 0) {
        this.switchToDocument(keys[keys.length - 1]);
      } else {
        void this.createNewDocument({ width: 1280, height: 800, background: "#ffffff", name: "Untitled" });
      }
    } else {
      this.syncTabs();
    }
    useEditorStore.setState({ status: `Closed ${rec.meta.name}.` });
  }

  /**
   * File → Close All. Closes every open document. When any document has
   * unsaved changes, a single honest confirmation is shown for the first
   * dirty document before all tabs are closed; nothing is ever discarded
   * silently.
   */
  closeAllDocuments(): void {
    const keys = this.getOpenTabKeys();
    if (keys.length === 0) return;
    const dirtyKey = keys.find((k) => this._records.get(k)?.dirty);
    if (dirtyKey) {
      if (this._activeKey !== dirtyKey) this.switchToDocument(dirtyKey);
      const rec = this._records.get(dirtyKey);
      this.ensureUnsavedConfirmation({ kind: "closeAll", docKey: dirtyKey });
      if (rec) useEditorStore.setState({ status: `Close All: "${rec.meta.name}" has unsaved changes.` });
      return;
    }
    this._doCloseAll();
  }

  private _doCloseAll(): void {
    const keys = this.getOpenTabKeys();
    for (const key of keys) this._doClose(key);
    useEditorStore.setState({ status: keys.length > 1 ? `Closed ${keys.length} documents.` : "Closed document." });
  }

  private _docSnapshotFor(key: string): EditorDocument | null {
    return key === this._activeKey ? this.doc() : this._docs.get(key) ?? null;
  }

  /**
   * 3D (Phase 12): after opening or recovering a project, restore its scenes
   * and imported model assets into the per-document registry + import store.
   */
  private hydrate3DAfterOpen(file: ProjectFile): void {
    const key = file.meta.id;
    const rawScenes = Array.isArray(file.scenes) ? file.scenes : [];
    const scenes3D: Scene3D[] = [];
    for (let i = 0; i < rawScenes.length; i++) {
      const sc = sanitizeScene3D(rawScenes[i], `scene-d${Date.now().toString(36)}-${i}`);
      if (sc && sc.id && !scenes3D.some((x) => x.id === sc.id)) scenes3D.push(sc);
    }
    if (scenes3D.length > 0) {
      setDocScenes(key, scenes3D, scenes3D[0]!.id);
      hydrateImportsFromProject(Array.isArray(file.imported) ? file.imported : []);
    }
    activateDocScenesForKey(key);
    for (const entry of listImportEntries()) void ensureImportGeometry(entry.assetId);
  }

  // ── new document ──

  async createNewDocument(
    opts: {
      name?: string;
      width: number;
      height: number;
      background: string | null;
      dpi?: number;
      physicalUnit?: string | null;
      physicalWidth?: number | null;
      physicalHeight?: number | null;
    }
  ): Promise<void> {
    const width = clampDocumentDimension(opts.width, 1280);
    const height = clampDocumentDimension(opts.height, 800);
    const rawBg = opts.background === undefined ? "#ffffff" : opts.background;
    const fill = rawBg === null ? "transparent" : rawBg;
    const name = sanitizeDocumentName(opts.name ?? "Untitled");
    const dpi = typeof opts.dpi === "number" && opts.dpi >= 1 && opts.dpi <= 2400 ? Math.round(opts.dpi) : DEFAULT_DOCUMENT_DPI;
    const layer = createBlankImageLayer("Background", width, height, fill);
    const doc = new EditorDocument(width, height, [layer]);
    const meta = createDocumentMeta({
      name,
      dpi,
      background: rawBg === "transparent" || rawBg === "#00000000" || rawBg === "rgba(0, 0, 0, 0)" ? null : rawBg,
      physicalUnit: opts.physicalUnit ?? null,
      physicalWidth: opts.physicalWidth ?? null,
      physicalHeight: opts.physicalHeight ?? null,
    });
    this._openDoc(doc, meta, {});
    useEditorStore.setState({ status: `New document: ${name} (${width}×${height} px @ ${dpi} DPI).` });
  }

  /**
   * UI command for File → New. Applies the unsaved-changes guard before
   * showing the New Document dialog.
   */
  requestNewDocument(): void {
    const rec = this.getActiveRecord();
    if (rec?.dirty) {
      this.ensureUnsavedConfirmation({ kind: "new" });
      return;
    }
    useEditorStore.getState().openDialog({ name: "newProject" });
  }

  async newProject(width = 1280, height = 800, bg = "#ffffff"): Promise<void> {
    await this.createNewDocument({ width, height, background: bg, name: "Untitled" });
  }

  // ── save / open ──

  async saveProject(opts: { asNew?: boolean } = {}): Promise<{ action: "saved" | "failed" | "cancelled"; name?: string; path?: string | null; bytes?: string }> {
    const d = this.doc();
    const meta = this.getActiveMeta();
    const rec = this.getActiveRecord();
    if (!d || !meta || !rec) return { action: "failed" };
    try {
      const s = useEditorStore.getState().scenes3D;
      const scenes = s.length > 0 ? (JSON.parse(JSON.stringify(s)) as unknown[]) : undefined;
      const imported = scenes ? serializeImportsForProject() : undefined;
      this.captureExtras(rec.key);
      const ex = rec.extras ?? emptyExtras();
      const bytes = stringifyProject(buildProjectFile(d, meta, this.activeLayerId(), {
        scenes,
        imported,
        guides: ex.guides,
        artboards: ex.artboards,
        grid: ex.grid,
      }));
      const name = sanitizeDocumentName(meta.name);
      const saveAs = opts.asNew || !rec.savedPath;
      const result = await writeProjectText(bytes, name, saveAs ? "saveAs" : "save");
      if (result.cancelled) {
        useEditorStore.setState({ status: "Save cancelled." });
        return { action: "cancelled", name, path: null };
      }
      if (!result.ok || !result.name) {
        useEditorStore.setState({ status: result.error ?? "Save failed.", lastError: result.error ?? "Save failed." });
        return { action: "failed", name, path: null };
      }
      const now = Date.now();
      rec.savedPath = result.path;
      rec.savedName = result.name.replace(new RegExp(`\\.${EXT}$`), "");
      rec.dirty = false;
      rec.lastSavedAt = now;
      rec.savedSize = bytes.length;
      rec.meta = updateMeta(rec.meta, { modifiedAt: now });
      useEditorStore.setState({ dirty: false, savedPath: rec.savedPath, savedName: rec.savedName, lastSavedAt: now, lastError: null });
      this.addRecent(rec.savedName, result.path ?? result.name);
      this.syncTabs();
      useEditorStore.setState({ status: `Saved project "${rec.savedName}".` });
      return { action: "saved", name: rec.savedName, path: result.path, bytes };
    } catch (err) {
      useEditorStore.setState({ status: `Save failed: ${(err as Error).message}`, lastError: `Save failed: ${(err as Error).message}` });
      return { action: "failed" };
    }
  }

  /**
   * File → Save a Copy. Writes the current document to a *new* file without
   * changing the active document's saved path/name/dirty state. The new copy
   * is added to the recent list; the original remains the document this tab
   * is bound to.
   */
  async saveCopyProject(): Promise<{ action: "saved" | "failed" | "cancelled"; name?: string; path?: string | null; bytes?: string }> {
    const d = this.doc();
    const meta = this.getActiveMeta();
    const rec = this.getActiveRecord();
    if (!d || !meta || !rec) return { action: "failed" };
    try {
      const s = useEditorStore.getState().scenes3D;
      const scenes = s.length > 0 ? (JSON.parse(JSON.stringify(s)) as unknown[]) : undefined;
      const imported = scenes ? serializeImportsForProject() : undefined;
      this.captureExtras(rec.key);
      const ex = rec.extras ?? emptyExtras();
      const bytes = stringifyProject(buildProjectFile(d, meta, this.activeLayerId(), {
        scenes,
        imported,
        guides: ex.guides,
        artboards: ex.artboards,
        grid: ex.grid,
      }));
      const copyName = `${sanitizeDocumentName(meta.name)}-copy`;
      const result = await writeProjectText(bytes, copyName, "saveAs", { rememberHandle: false });
      if (result.cancelled) {
        useEditorStore.setState({ status: "Save a Copy cancelled." });
        return { action: "cancelled", name: copyName, path: null };
      }
      if (!result.ok || !result.name) {
        useEditorStore.setState({ status: result.error ?? "Save a Copy failed.", lastError: result.error ?? "Save a Copy failed." });
        return { action: "failed", name: copyName, path: null };
      }
      const savedCopyName = result.name.replace(new RegExp(`\\.${EXT}$`), "");
      this.addRecent(savedCopyName, result.path ?? result.name);
      useEditorStore.setState({ status: `Saved a copy as "${result.name}". The current document is unchanged.` });
      return { action: "saved", name: savedCopyName, path: result.path, bytes };
    } catch (err) {
      useEditorStore.setState({ status: `Save a Copy failed: ${(err as Error).message}`, lastError: `Save a Copy failed: ${(err as Error).message}` });
      return { action: "failed" };
    }
  }

  private addRecent(name: string, path: string): void {
    const list = addRecentProject({ name, path });
    useEditorStore.setState({ recentProjects: list });
  }

  getRecentProjects(): RecentProject[] {
    const list = getRecentProjects();
    // Gracefully drop stale entries (empty/missing names).
    const clean = list.filter((r) => r && r.name.length > 0 && r.path.length > 0);
    if (clean.length !== list.length) useEditorStore.setState({ recentProjects: clean });
    return clean;
  }

  /** File → Open Recent → Clear Recent. */
  clearRecentDocuments(): void {
    clearRecentProjects();
    useEditorStore.setState({ recentProjects: [], status: "Cleared the recent projects list." });
  }

  /**
   * File → Document Info. Read-only snapshot of the active document; never
   * mutates the document or its canvas.
   */
  getDocumentInfo(): {
    name: string;
    width: number;
    height: number;
    dpi: number;
    colorProfile: string;
    background: string | null;
    layerCount: number;
    fileSize: number | null;
    createdAt: number | null;
    modifiedAt: number | null;
    savedPath: string | null;
  } | null {
    const d = this.doc();
    const meta = this.getActiveMeta();
    const rec = this.getActiveRecord();
    if (!d || !meta) return null;
    return {
      name: meta.name,
      width: d.width,
      height: d.height,
      dpi: meta.dpi,
      colorProfile: meta.colorProfile,
      background: meta.background,
      layerCount: d.layers.length,
      fileSize: rec?.savedSize ?? null,
      createdAt: meta.createdAt,
      modifiedAt: meta.modifiedAt,
      savedPath: rec?.savedPath ?? null,
    };
  }

  /**
   * Raster export of the composed document (File → Export / Export As).
   * Reuses the existing `getComposite()` pipeline; never mutates the document.
   * Real encoders (including a genuine BMP writer) mean unsupported formats
   * fail loudly instead of writing mislabelled bytes.
   */
  async exportComposite(opts: ExportOptions): Promise<ExportResult> {
    const composite = this.getComposite();
    if (!composite) return { ok: false, error: "No document to export." };
    return this.deliverExport(composite, opts);
  }

  /** File → Export → Export Selected: crop to selection bounds, keep only selected pixels. */
  async exportSelection(opts: ExportOptions): Promise<ExportResult> {
    const d = this.doc();
    const composite = this.getComposite();
    if (!d || !composite) return { ok: false, error: "No document to export." };
    if (!selectionEngine.hasSelection) return { ok: false, error: "There is no active selection to export." };
    const mask = selectionEngine.getMask(d.width, d.height);
    if (!mask) return { ok: false, error: "The selection does not match the document size." };
    const box = maskBorder(mask, d.width, d.height);
    if (box.width <= 0 || box.height <= 0) return { ok: false, error: "The selection is empty." };
    const out = createCanvas(box.width, box.height);
    const ctx = getContext2d(out);
    ctx.drawImage(composite, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
    const maskCanvas = selectionEngine.selectionToCanvas();
    if (maskCanvas) {
      ctx.globalCompositeOperation = "destination-in";
      ctx.drawImage(maskCanvas, box.x, box.y, box.width, box.height, 0, 0, box.width, box.height);
      ctx.globalCompositeOperation = "source-over";
    }
    return this.deliverExport(out, { ...opts, suffix: opts.suffix ?? "selection" });
  }

  /**
   * File → Export → Export Layer: one layer's own content (mask + styles +
   * opacity), cropped to its transform bounds. Blend mode is not applicable to
   * a layer exported without a backdrop, so it is intentionally not faked.
   */
  async exportLayer(opts: ExportOptions & { layerId?: string }): Promise<ExportResult> {
    const d = this.doc();
    if (!d) return { ok: false, error: "No document to export." };
    const id = opts.layerId ?? useEditorStore.getState().selectedIds[0] ?? this.activeLayerId();
    const layer = id ? d.getLayer(id) : null;
    if (!layer) return { ok: false, error: "Select a layer to export." };
    if (layer.type === "adjustment") return { ok: false, error: "Adjustment layers cannot be exported on their own." };
    if (layer.type === "group") return { ok: false, error: "Group layers cannot be exported on their own." };
    const surface = renderLayerToCanvas(layer, d.width, d.height, { pixels: pixelStore });
    const box = this.layerExportBounds(layer, d.width, d.height);
    if (box.width <= 0 || box.height <= 0) return { ok: false, error: "The layer has no exportable bounds." };
    const out = createCanvas(box.width, box.height);
    const ctx = getContext2d(out);
    ctx.globalAlpha = Math.max(0, Math.min(1, layer.opacity));
    ctx.drawImage(surface, -box.x, -box.y);
    ctx.globalAlpha = 1;
    const safeName = layer.name.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "layer";
    return this.deliverExport(out, { ...opts, suffix: opts.suffix ?? safeName });
  }

  /** File → Export → Export Artboard: crop the composite to an artboard, painting its background behind. */
  async exportArtboard(opts: ExportOptions & { artboardId?: string }): Promise<ExportResult> {
    const d = this.doc();
    const composite = this.getComposite();
    if (!d || !composite) return { ok: false, error: "No document to export." };
    const st = useEditorStore.getState();
    const id = opts.artboardId ?? st.activeArtboardId;
    const ab = id ? st.artboards.find((a) => a.id === id) ?? null : null;
    if (!ab) return { ok: false, error: "Select an artboard to export." };
    const box = artboardBounds(ab);
    const out = createCanvas(box.width, box.height);
    const ctx = getContext2d(out);
    if (ab.background) {
      ctx.fillStyle = ab.background;
      ctx.fillRect(0, 0, box.width, box.height);
    }
    ctx.drawImage(composite, -box.x, -box.y);
    const safeName = ab.name.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "artboard";
    return this.deliverExport(out, { ...opts, suffix: opts.suffix ?? safeName });
  }

  private layerExportBounds(layer: Layer, docW: number, docH: number): { x: number; y: number; width: number; height: number } {
    const t = layer.transform;
    const x = Math.max(0, Math.floor(t.x));
    const y = Math.max(0, Math.floor(t.y));
    const width = Math.min(docW - x, Math.max(0, Math.ceil(t.width)));
    const height = Math.min(docH - y, Math.max(0, Math.ceil(t.height)));
    return { x, y, width, height };
  }

  /** Shared resize/flatten/encode/download pipeline for every raster export. */
  private async deliverExport(source: HTMLCanvasElement, opts: ExportOptions): Promise<ExportResult> {
    const format = opts.format;
    const transparent = opts.transparent !== false && exportFormatSupportsAlpha(format);
    const outW = opts.width && opts.width > 0 ? Math.round(opts.width) : source.width;
    const outH = opts.height && opts.height > 0 ? Math.round(opts.height) : source.height;
    let exportCanvas: HTMLCanvasElement = source;
    if (outW !== source.width || outH !== source.height || !transparent) {
      const c = createCanvas(outW, outH);
      const ctx = getContext2d(c);
      if (!transparent) {
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, c.width, c.height);
      }
      ctx.drawImage(source, 0, 0, c.width, c.height);
      exportCanvas = c;
    }
    let blob: Blob;
    try {
      blob = await encodeCanvasToBlob(exportCanvas, format, opts.quality);
    } catch (err) {
      const msg = (err as Error).message;
      useEditorStore.setState({ status: `Export failed: ${msg}`, lastError: `Export failed: ${msg}` });
      return { ok: false, error: msg };
    }
    const st = useEditorStore.getState();
    const baseName = opts.baseName && opts.baseName.trim().length > 0
      ? opts.baseName.trim().replace(/\.[^.]+$/, "")
      : (st.savedName ?? st.projectName ?? "Untitled");
    const fileName = `${baseName}${opts.suffix ? `-${opts.suffix}` : ""}.${exportFormatExtension(format)}`;
    try {
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      useEditorStore.setState({ status: `Exported "${fileName}".`, lastError: null });
      return { ok: true, fileName };
    } catch (err) {
      useEditorStore.setState({ status: `Export failed: ${(err as Error).message}`, lastError: `Export failed: ${(err as Error).message}` });
      return { ok: false, error: `Export failed: ${(err as Error).message}` };
    }
  }

  // ── guides / artboards (Phase 29–30) ──

  private extrasSnapshot(): { guides: Guide[]; artboards: Artboard[]; activeArtboardId: string | null } {
    const st = useEditorStore.getState();
    return { guides: st.guides.map((g) => ({ ...g })), artboards: st.artboards.map((a) => ({ ...a })), activeArtboardId: st.activeArtboardId };
  }

  private pushExtrasHistory(
    name: string,
    before: { guides: Guide[]; artboards: Artboard[]; activeArtboardId: string | null },
    after: { guides: Guide[]; artboards: Artboard[]; activeArtboardId: string | null }
  ): void {
    const clone = (s: { guides: Guide[]; artboards: Artboard[]; activeArtboardId: string | null }) => ({
      guides: s.guides.map((g) => ({ ...g })),
      artboards: s.artboards.map((a) => ({ ...a })),
      activeArtboardId: s.activeArtboardId,
    });
    this.pushHistory({
      name,
      bytes: 256,
      undo: () => useEditorStore.setState({ ...clone(before) }),
      redo: () => useEditorStore.setState({ ...clone(after) }),
    });
  }

  createGuide(orientation: "h" | "v", position: number): string {
    const before = this.extrasSnapshot();
    const id = useEditorStore.getState().addGuide(orientation, position);
    this.pushExtrasHistory(orientation === "v" ? "New Vertical Guide" : "New Horizontal Guide", before, this.extrasSnapshot());
    return id;
  }

  deleteGuide(id: string): void {
    const before = this.extrasSnapshot();
    useEditorStore.getState().removeGuide(id);
    this.pushExtrasHistory("Delete Guide", before, this.extrasSnapshot());
  }

  clearAllGuides(): void {
    if (useEditorStore.getState().guides.length === 0) return;
    const before = this.extrasSnapshot();
    useEditorStore.getState().clearGuides();
    this.pushExtrasHistory("Clear Guides", before, this.extrasSnapshot());
  }

  /** Commit a ruler/guide drag as ONE history entry (called on pointerup). */
  commitGuideEdit(beforeGuides: Guide[]): void {
    const st = useEditorStore.getState();
    const before = { guides: beforeGuides.map((g) => ({ ...g })), artboards: st.artboards.map((a) => ({ ...a })), activeArtboardId: st.activeArtboardId };
    const after = this.extrasSnapshot();
    if (JSON.stringify(before.guides) === JSON.stringify(after.guides)) return;
    this.pushExtrasHistory("Move Guide", before, after);
  }

  addArtboard(rect: { x: number; y: number; width: number; height: number }, name?: string): Artboard | null {
    const d = this.doc();
    if (!d) return null;
    const before = this.extrasSnapshot();
    const ab = makeArtboard({ ...clampArtboardToDoc(rect, d.width, d.height), name });
    useEditorStore.getState().addArtboard(ab);
    this.pushExtrasHistory("New Artboard", before, this.extrasSnapshot());
    return ab;
  }

  updateArtboard(id: string, patch: Partial<Artboard>, name = "Edit Artboard"): void {
    const before = this.extrasSnapshot();
    useEditorStore.getState().updateArtboard(id, patch);
    this.pushExtrasHistory(name, before, this.extrasSnapshot());
  }

  removeArtboard(id: string): void {
    const before = this.extrasSnapshot();
    useEditorStore.getState().removeArtboard(id);
    this.pushExtrasHistory("Delete Artboard", before, this.extrasSnapshot());
  }

  selectArtboard(id: string | null): void {
    useEditorStore.getState().setActiveArtboard(id);
  }

  /** The artboard under a document-space point, if any. */
  artboardAt(x: number, y: number): Artboard | null {
    return findArtboardAt(useEditorStore.getState().artboards, x, y);
  }

  normalizeArtboardRectInput(rect: { x: number; y: number; width: number; height: number }): { x: number; y: number; width: number; height: number } {
    const d = this.doc();
    if (!d) return normalizeArtboardRect(rect);
    return clampArtboardToDoc(rect, d.width, d.height);
  }

  async openProjectFile(file: File): Promise<ProjectLoadResult> {
    return this.loadProjectData(await file.text(), file.name);
  }

  async loadProjectData(text: string, fileName?: string): Promise<ProjectLoadResult> {
    const parsed = parseProjectText(text);
    if (parsed.error || !parsed.file) {
      const tooNew = parsed.errorCode === "unsupported-version";
      throw new ProjectError(
        tooNew ? "unsupported-version" : "malformed",
        tooNew ? "This project was created with a newer version of Vision Studio and cannot be opened." : (parsed.error ?? "Unknown project error.")
      );
    }
    const result = await buildDocumentFromProject(parsed.file);
    for (const note of parsed.warnings.notes) result.warnings.notes.push(note);
    useEditorStore.setState({ lastError: null });
    const meta: DocumentMeta = {
      id: parsed.file.meta.id,
      name: parsed.file.meta.name,
      createdAt: parsed.file.meta.createdAt,
      modifiedAt: parsed.file.meta.modifiedAt,
      dpi: parsed.file.meta.dpi,
      background: parsed.file.meta.background,
      colorProfile: parsed.file.meta.colorProfile,
      physicalUnit: parsed.file.meta.physicalUnit,
      physicalWidth: parsed.file.meta.physicalWidth,
      physicalHeight: parsed.file.meta.physicalHeight,
    };
    void fileName;
    const extras = sanitizeExtras(
      { guides: parsed.file.guides, artboards: parsed.file.artboards, grid: parsed.file.grid },
      result.doc.width,
      result.doc.height
    );
    this._openDoc(result.doc, meta, { dirty: false, savedPath: null, savedName: meta.name, extras });
    if (result.activeLayerId) useEditorStore.setState({ selectedIds: [result.activeLayerId] });
    this.hydrate3DAfterOpen(parsed.file);
    const warnings = result.warnings;
    if (warnings.skippedLayers.length || warnings.recoveredImages.length) {
      useEditorStore.setState({
        status: `Loaded "${meta.name}" with recoveries (${warnings.skippedLayers.length} layers skipped, ${warnings.recoveredImages.length} images rebuilt).`,
      });
    } else {
      useEditorStore.setState({ status: `Loaded project "${meta.name}".` });
      this.addRecent(meta.name, `${meta.name}.vstudio`);
    }
    return result;
  }

  async openProject(): Promise<ProjectLoadResult | null> {
    const rec = this.getActiveRecord();
    if (rec?.dirty) {
      this.ensureUnsavedConfirmation({ kind: "open" });
      return null;
    }
    return this._openViaPicker();
  }

  private async _openViaPicker(): Promise<ProjectLoadResult | null> {
    const picked = await pickProjectFile();
    if (!picked) return null;
    if (picked.fileName.endsWith(".vstudio") || picked.fileName.endsWith(".vsproject")) {
      // nudge recent list with the picked file
      const recs = this.getRecentProjects();
      const idx = recs.findIndex((r) => r.path === picked.fileName);
      if (idx >= 0) {
        const touched = touchRecentProject(picked.fileName);
        useEditorStore.setState({ recentProjects: touched });
      }
    }
    try {
      const result = await this.openProjectFile(picked.file);
      return result;
    } catch (err) {
      let msg = (err as Error).message;
      const looksLikeImage = /\.(png|jpe?g|webp|gif|bmp|avif|tiff?|svg)$/i.test(picked.fileName) || (picked.file && picked.file.type.startsWith("image/"));
      if (err instanceof ProjectError && err.category === "malformed" && looksLikeImage) {
        msg = `"${picked.fileName}" is an image file, not a Vision Studio project. To insert it into the current document, use File → Import Image instead.`;
      }
      useEditorStore.setState({ status: `Open failed: ${msg}`, lastError: `Open failed: ${msg}` });
      if (err instanceof ProjectError && err.category === "malformed") {
        const recs = removeRecentProject(picked.fileName);
        useEditorStore.setState({ recentProjects: recs });
      }
      return null;
    }
  }

  openFromRecent(path: string): void {
    // Browser sandbox cannot silently open a filesystem path; route through
    // the picker so the user confirms the file.
    void this._openViaPicker();
  }

  refreshRecentProjects(): void {
    useEditorStore.setState({ recentProjects: this.getRecentProjects() });
  }

  // ── unsaved-changes guard ──

  ensureUnsavedConfirmation(pending: { kind: "new" | "open" | "close" | "closeAll"; docKey?: string }): void {
    const meta = this.getActiveMeta();
    const name = meta?.name ?? "Untitled";
    useEditorStore.setState({ pendingDocAction: pending });
    useEditorStore.getState().openDialog({ name: "unsavedChanges", payload: { docName: name } });
  }

  async resolvePendingDocAction(saveFirst: boolean): Promise<void> {
    const pending = useEditorStore.getState().pendingDocAction;
    useEditorStore.getState().closeDialog();
    useEditorStore.setState({ pendingDocAction: null });
    if (!pending) return;
    if (saveFirst) {
      const r = await this.saveProject();
      if (r.action !== "saved") {
        useEditorStore.setState({ status: "Save cancelled; keeping the current document." });
        return;
      }
    }
    switch (pending.kind) {
      case "new":
        useEditorStore.getState().openDialog({ name: "newProject" });
        break;
      case "open":
        await this._openViaPicker();
        break;
      case "close":
        await this._doClose(pending.docKey ?? this._activeKey ?? "");
        break;
      case "closeAll":
        this._doCloseAll();
        break;
    }
  }

  cancelPendingDocAction(): void {
    useEditorStore.setState({ pendingDocAction: null });
    useEditorStore.getState().closeDialog();
  }

  // ── preferences & autosave ──

  bootstrapPreferences(): void {
    const prefs = getPreferences();
    useEditorStore.setState({ preferences: prefs, recentProjects: this.getRecentProjects() });
  }

  updatePreferences(patch: Partial<EditorPreferences>): EditorPreferences {
    const cur = getPreferences();
    const next: EditorPreferences = {
      ...cur,
      ...patch,
      autosaveIntervalSec: Math.max(15, Math.round(patch.autosaveIntervalSec ?? cur.autosaveIntervalSec)),
    };
    setPreferences(next);
    useEditorStore.setState({ preferences: next });
    this.ensureAutosaveTimer();
    return next;
  }

  ensureAutosaveTimer(): void {
    if (this._autosaveTimer !== undefined) {
      clearInterval(this._autosaveTimer);
      this._autosaveTimer = undefined;
    }
    const prefs = getPreferences();
    if (!prefs.autosaveEnabled) return;
    this._autosaveTimer = window.setInterval(() => {
      void this.autosaveTick();
    }, Math.max(1000, prefs.autosaveIntervalSec) * 1000);
  }

  async autosaveTick(): Promise<void> {
    const d = this.doc();
    const meta = this.getActiveMeta();
    const rec = this.getActiveRecord();
    if (!d || !meta || !rec || !rec.dirty) return;
    try {
      const s = useEditorStore.getState().scenes3D;
      const scenes = s.length > 0 ? (JSON.parse(JSON.stringify(s)) as unknown[]) : undefined;
      const imported = scenes ? serializeImportsForProject() : undefined;
      this.captureExtras(rec.key);
      const ex = rec.extras ?? emptyExtras();
      const bytes = stringifyProject(buildProjectFile(d, meta, this.activeLayerId(), {
        scenes,
        imported,
        guides: ex.guides,
        artboards: ex.artboards,
        grid: ex.grid,
      }));
      const slot: AutosaveSlot = {
        docId: rec.meta.id,
        name: meta.name,
        savedAt: Date.now(),
        bytes,
        path: rec.savedPath,
      };
      setAutosaveSlot(slot);
    } catch {
      // Never throw from the autosave tick.
    }
  }

  listRecoverableDocuments(): AutosaveSlot[] {
    const keys = this.getOpenTabKeys();
    return listAutosaveSlots(keys);
  }

  async recoverFromAutosave(slotId: string): Promise<ProjectLoadResult | null> {
    const slot = listAutosaveSlots(this.getOpenTabKeys()).find((s) => s.docId === slotId) ?? this.findSlot(slotId);
    if (!slot) return null;
    const parsed = parseProjectText(slot.bytes);
    if (parsed.error || !parsed.file) return null;
    const result = await buildDocumentFromProject(parsed.file);
    for (const note of parsed.warnings.notes) result.warnings.notes.push(note);
    useEditorStore.setState({ lastError: null });
    const meta: DocumentMeta = {
      id: parsed.file.meta.id,
      name: parsed.file.meta.name,
      createdAt: parsed.file.meta.createdAt,
      modifiedAt: parsed.file.meta.modifiedAt,
      dpi: parsed.file.meta.dpi,
      background: parsed.file.meta.background,
      colorProfile: parsed.file.meta.colorProfile,
      physicalUnit: parsed.file.meta.physicalUnit,
      physicalWidth: parsed.file.meta.physicalWidth,
      physicalHeight: parsed.file.meta.physicalHeight,
    };
    this._openDoc(result.doc, meta, { dirty: true, savedPath: slot.path, savedName: meta.name, lastSavedAt: slot.savedAt });
    useEditorStore.setState({ dirty: true });
    this.hydrate3DAfterOpen(parsed.file);
    deleteAutosaveSlot(slot.docId);
    useEditorStore.setState({ status: `Recovered "${meta.name}" from autosave.` });
    return result;
  }

  discardRecoverableDocument(slotId: string): void {
    const slot = this.findSlot(slotId);
    if (slot) deleteAutosaveSlot(slot.docId);
  }

  discardAllRecoverableDocuments(): void {
    for (const s of listAutosaveSlots(this.getOpenTabKeys())) deleteAutosaveSlot(s.docId);
  }

  private findSlot(id: string): AutosaveSlot | null {
    for (const s of listAutosaveSlots(this.getOpenTabKeys())) {
      if (s.docId === id) return s;
    }
    return null;
  }

  autosaveSlotSizeOf(id: string): number {
    const s = this.findSlot(id);
    return s ? autosaveSlotSize(s) : 0;
  }

  activeLayerId(): string | null {
    const doc = this.doc();
    if (!doc) return null;
    const sel = useEditorStore.getState().selectedIds;
    if (sel.length === 1) return sel[0];
    for (let i = doc.layers.length - 1; i >= 0; i--) {
      if (doc.layers[i].type !== "group") return doc.layers[i].id;
    }
    return null;
  }

  addLayerReturnId(): string | null { return this.activeLayerId(); }

  schemaVersion(): number {
    return DOCUMENT_SCHEMA_VERSION;
  }

  docWarningsCleanup(warnings: ProjectParseResult["warnings"]): void {
    void warnings;
  }

  doc(): EditorDocument | null { return useEditorStore.getState().doc; }

  currentDoc(): EditorDocument | null { return this.doc(); }

  requestRender(): void { this.version++; runtime.canvas?.requestRender(); }

  present(): void {
    const d = this.doc();
    if (!d) return;
    useEditorStore.setState({ doc: new EditorDocument(d.width, d.height, layersSnapshot(d.layers)) });
    this.version++;
    runtime.canvas?.requestRender();
  }

  syncUiFast(): void {
    this.present();
  }

  syncUi(): void { this.syncUiD(); }

  private syncHistoryView(): void {
    const items = this.history.items();
    const index = this.history.currentIndex();
    useEditorStore.setState({ historyItems: items, historyIndex: index });
  }

  pushHistory(e: Omit<HistoryEntry, "id">): void {
    this.flushMetaEdit();
    this.history.push({ ...e, thumb: e.thumb ?? this.historyThumbnail() });
    this.syncHistoryView();
    this.version++;
    this.markDirty();
    // Every committed edit must become visible on canvas immediately; otherwise
    // the committed result (and its undo) never repaints until an unrelated
    // repaint happens, so Ctrl+Z appears to do nothing. Requests a frame now;
    // version was bumped above so the renderer re-bakes the composite.
    runtime.canvas?.requestRender();
  }

  private historyThumbnail(): string | null {
    const d = this.doc();
    if (!d || d.width * d.height > 4_000_000) return null;
    const comp = this.getComposite();
    if (!comp || comp.width === 0 || comp.height === 0) return null;
    const w = 56;
    const h = Math.max(1, Math.round((comp.height / comp.width) * w));
    const c = createCanvas(w, h);
    const ctx = getContext2d(c);
    if (!ctx) return null;
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(comp, 0, 0, w, h);
    try {
      return c.toDataURL("image/jpeg", 0.5);
    } catch {
      return null;
    }
  }

  jumpToHistory(index: number): void {
    if (this.history.jumpTo(index)) {
      this.requestRender();
      this.syncHistoryView();
    }
  }

  canUndo(): boolean { return this.history.canUndo(); }
  canRedo(): boolean { return this.history.canRedo(); }
  undo(): void { this.flushMetaEdit(); this.history.undo(); this.requestRender(); this.syncHistoryView(); }
  redo(): void { this.flushMetaEdit(); this.history.redo(); this.requestRender(); this.syncHistoryView(); }

  private makeLayerCommand(name: string, id: string, before: Layer, after: Layer): void {
    const applyAfter = (): void => {
      const d2 = this.doc(); if (!d2) return;
      const map = new Map<string, Layer>(d2.layers.map((l) => [l.id, l]));
      map.set(id, layerSnapshot(after));
      useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, Array.from(map.values())) });
    };
    applyAfter();
    this.pushHistory({
      name,
      bytes: 1024,
      undo: () => {
        const d = this.doc(); if (!d) return;
        const map = new Map<string, Layer>(d.layers.map((l) => [l.id, l]));
        const bImg = before.type === "image" ? (before as ImageLayer) : null;
        const aImg = after.type === "image" ? (after as ImageLayer) : null;
        if (bImg && aImg && bImg.imageId !== aImg.imageId) {
          pixelStore.set(bImg.imageId, pixelStore.get(aImg.imageId) ?? createCanvas(1, 1));
        }
        map.set(id, layerSnapshot(before));
        useEditorStore.setState({ doc: new EditorDocument(d.width, d.height, Array.from(map.values())) });
      },
      redo: () => {
        const d = this.doc(); if (!d) return;
        const map = new Map<string, Layer>(d.layers.map((l) => [l.id, l]));
        const bImg = before.type === "image" ? (before as ImageLayer) : null;
        const aImg = after.type === "image" ? (after as ImageLayer) : null;
        if (aImg && bImg && aImg.imageId !== bImg.imageId) {
          pixelStore.set(aImg.imageId, pixelStore.get(bImg.imageId) ?? createCanvas(1, 1));
        }
        map.set(id, layerSnapshot(after));
        useEditorStore.setState({ doc: new EditorDocument(d.width, d.height, Array.from(map.values())) });
      },
    });
  }

  // ── document operations ──

  /**
   * Open an image file as its own (transparent-background) document.
   * Used by File → Open for images and as the fallback when Import Image is
   * invoked with no document open.
   */
  async openImageFile(file: File): Promise<void> {
    try {
      assertImportable(file);
      useEditorStore.setState({ busy: true });
      const { canvas } = await decodeImageFileSafe(file);
      const bg = createImageLayerFromCanvas(canvas, "Background");
      const meta = createDocumentMeta({
        name: file.name.replace(/\.[^.]+$/, ""),
        dpi: DEFAULT_DOCUMENT_DPI,
        background: null,
      });
      const doc = new EditorDocument(canvas.width, canvas.height, [bg]);
      this._openDoc(doc, meta, {});
      runtime.canvas?.fitToScreen();
      useEditorStore.setState({ status: `Opened image "${meta.name}".` });
    } catch (err) {
      useEditorStore.setState({ status: `Could not open: ${(err as Error).message}`, lastError: `Could not open: ${(err as Error).message}` });
    } finally {
      useEditorStore.setState({ busy: false });
    }
  }

  /**
   * Import a raster image into the current document as a new layer.
   *
   * Behavior:
   * - No document open → the image becomes its own document (transparent
   *   background) so the imported pixels are never lost.
   * - The imported pixels keep their original dimensions and aspect ratio.
   * - If the image does not fit in the current canvas, the canvas is expanded
   *   (existing layers stay in place) rather than silently cropping the image.
   * - The viewport is fitted so the entire image is visible and centered.
   */
  async importImageFile(file: File): Promise<void> {
    try {
      assertImportable(file);
      useEditorStore.setState({ busy: true });
      const { canvas } = await decodeImageFileSafe(file);
      const d = this.doc();
      if (!d) {
        await this.openImageFile(file);
        return;
      }
      const name = file.name.replace(/\.[^.]+$/, "") || "Image";
      let targetW = d.width;
      let targetH = d.height;
      if (canvas.width > d.width || canvas.height > d.height) {
        targetW = Math.min(MAX_DOCUMENT_DIMENSION, Math.max(d.width, canvas.width));
        targetH = Math.min(MAX_DOCUMENT_DIMENSION, Math.max(d.height, canvas.height));
      }
      const layer = createImageLayerFromCanvas(
        canvas,
        name,
        Math.max(0, (targetW - canvas.width) / 2),
        Math.max(0, (targetH - canvas.height) / 2)
      );
      const beforeLayers = layersSnapshot(d.layers);
      const newLayers = layersSnapshot([...d.layers, layer]);
      const apply = (lyrs: Layer[], w: number, h: number): void => {
        const dd = this.doc(); if (!dd) return;
        useEditorStore.setState({ doc: new EditorDocument(w, h, lyrs), selectedIds: [layer.id] });
      };
      apply(newLayers, targetW, targetH);
      this.pushHistory({
        name: "Import Image",
        bytes: 1024,
        undo: () => apply(beforeLayers, d.width, d.height),
        redo: () => apply(newLayers, targetW, targetH),
      });
      const activeDoc = this.doc();
      if (this._activeKey && activeDoc) this.captureBeforeRef(this._activeKey, activeDoc);
      runtime.canvas?.fitToScreen();
      useEditorStore.setState({ lastError: null, status: `Imported "${name}" as a new layer (${canvas.width}×${canvas.height} px).` });
    } catch (err) {
      useEditorStore.setState({ status: `Import failed: ${(err as Error).message}`, lastError: `Import failed: ${(err as Error).message}` });
    } finally {
      useEditorStore.setState({ busy: false });
    }
  }

  importImageCanvas(canvas: HTMLCanvasElement, name = "Image"): void {
    const d = this.doc(); if (!d) return;
    const layer = createImageLayerFromCanvas(canvas, name, Math.max(0, (d.width - canvas.width) / 2), Math.max(0, (d.height - canvas.height) / 2));
    this.addLayer(layer, "Import Image");
  }

  /**
   * File → Import → Place as Layer. Places a decoded image as a new layer
   * centered in the current document *without* resizing the canvas (unlike
   * Import Image, which grows the document when the image is larger).
   */
  async placeImageFile(file: File): Promise<void> {
    try {
      assertImportable(file);
      useEditorStore.setState({ busy: true });
      const { canvas } = await decodeImageFileSafe(file);
      const d = this.doc();
      if (!d) {
        await this.openImageFile(file);
        return;
      }
      const name = file.name.replace(/\.[^.]+$/, "") || "Image";
      this.importImageCanvas(canvas, name);
      useEditorStore.setState({ lastError: null, status: `Placed "${name}" as a layer (${canvas.width}×${canvas.height} px).` });
    } catch (err) {
      useEditorStore.setState({ status: `Place failed: ${(err as Error).message}`, lastError: `Place failed: ${(err as Error).message}` });
    } finally {
      useEditorStore.setState({ busy: false });
    }
  }

  addLayer(layer: Layer, name = "New Layer"): void {
    const d = this.doc(); if (!d) return;
    const layers = [...d.layers, layer];
    const before = layersSnapshot(d.layers);
    const after = layersSnapshot(layers);
    useEditorStore.setState({ doc: new EditorDocument(d.width, d.height, layers), selectedIds: [layer.id] });
    this.pushHistory({
      name,
      bytes: 512,
      undo: () => {
        const d2 = this.doc(); if (!d2) return;
        useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, before), selectedIds: [] });
      },
      redo: () => {
        const d2 = this.doc(); if (!d2) return;
        useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, after), selectedIds: [layer.id] });
      },
    });
    this.requestRender();
  }

  private addLayerInternal(layer: Layer): void {
    const d = this.doc(); if (!d) return;
    useEditorStore.setState({ doc: new EditorDocument(d.width, d.height, [...d.layers, layer]), selectedIds: [layer.id] });
  }

  // ── adjustment layers ──

  addAdjustmentLayer(adjustment: AdjustmentKind, params: AdjustmentParams | null = null, name?: string, amount = 1): string | null {
    const d = this.doc(); if (!d) return null;
    const al = factoryCreateAdjustmentLayer(adjustment, amount, name ?? ADJUSTMENT_LABELS[adjustment] ?? "Adjustment", params);
    const layers = [...d.layers, al];
    const before = layersSnapshot(d.layers);
    const after = layersSnapshot(layers);
    useEditorStore.setState({ doc: new EditorDocument(d.width, d.height, layers), selectedIds: [al.id] });
    this.pushHistory({
      name: `Add ${al.name} Layer`,
      bytes: 1024,
      undo: () => { const d2 = this.doc(); if (!d2) return; useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, before), selectedIds: [] }); },
      redo: () => { const d2 = this.doc(); if (!d2) return; useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, after), selectedIds: [al.id] }); },
    });
    this.markDirty();
    this.requestRender();
    return al.id;
  }

  updateAdjustmentParams(id: string, params: AdjustmentParams): void {
    const d = this.doc(); const l = d?.getLayer(id); if (!l || l.type !== "adjustment") return;
    const before = layerSnapshot(l);
    const after = { ...layerSnapshot(l), params } as Layer;
    this.makeLayerCommand("Adjust Layer", id, before, after);
    this.markDirty();
    this.requestRender();
  }

  /** Update a non-parametric adjustment layer's intensity (amount). */
  setAdjustmentAmount(id: string, amount: number): void {
    const d = this.doc(); const l = d?.getLayer(id); if (!l || l.type !== "adjustment") return;
    const before = layerSnapshot(l);
    const after = { ...layerSnapshot(l), amount } as Layer;
    this.makeLayerCommand("Adjust Layer", id, before, after);
    this.markDirty();
    this.requestRender();
  }

  // ── metadata ops ──

  beginMetaEdit(_id: string): Record<string, unknown> | null {
    const d = this.doc(); const l = d?.getLayer(_id); if (!l) return null;
    return { opacity: l.opacity, name: l.name, blendMode: l.blendMode, visible: l.visible, locked: l.locked };
  }

  endMetaEdit(id: string, before: Record<string, unknown> | null, name: string): void {
    if (!before) return;
    const d = this.doc(); const l = d?.getLayer(id); if (!l) return;
    const after: Record<string, unknown> = { opacity: l.opacity, name: l.name, blendMode: l.blendMode, visible: l.visible, locked: l.locked };
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    const apply = (target: Record<string, unknown>) => {
      const d2 = this.doc(); if (!d2) return;
      useEditorStore.setState({
        doc: new EditorDocument(d2.width, d2.height, d2.layers.map((x) => (x.id === id ? { ...x, ...target, transform: { ...x.transform } } as Layer : x))),
      });
    };
    this.pushHistory({ name, bytes: 256, undo: () => apply(before), redo: () => apply(after) });
    this.requestRender();
  }

  updateLayerMeta(id: string, patch: Partial<Layer>): void {
    const d = this.doc(); if (!d) return;
    const l = d.getLayer(id); if (!l) return;
    const key = Object.keys(patch)[0] ?? "";
    const entryName =
      key === "opacity" ? "Adjust Opacity"
        : key === "blendMode" ? "Layer Blend Mode"
        : key === "visible" ? "Toggle Visibility"
        : key === "locked" ? "Toggle Lock"
        : key === "name" ? "Rename Layer"
        : key === "styles" ? "Layer Styles"
        : key === "transform"
          ? (typeof patch.transform?.rotation === "number" && patch.transform.rotation !== l.transform.rotation ? "Rotate Layer" : "Adjust Transform")
          : "Adjust Layer";
    const s = this._metaSession;
    if (s && (s.id !== id || s.docKey !== this._activeKey)) this.flushMetaEdit();
    if (!this._metaSession) this._metaSession = { id, before: layerSnapshot(l), entryName, docKey: this._activeKey, timer: undefined };
    useEditorStore.setState({
      doc: new EditorDocument(d.width, d.height, d.layers.map((x) => (x.id === id ? { ...x, ...patch, transform: { ...x.transform, ...(patch.transform ?? {}) } } as Layer : x))),
    });
    const discrete = key === "visible" || key === "locked" || key === "blendMode" || key === "name";
    if (discrete) this.flushMetaEdit();
    else this.scheduleMetaFlush();
    this.version++; runtime.canvas?.requestRender();
    this.markDirty();
  }

  /** Commit the pending meta-edit session (if any) as a single undo/redo entry. */
  flushMetaEdit(): void {
    const s = this._metaSession;
    this._metaSession = null;
    if (!s) return;
    if (s.timer !== undefined) { clearTimeout(s.timer); s.timer = undefined; }
    const d = this.doc(); if (!d) return;
    const l = d.getLayer(s.id); if (!l) return;
    const after = layerSnapshot(l);
    if (JSON.stringify(s.before) === JSON.stringify(after)) return;
    this.makeLayerCommand(s.entryName, s.id, s.before, after);
  }

  private scheduleMetaFlush(): void {
    const s = this._metaSession;
    if (!s) return;
    if (s.timer !== undefined) clearTimeout(s.timer);
    s.timer = setTimeout(() => this.flushMetaEdit(), 250);
  }

  updateLayerTransformLive(id: string, t: Partial<LayerTransform>): void {
    const d = this.doc(); if (!d) return;
    for (const l of d.layers) { if (l.id === id) { Object.assign(l.transform, t); break; } }
    this.version++; runtime.canvas?.requestRender(); this.syncUi();
  }

  commitLayerTransform(id: string, before: LayerTransform, name: string): void {
    const d = this.doc(); const l = d?.getLayer(id); if (!l) return;
    const after = { ...l.transform };
    if (JSON.stringify(before) === JSON.stringify(after)) return;
    this.makeLayerCommand(name, id, { ...l, transform: { ...before } } as Layer, { ...l, transform: { ...after } } as Layer);
    this.requestRender();
  }

  rotateLayer(id: string, deg: number): void {
    const d = this.doc(); const l = d?.getLayer(id); if (!l) return;
    const before = layerSnapshot(l);
    l.transform.rotation += deg;
    this.makeLayerCommand("Rotate", id, before, layerSnapshot(l));
    this.requestRender();
  }

  flipLayer(id: string, horiz: boolean): void {
    const d = this.doc(); const l = d?.getLayer(id); if (!l) return;
    const before = layerSnapshot(l);
    if (horiz) { l.transform.scaleX = -l.transform.scaleX; l.transform.x += l.transform.width; }
    else { l.transform.scaleY = -l.transform.scaleY; l.transform.y += l.transform.height; }
    this.makeLayerCommand("Flip", id, before, layerSnapshot(l));
    this.requestRender();
  }

  // ───────────────────────── Product compositing ─────────────────────────

  productLayers(): ImageLayer[] {
    const d = this.doc(); if (!d) return [];
    return d.layers.filter((l): l is ImageLayer => l.type === "image" && l.product?.role === "product");
  }

  isProductLayer(id: string): boolean {
    const l = this.doc()?.getLayer(id);
    return !!l && l.type === "image" && l.product?.role === "product";
  }

  getProductMeta(id: string): ProductCompositeMetadata | null {
    const l = this.doc()?.getLayer(id);
    return l && l.type === "image" && l.product ? l.product : null;
  }

  private updateProductMetaNoHistory(id: string, patch: Partial<ProductCompositeMetadata>): void {
    const d = this.doc(); if (!d) return;
    const l = d.getLayer(id); if (!l || l.type !== "image") return;
    const img = l as ImageLayer;
    const meta: ProductCompositeMetadata = img.product ?? {
      role: "product",
      sourceName: null,
      sourceWidth: 0,
      sourceHeight: 0,
      segmentOrigin: "none",
      segmentOperation: null,
      segmentProvider: null,
      segmentModel: null,
      segmentPrompt: null,
      importedAt: Date.now(),
      lighting: emptyProductLighting(),
      colorMatch: emptyProductLighting(),
      smartPlace: null,
      perspectiveMatched: null,
      sourceImageId: null,
    };
    const next = { ...meta, ...patch } as ProductCompositeMetadata;
    useEditorStore.setState({
      doc: new EditorDocument(d.width, d.height, d.layers.map((x) => (x.id === id ? { ...x, product: next } as Layer : x))),
    });
  }

  /**
   * Import a product image as an independent image layer (never merged with the
   * background). The pristine copy is kept in pixelStore as `sourceImageId` so
   * lighting/color-match can be reset later. History: "Import Product".
   */
  importProductCanvas(canvas: HTMLCanvasElement, name = "Product"): string | null {
    const d = this.doc(); if (!d) return null;
    const src = createCanvas(canvas.width, canvas.height);
    getContext2d(src).drawImage(canvas, 0, 0);
    const srcId = genId("prod-src");
    pixelStore.set(srcId, src);

    const layer = createImageLayerFromCanvas(canvas, name || "Product");
    const w = Math.max(1, Math.round(canvas.width));
    const h = Math.max(1, Math.round(canvas.height));
    const maxW = Math.max(200, d.width * 0.7);
    const scale = Math.min(1, d.width * 0.42 / w, d.height * 0.45 / h, maxW / w);
    if (scale < 1) {
      layer.transform.width = Math.max(4, Math.round(w * scale));
      layer.transform.height = Math.max(4, Math.round(h * scale));
    }
    layer.transform.x = Math.max(0, (d.width - layer.transform.width) / 2);
    layer.transform.y = Math.max(0, d.height * 0.62 - layer.transform.height / 2);
    (layer as ImageLayer).product = {
      role: "product",
      sourceName: name || "Product",
      sourceWidth: canvas.width,
      sourceHeight: canvas.height,
      segmentOrigin: "none",
      segmentOperation: null,
      segmentProvider: null,
      segmentModel: null,
      segmentPrompt: null,
      importedAt: Date.now(),
      lighting: emptyProductLighting(),
      colorMatch: emptyProductLighting(),
      smartPlace: null,
      perspectiveMatched: null,
      sourceImageId: srcId,
    };
    this.addLayer(layer, "Import Product");
    this.requestRender();
    return layer.id;
  }

  async importProductFile(file: File): Promise<string | null> {
    try {
      useEditorStore.setState({ busy: true });
      const { canvas } = await decodeImageFileSafe(file);
      const name = file.name.replace(/\.[^.]+$/, "") || "Product";
      const id = this.importProductCanvas(canvas, name);
      useEditorStore.setState({ lastError: null, status: `Imported product "${name}".` });
      return id;
    } catch (err) {
      useEditorStore.setState({ lastError: `Product import failed: ${(err as Error).message}` });
      return null;
    } finally {
      useEditorStore.setState({ busy: false });
    }
  }

  removeProduct(id: string): void {
    this.deleteLayers([id]);
    const meta = this.getProductMeta(id);
    if (meta?.sourceImageId) pixelStore.delete(meta.sourceImageId);
  }

  /** Apply an AI (or provider) selection mask onto the product layer as an
   *  editable, non-destructive mask. History: "Remove Product Background". */
  setProductMaskFromAiSelection(layerId: string, sel: AISelection | null, provenance?: { operation: string; provider: string | null; model: string | null; prompt: string | null }): void {
    const d = this.doc(); const l = d?.getLayer(layerId); if (!l || l.type !== "image") return;
    if (!sel) return;
    const maskCanvas = maskCanvasFromAiSelection(sel, l.transform.width, l.transform.height);
    if (!maskCanvas) return;
    this.replaceLayerMaskCanvas(layerId, maskCanvas, "Remove Product Background");
    let origin: ProductCompositeMetadata["segmentOrigin"] = provenance?.provider === "mock" ? "mock" : "ai";
    this.updateProductMetaNoHistory(layerId, {
      segmentOrigin: origin,
      segmentOperation: provenance?.operation ?? null,
      segmentProvider: provenance?.provider ?? null,
      segmentModel: provenance?.model ?? null,
      segmentPrompt: provenance?.prompt ?? null,
    });
    this.requestRender();
  }

  /** Use the current editor selection as the product's cutout mask (manual). */
  setProductMaskFromEditorSelection(layerId: string): void {
    const d = this.doc(); const l = d?.getLayer(layerId); if (!l || l.type !== "image") return;
    const mask = selectionEngine.getMask();
    if (!mask) return;
    const [docW, docH] = selectionEngine.dims;
    const sel: AISelection = {
      kind: "raster-mask",
      bounds: maskBorder(mask, docW, docH),
      mask: { width: docW, height: docH, data: new Uint8Array(mask), weight: 1 },
    };
    this.setProductMaskFromAiSelection(layerId, sel, {
      operation: "manual",
      provider: "manual",
      model: null,
      prompt: null,
    });
    const img = this.doc()?.getLayer(layerId) as ImageLayer | undefined;
    if (img) this.updateProductMetaNoHistory(layerId, { segmentOrigin: "manual" });
  }

  clearProductMask(layerId: string): void {
    const l = this.doc()?.getLayer(layerId);
    if (!l || l.type !== "image" || !l.mask) return;
    this.removeMaskFromLayer(layerId);
    this.updateProductMetaNoHistory(layerId, { segmentOrigin: l.product?.segmentOrigin ?? "none" });
  }

  /** Replace the layer's mask canvas (creating the mask ref if needed) with an
   *  undoable entry. Pixels are never touched — the mask stays a mask. */
  replaceLayerMaskCanvas(id: string, canvas: HTMLCanvasElement, name: string): void {
    const d = this.doc(); const l = d?.getLayer(id); if (!l || l.type === "group" || l.type === "adjustment") return;
    const before = layerSnapshot(l);
    const newMaskId = (l.mask?.id ?? genId("mask"));
    const hadMask = !!l.mask;
    const oldMaskCanvas = hadMask && l.mask ? maskStore.get(l.mask.id) ?? null : null;
    maskStore.set(newMaskId, canvas);
    const after = { ...layerSnapshot(l), mask: { id: newMaskId, enabled: hadMask ? (l.mask?.enabled ?? true) : true } } as Layer;
    const apply = (lyr: Layer) => {
      const d2 = this.doc(); if (!d2) return;
      useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, d2.layers.map((x) => (x.id === id ? lyr : x))) });
    };
    apply(after);
    this.pushHistory({
      name,
      bytes: canvas.width * canvas.height * 4,
      undo: () => {
        const d2 = this.doc(); if (!d2) return;
        if (hadMask && oldMaskCanvas) maskStore.set(newMaskId, oldMaskCanvas);
        if (!hadMask) maskStore.delete(newMaskId);
        useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, d2.layers.map((x) => (x.id === id ? before : x))) });
      },
      redo: () => {
        maskStore.set(newMaskId, canvas);
        apply(after);
      },
    });
    this.requestRender();
  }

  /** Refine the product's mask canvas (feather / smooth / spread). Undoable. */
  refineProductMask(layerId: string, settings: MaskRefineSettings): void {
    const d = this.doc(); const l = d?.getLayer(layerId); if (!l || l.type !== "image" || !l.mask) return;
    const mask = maskStore.get(l.mask.id);
    if (!mask) return;
    const beforeCanvas = mask;
    const refined = refineMaskCanvas(mask, settings);
    maskStore.set(l.mask.id, refined);
    this.pushHistory({
      name: "Refine Product Mask",
      bytes: mask.width * mask.height,
      undo: () => { const m = this.doc()?.getLayer(layerId) as ImageLayer | undefined; if (m?.mask) maskStore.set(m.mask.id, beforeCanvas); this.requestRender(); },
      redo: () => { const m = this.doc()?.getLayer(layerId) as ImageLayer | undefined; if (m?.mask) maskStore.set(m.mask.id, refined); this.requestRender(); },
    });
    this.requestRender();
    this.markDirty();
  }

  /**
   * Bake lighting adjustments onto the product pixels, using the CURRENT
   * product pixels as the baseline (classic destructive-with-undo apply). The
   * pristine import snapshot stays untouched for "Reset".
   */
  applyProductLighting(layerId: string, values: ProductLightingValues, name = "Match Product Lighting"): void {
    const d = this.doc(); const l = d?.getLayer(layerId); if (!l || l.type !== "image") return;
    const img = l as ImageLayer;
    const pixels = pixelStore.get(img.imageId);
    if (!pixels) return;
    const before = pixels;
    const result = pipelineLighting(pixels, values);
    pixelStore.set(img.imageId, result);
    const meta = this.getProductMeta(layerId);
    const beforeLayer = layerSnapshot(l);
    const after = { ...beforeLayer, product: { ...(meta ?? this.defaultProductMeta(layerId)), lighting: values } } as Layer;
    const apply = (lyr: Layer) => {
      const d2 = this.doc(); if (!d2) return;
      useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, d2.layers.map((x) => (x.id === layerId ? lyr : x))) });
    };
    apply(after);
    this.pushHistory({
      name,
      bytes: result.width * result.height * 4,
      undo: () => { pixelStore.set(img.imageId, before); apply(beforeLayer); },
      redo: () => { pixelStore.set(img.imageId, result); apply(after); },
    });
    this.requestRender();
    this.markDirty();
  }

  /** Same pipeline, branded as color matching, recorded under colorMatch. */
  applyProductColorMatch(layerId: string, values: ProductLightingValues): void {
    const d = this.doc(); const l = d?.getLayer(layerId); if (!l || l.type !== "image") return;
    const img = l as ImageLayer;
    const pixels = pixelStore.get(img.imageId);
    if (!pixels) return;
    const before = pixels;
    const result = pipelineLighting(pixels, values);
    pixelStore.set(img.imageId, result);
    const meta = this.getProductMeta(layerId);
    const beforeLayer = layerSnapshot(l);
    const after = { ...beforeLayer, product: { ...(meta ?? this.defaultProductMeta(layerId)), colorMatch: values } } as Layer;
    const apply = (lyr: Layer) => {
      const d2 = this.doc(); if (!d2) return;
      useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, d2.layers.map((x) => (x.id === layerId ? lyr : x))) });
    };
    apply(after);
    this.pushHistory({
      name: "Match Product Color",
      bytes: result.width * result.height * 4,
      undo: () => { pixelStore.set(img.imageId, before); apply(beforeLayer); },
      redo: () => { pixelStore.set(img.imageId, result); apply(after); },
    });
    this.requestRender();
    this.markDirty();
  }

  /** Restore the product's pristine import pixels and clear applied lighting. */
  resetProductLighting(layerId: string): void {
    const d = this.doc(); const l = d?.getLayer(layerId); if (!l || l.type !== "image") return;
    const img = l as ImageLayer;
    const srcId = img.product?.sourceImageId ?? null;
    const src = srcId ? pixelStore.get(srcId) : null;
    const pixels = pixelStore.get(img.imageId);
    if (!pixels || !src) return;
    const before = pixels;
    pixelStore.set(img.imageId, src);
    const meta = this.getProductMeta(layerId);
    const beforeLayer = layerSnapshot(l);
    const after = {
      ...beforeLayer,
      product: { ...(meta ?? this.defaultProductMeta(layerId)), lighting: emptyProductLighting(), colorMatch: emptyProductLighting() },
    } as Layer;
    const apply = (lyr: Layer) => {
      const d2 = this.doc(); if (!d2) return;
      useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, d2.layers.map((x) => (x.id === layerId ? lyr : x))) });
    };
    apply(after);
    this.pushHistory({
      name: "Reset Product Lighting",
      bytes: src.width * src.height * 4,
      undo: () => { pixelStore.set(img.imageId, before); apply(beforeLayer); },
      redo: () => { pixelStore.set(img.imageId, src); apply(after); },
    });
    this.requestRender();
    this.markDirty();
  }

  /** Bake the current mask into the product pixels (destructive, undoable). */
  burnProductCutoutToPixels(layerId: string): void {
    const d = this.doc(); const l = d?.getLayer(layerId); if (!l || l.type !== "image" || !l.mask) return;
    const img = l as ImageLayer;
    const src = pixelStore.get(img.imageId);
    const mask = maskStore.get(l.mask.id);
    if (!src || !mask) return;
    const oldMask = mask;
    const doc = d!;
    const baked = createCanvas(src.width, src.height);
    const bctx = getContext2d(baked);
    bctx.clearRect(0, 0, src.width, src.height);
    bctx.drawImage(src, 0, 0);
    bctx.globalCompositeOperation = "destination-in";
    bctx.drawImage(mask, 0, 0, src.width, src.height);
    bctx.globalCompositeOperation = "source-over";
    const before = layersSnapshot(doc.layers);
    pixelStore.set(img.imageId, baked);
    const srcId = img.product?.sourceImageId ?? null;
    if (srcId) pixelStore.delete(srcId);
    const after = doc.layers.map((x) => (x.id === layerId
      ? { ...layerSnapshot(x), mask: null, product: { ...(x as ImageLayer).product, sourceImageId: null } } as Layer
      : x));
    const apply = (lyrs: Layer[]) => { const d2 = this.doc(); if (!d2) return; useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, lyrs), selectedIds: [layerId] }); };
    this.pushHistory({
      name: "Bake Product Cutout",
      bytes: baked.width * baked.height * 4,
      undo: () => { pixelStore.set(img.imageId, src); if (srcId) pixelStore.set(srcId, src); maskStore.set(l.mask!.id, oldMask); apply(before); },
      redo: () => { pixelStore.set(img.imageId, baked); if (srcId) pixelStore.delete(srcId); maskStore.delete(l.mask!.id); apply(after); },
    });
    maskStore.delete(l.mask.id);
    apply(after);
    this.markDirty();
    this.requestRender();
  }

  private defaultProductMeta(layerId: string): ProductCompositeMetadata {
    const l = this.doc()?.getLayer(layerId) as ImageLayer | undefined;
    return {
      role: "product",
      sourceName: l?.name ?? "Product",
      sourceWidth: l?.transform.width ?? 0,
      sourceHeight: l?.transform.height ?? 0,
      segmentOrigin: "none",
      segmentOperation: null,
      segmentProvider: null,
      segmentModel: null,
      segmentPrompt: null,
      importedAt: Date.now(),
      lighting: emptyProductLighting(),
      colorMatch: emptyProductLighting(),
      smartPlace: null,
      perspectiveMatched: null,
      sourceImageId: null,
    };
  }

  /** Render the product's silhouette (pixels ∩ mask) as a scratch canvas. */
  productSilhouette(layerId: string): HTMLCanvasElement | null {
    const l = this.doc()?.getLayer(layerId); if (!l || l.type !== "image") return null;
    const img = l as ImageLayer;
    const pixels = pixelStore.get(img.imageId);
    if (!pixels) return null;
    const out = createCanvas(pixels.width, pixels.height);
    getContext2d(out).drawImage(pixels, 0, 0);
    if (img.mask) {
      const mask = maskStore.get(img.mask.id);
      if (mask) {
        const ctx = getContext2d(out);
        ctx.globalCompositeOperation = "destination-in";
        ctx.drawImage(mask, 0, 0, out.width, out.height);
        ctx.globalCompositeOperation = "source-over";
      }
    }
    return out;
  }

  /** Create a contact-shadow image layer beneath the product. Returns its id. */
  addContactShadow(productLayerId: string, settings: ContactShadowSettings): string | null {
    const d = this.doc(); if (!d) return null;
    const l = d.getLayer(productLayerId); if (!l || l.type !== "image") return null;
    const sil = this.productSilhouette(productLayerId);
    if (!sil || sil.width < 1 || sil.height < 1) return null;
    const res = createContactShadowCanvas(sil, settings);
    const shadowId = genId("layer");
    const c = res.canvas;
    pixelStore.set(shadowId, c);
    const shadow: ImageLayer = {
      id: shadowId,
      name: "Shadow",
      type: "image",
      visible: true,
      locked: false,
      opacity: 1,
      blendMode: "multiply",
      transform: {
        x: l.transform.x - res.padX,
        y: l.transform.y - res.padY,
        width: c.width,
        height: c.height,
        rotation: l.transform.rotation,
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0,
      },
      parentId: null,
      clipTo: null,
      mask: null,
      imageId: shadowId,
      shadow: {
        mode: "shadow",
        productLayerId,
        opacity: settings.opacity,
        blur: settings.blur,
        distance: settings.distance,
        angle: settings.angle,
        spread: settings.spread,
        tinted: settings.tinted,
        segments: 6,
        generatedAt: Date.now(),
      },
    };
    const idx = d.layerIndex(productLayerId);
    const layers = [...d.layers];
    layers.splice(idx, 0, shadow);
    const before = layersSnapshot(d.layers);
    const after = layersSnapshot(layers);
    useEditorStore.setState({ doc: new EditorDocument(d.width, d.height, layers), selectedIds: [shadowId] });
    this.pushHistory({
      name: "Add Product Shadow",
      bytes: c.width * c.height * 4,
      undo: () => { const d2 = this.doc(); if (!d2) return; useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, before), selectedIds: [] }); },
      redo: () => { const d2 = this.doc(); if (!d2) return; useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, after), selectedIds: [shadowId] }); },
    });
    this.requestRender();
    return shadowId;
  }

  /** Re-render an existing shadow OR reflection layer from its product (and new settings). */
  updateContactShadow(shadowLayerId: string, settings?: Partial<ContactShadowSettings>): void {
    const d = this.doc(); if (!d) return;
    const l = d.getLayer(shadowLayerId); if (!l || l.type !== "image") return;
    const meta = (l as ImageLayer).shadow;
    if (!meta || !meta.productLayerId) return;
    const product = d.getLayer(meta.productLayerId);
    if (!product) return;
    const sil = this.productSilhouette(product.id);
    if (!sil) return;

    let c: HTMLCanvasElement;
    let padX = 0;
    let padY = 0;
    let newMeta: ProductShadowMetadata;
    if (meta.mode === "reflection") {
      const r: ReflectionSettings = {
        opacity: settings?.opacity ?? meta.opacity,
        blur: settings?.blur ?? meta.blur,
        offset: settings?.distance ?? (Number.isFinite(meta.distance) ? meta.distance : 0),
        fade: settings && "fade" in settings && typeof (settings as unknown as ReflectionSettings).fade === "number" ? (settings as unknown as ReflectionSettings).fade : 0.35,
        perspective: settings && "perspective" in settings && typeof (settings as unknown as ReflectionSettings).perspective === "number" ? (settings as unknown as ReflectionSettings).perspective : 1,
      };
      c = createReflectionCanvas(sil, r).canvas;
      newMeta = { ...meta, opacity: r.opacity, blur: r.blur, distance: r.offset, generatedAt: Date.now() };
    } else {
      const nextSettings: ContactShadowSettings = {
        opacity: settings?.opacity ?? meta.opacity,
        blur: settings?.blur ?? meta.blur,
        distance: settings?.distance ?? meta.distance,
        angle: settings?.angle ?? meta.angle,
        spread: settings?.spread ?? meta.spread,
        tinted: settings?.tinted ?? meta.tinted,
      };
      const res = createContactShadowCanvas(sil, nextSettings);
      c = res.canvas;
      padX = res.padX;
      padY = res.padY;
      newMeta = {
        ...meta,
        opacity: nextSettings.opacity,
        blur: nextSettings.blur,
        distance: nextSettings.distance,
        angle: nextSettings.angle,
        spread: nextSettings.spread,
        tinted: nextSettings.tinted,
        generatedAt: Date.now(),
      };
    }
    const oldCanvas = pixelStore.get((l as ImageLayer).imageId) ?? createCanvas(c.width, c.height);
    pixelStore.set((l as ImageLayer).imageId, c);
    const anchorX = meta.mode === "reflection" ? l.transform.x + 0 : product.transform.x - padX;
    const anchorY = meta.mode === "reflection" ? product.transform.y + product.transform.height + (Number.isFinite(meta.distance) ? meta.distance : 0) + 0 : product.transform.y - padY;
    const after = {
      ...layerSnapshot(l),
      transform: {
        x: anchorX,
        y: anchorY,
        width: c.width,
        height: c.height,
        rotation: product.transform.rotation,
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0,
      },
      shadow: newMeta,
    } as Layer;
    const apply = (lyr: Layer) => {
      const d2 = this.doc(); if (!d2) return;
      useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, d2.layers.map((x) => (x.id === shadowLayerId ? lyr : x))) });
    };
    apply(after);
    this.pushHistory({
      name: meta.mode === "reflection" ? "Update Product Reflection" : "Update Product Shadow",
      bytes: c.width * c.height * 4,
      undo: () => { pixelStore.set((l as ImageLayer).imageId, oldCanvas); apply(layerSnapshot(l)); },
      redo: () => { pixelStore.set((l as ImageLayer).imageId, c); apply(after); },
    });
    this.requestRender();
  }

  /** Reflection layer under the product. Returns its id. */
  addReflection(productLayerId: string, settings: ReflectionSettings): string | null {
    const d = this.doc(); if (!d) return null;
    const l = d.getLayer(productLayerId); if (!l || l.type !== "image") return null;
    const sil = this.productSilhouette(productLayerId);
    if (!sil || sil.width < 1 || sil.height < 1) return null;
    const res = createReflectionCanvas(sil, settings);
    const c = res.canvas;
    const reflId = genId("layer");
    pixelStore.set(reflId, c);
    const refl: ImageLayer = {
      id: reflId,
      name: "Reflection",
      type: "image",
      visible: true,
      locked: false,
      opacity: 0.65,
      blendMode: "normal",
      transform: {
        x: l.transform.x,
        y: l.transform.y + l.transform.height + settings.offset,
        width: c.width,
        height: c.height,
        rotation: l.transform.rotation,
        scaleX: 1,
        scaleY: 1,
        skewX: 0,
        skewY: 0,
      },
      parentId: null,
      clipTo: null,
      mask: null,
      imageId: reflId,
      shadow: {
        mode: "reflection",
        productLayerId,
        opacity: settings.opacity,
        blur: settings.blur,
        distance: settings.offset,
        angle: 0,
        spread: 0,
        tinted: 0,
        segments: 1,
        generatedAt: Date.now(),
      },
    };
    const idx = d.layerIndex(productLayerId);
    const layers = [...d.layers];
    layers.splice(idx, 0, refl);
    const before = layersSnapshot(d.layers);
    const after = layersSnapshot(layers);
    useEditorStore.setState({ doc: new EditorDocument(d.width, d.height, layers), selectedIds: [reflId] });
    this.pushHistory({
      name: "Add Product Reflection",
      bytes: c.width * c.height * 4,
      undo: () => { const d2 = this.doc(); if (!d2) return; useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, before), selectedIds: [] }); },
      redo: () => { const d2 = this.doc(); if (!d2) return; useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, after), selectedIds: [reflId] }); },
    });
    this.requestRender();
    return reflId;
  }

  /**
   * Position/scale/rotate a product (keystone maps to the existing skew
   * transform so no secondary transform system is introduced). Undoable.
   */
  applyProductPlacement(layerId: string, patch: Partial<LayerTransform>, name: string): void {
    const d = this.doc(); const l = d?.getLayer(layerId); if (!l) return;
    const before = layerSnapshot(l);
    const after = { ...layerSnapshot(l), transform: { ...l.transform, ...patch } } as Layer;
    if (JSON.stringify(before.transform) === JSON.stringify(after.transform)) return;
    this.makeLayerCommand(name, layerId, before, after);
    this.requestRender();
  }

  /** AI / smart placement of the product (transform + provenance record). */
  autoPlaceProduct(
    layerId: string,
    plan: { x: number; y: number; width: number; height: number; rotation: number },
    provenance: { ai: boolean; operation: string | null; provider: string | null }
  ): void {
    const d = this.doc(); const l = d?.getLayer(layerId); if (!l) return;
    const before = layerSnapshot(l);
    const after = {
      ...layerSnapshot(l),
      transform: { ...l.transform, x: plan.x, y: plan.y, width: plan.width, height: plan.height, rotation: plan.rotation },
      product: { ...(l as ImageLayer).product, smartPlace: { ...provenance, x: plan.x, y: plan.y, width: plan.width, height: plan.height } },
    } as Layer;
    this.makeLayerCommand(provenance.ai ? "AI Smart Place" : "Smart Placement", layerId, before, after);
    this.requestRender();
  }

  /** Apply an AI perspective suggestion through a keystone (skew) adjustment. */
  applyProductPerspectiveSkew(layerId: string, skewX: number, skewY: number, provenance: { ai: boolean; operation: string | null; provider: string | null }): void {
    const d = this.doc(); const l = d?.getLayer(layerId); if (!l) return;
    const before = layerSnapshot(l);
    const after = {
      ...layerSnapshot(l),
      transform: { ...l.transform, skewX, skewY },
      product: { ...(l as ImageLayer).product, perspectiveMatched: { ...provenance, skewX, skewY } },
    } as Layer;
    if (JSON.stringify(before.transform) === JSON.stringify(after.transform)) return;
    this.makeLayerCommand(provenance.ai ? "AI Match Perspective" : "Perspective Keystone", layerId, before, after);
    this.requestRender();
  }

  /** True 4-corner perspective warp, rasterized into the product pixels (undoable). */
  bakeProductPerspectiveWarp(layerId: string, dst: [{ x: number; y: number }, { x: number; y: number }, { x: number; y: number }, { x: number; y: number }]): void {
    const d = this.doc(); const l = d?.getLayer(layerId); if (!l || l.type !== "image") return;
    const img = l as ImageLayer;
    const pixels = pixelStore.get(img.imageId);
    if (!pixels) return;
    const res = warpPerspective(pixels, dst);
    const beforePixels = pixels;
    pixelStore.set(img.imageId, res.canvas);
    const beforeLayer = layerSnapshot(l);
    const after = {
      ...beforeLayer,
      transform: { ...l.transform, width: res.canvas.width, height: res.canvas.height, x: l.transform.x + res.offsetX, y: l.transform.y + res.offsetY },
    } as Layer;
    const apply = (lyr: Layer) => {
      const d2 = this.doc(); if (!d2) return;
      useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, d2.layers.map((x) => (x.id === layerId ? lyr : x))) });
    };
    apply(after);
    this.pushHistory({
      name: "Bake Product Perspective",
      bytes: res.canvas.width * res.canvas.height * 4,
      undo: () => { pixelStore.set(img.imageId, beforePixels); apply(beforeLayer); },
      redo: () => { pixelStore.set(img.imageId, res.canvas); apply(after); },
    });
    this.requestRender();
    this.markDirty();
  }

  deleteLayers(ids: string[]): void {
    const d = this.doc(); if (!d) return;
    const idSet = new Set(ids);
    const before = layersSnapshot(d.layers);
    const kept = d.layers.filter((l) => !idSet.has(l.id));
    const deletedLayers = d.layers.filter((l) => idSet.has(l.id));
    const apply = (layers: Layer[]) => {
      const d2 = this.doc(); if (!d2) return;
      useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, layers), selectedIds: [] });
    };
    const removePixels = () => { for (const l of deletedLayers) { if (l.type === "image") pixelStore.delete((l as ImageLayer).imageId); } };
    this.pushHistory({
      name: "Delete Layer",
      bytes: 512 * ids.length,
      undo: () => { apply(before); },
      redo: () => { removePixels(); apply(kept); },
    });
    removePixels();
    apply(kept);
  }

  duplicateSelected(): void {
    const d = this.doc(); const sel = useEditorStore.getState().selectedIds;
    if (!d || sel.length === 0) return;
    const created: Layer[] = [];
    for (const id of sel) {
      const l = d.getLayer(id);
      if (l) created.push(dupLayer(l));
    }
    if (created.length === 0) return;
    const newLayers = [...d.layers];
    for (let i = created.length - 1; i >= 0; i--) {
      const src = d.getLayer(sel[i]!);
      if (!src) continue;
      const idx = d.layerIndex(src.id);
      newLayers.splice(idx + 1, 0, created[i]!);
    }
    useEditorStore.setState({ doc: new EditorDocument(d.width, d.height, newLayers), selectedIds: created.map((c) => c.id) });
    this.pushHistory({
      name: "Duplicate",
      bytes: 512 * created.length,
      undo: () => { const d2 = this.doc(); if (!d2) return; useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, d2.layers.filter((l) => !new Set(created.map((c) => c.id)).has(l.id))), selectedIds: [] }); },
      redo: () => { const d2 = this.doc(); if (!d2) return; useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, [...d2.layers, ...created]), selectedIds: created.map((c) => c.id) }); },
    });
  }

  renameLayer(id: string, name: string): void {
    const d = this.doc(); if (!d) return;
    const l = d.getLayer(id); if (!l) return;
    if (l.name === name) return;
    const before = layerSnapshot(l);
    const after = { ...layerSnapshot(l), name } as Layer;
    this.makeLayerCommand("Rename Layer", id, before, after);
  }

  moveLayerInStack(id: string, targetIndex: number): void {
    const d = this.doc(); if (!d) return;
    const from = d.layerIndex(id); if (from < 0) return;
    const layer = d.layers[from]!;
    const rest = d.layers.filter((l) => l.id !== id);
    const target = clamp(targetIndex, 0, rest.length);
    rest.splice(target, 0, layer);
    const before = layersSnapshot(d.layers);
    const after = layersSnapshot(rest);
    useEditorStore.setState({ doc: new EditorDocument(d.width, d.height, rest) });
    this.pushHistory({
      name: "Reorder",
      bytes: 256,
      undo: () => { const d2 = this.doc(); if (!d2) return; useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, before) }); },
      redo: () => { const d2 = this.doc(); if (!d2) return; useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, after) }); },
    });
  }

  groupSelected(): void {
    const d = this.doc(); const sel = useEditorStore.getState().selectedIds;
    if (!d || sel.length < 2) return;
    const selSet = new Set(sel);
    const indices = d.layers.map((l, i) => selSet.has(l.id) ? i : -1).filter((i) => i >= 0);
    const topIdx = Math.max(...indices);
    const group = createGroupLayer("Group");
    const children = d.layers.filter((l) => selSet.has(l.id)).map((l) => ({ ...l, parentId: group.id } as Layer));
    const before = layersSnapshot(d.layers);
    const newLayers: Layer[] = [];
    for (let i = 0; i < d.layers.length; i++) {
      if (i === topIdx) { newLayers.push(group); for (const c of children) newLayers.push(c); }
      else if (!selSet.has(d.layers[i]!.id)) newLayers.push(d.layers[i]!);
    }
    const after = layersSnapshot(newLayers);
    useEditorStore.setState({ doc: new EditorDocument(d.width, d.height, newLayers), selectedIds: [group.id] });
    this.pushHistory({ name: "Group", bytes: 512, undo: () => { const d2 = this.doc(); if (!d2) return; useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, before) }); }, redo: () => { const d2 = this.doc(); if (!d2) return; useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, after) }); } });
  }

  ungroupSelected(): void {
    const d = this.doc(); const sel = useEditorStore.getState().selectedIds;
    if (!d) return;
    const groupIds = new Set(d.layers.filter((l) => sel.includes(l.id) && l.type === "group").map((l) => l.id));
    if (groupIds.size === 0) return;
    const before = layersSnapshot(d.layers);
    const newLayers: Layer[] = [];
    for (const l of d.layers) {
      if (groupIds.has(l.id)) continue;
      if (l.parentId && groupIds.has(l.parentId)) newLayers.push({ ...l, parentId: null } as Layer);
      else newLayers.push(l);
    }
    const after = layersSnapshot(newLayers);
    useEditorStore.setState({ doc: new EditorDocument(d.width, d.height, newLayers), selectedIds: [] });
    this.pushHistory({ name: "Ungroup", bytes: 512, undo: () => { const d2 = this.doc(); if (!d2) return; useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, before) }); }, redo: () => { const d2 = this.doc(); if (!d2) return; useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, after) }); } });
  }

  mergeDown(): void {
    const d = this.doc(); const sel = useEditorStore.getState().selectedIds;
    if (!d || sel.length === 0) return;
    const topId = sel[sel.length - 1]!;
    const topIdx = d.layerIndex(topId);
    if (topIdx <= 0) return;
    const bottom = d.layers[topIdx - 1];
    const top = d.layers[topIdx];
    if (!bottom || !top) return;
    const bottomCanvas = bottom.type === "image" ? pixelStore.get((bottom as ImageLayer).imageId) : null;
    const topCanvas = top.type === "image" ? pixelStore.get((top as ImageLayer).imageId) : null;
    if (!bottomCanvas || !topCanvas) return;
    const before = layersSnapshot(d.layers);
    const beforeSnap = snapshotCanvas(bottomCanvas, { x: 0, y: 0, width: bottomCanvas.width, height: bottomCanvas.height });
    const ctx = getContext2d(bottomCanvas);
    ctx.globalAlpha = top.opacity;
    ctx.globalCompositeOperation = "source-over";
    ctx.drawImage(topCanvas, top.transform.x - bottom.transform.x, top.transform.y - bottom.transform.y);
    const newLayers = d.layers.filter((_, i) => i !== topIdx);
    const afterSnap = snapshotCanvas(bottomCanvas, { x: 0, y: 0, width: bottomCanvas.width, height: bottomCanvas.height });
    const after = layersSnapshot(newLayers);
    useEditorStore.setState({ doc: new EditorDocument(d.width, d.height, newLayers), selectedIds: [bottom.id] });
    this.pushHistory({ name: "Merge Down", bytes: 1024, undo: () => { restoreSnapshot(bottomCanvas, { x: 0, y: 0, width: bottomCanvas.width, height: bottomCanvas.height }, beforeSnap); const d2 = this.doc(); if (!d2) return; useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, before) }); }, redo: () => { restoreSnapshot(bottomCanvas, { x: 0, y: 0, width: bottomCanvas.width, height: bottomCanvas.height }, afterSnap); const d2 = this.doc(); if (!d2) return; useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, after) }); } });
  }

  flattenImage(): void {
    const d = this.doc(); if (!d) return;
    const composite = this.getComposite();
    if (!composite) return;
    const before = layersSnapshot(d.layers);
    const bg = createImageLayerFromCanvas(composite, "Background");
    const after = [bg];
    useEditorStore.setState({ doc: new EditorDocument(d.width, d.height, after), selectedIds: [bg.id] });
    this.pushHistory({ name: "Flatten", bytes: composite.width * composite.height * 4, undo: () => { const d2 = this.doc(); if (!d2) return; useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, before), selectedIds: [] }); }, redo: () => { const d2 = this.doc(); if (!d2) return; useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, after), selectedIds: [bg.id] }); } });
    this.requestRender();
  }

  // ── masks ──

  addMaskToLayer(id: string): void {
    const d = this.doc(); const l = d?.getLayer(id); if (!l || l.type === "group" || l.type === "adjustment") return;
    if (l.mask) return;
    const maskId = genId("mask");
    const w = Math.max(1, l.transform.width);
    const h = Math.max(1, l.transform.height);
    const c = createCanvas(w, h);
    const ctx = getContext2d(c);
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, w, h);
    maskStore.set(maskId, c);
    const patch = { mask: { id: maskId, enabled: true, linked: true } } as Partial<Layer>;
    const before = layerSnapshot(l);
    const after = { ...layerSnapshot(l), ...patch } as Layer;
    this.makeLayerCommand("Add Mask", id, before, after);
    this.requestRender();
  }

  removeMaskFromLayer(id: string): void {
    const d = this.doc(); const l = d?.getLayer(id); if (!l || !l.mask) return;
    const doc = d!;
    const maskId = l.mask.id;
    const before = layerSnapshot(l);
    const after = { ...layerSnapshot(l), mask: null } as Layer;
    const restore = (): void => {
      const d2 = this.doc(); const ll = d2?.getLayer(id);
      if (ll && ll.mask) maskStore.delete(ll.mask.id);
    };
    this.pushHistory({
      name: "Remove Mask",
      bytes: 256,
      undo: () => { const d2 = this.doc(); if (!d2) return; useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, d2.layers.map((x) => (x.id === id ? before : x))) }); },
      redo: () => { restore(); useEditorStore.setState({ doc: new EditorDocument(doc.width, doc.height, doc.layers.map((x) => (x.id === id ? after : x))) }); },
    });
    maskStore.delete(maskId);
    useEditorStore.setState({ doc: new EditorDocument(doc.width, doc.height, doc.layers.map((x) => (x.id === id ? after : x))) });
    this.requestRender();
  }

  toggleMaskEnabled(id: string): void {
    const d = this.doc(); const l = d?.getLayer(id); if (!l || !l.mask) return;
    const before = layerSnapshot(l);
    const after = { ...layerSnapshot(l), mask: { ...l.mask, enabled: !l.mask.enabled } } as Layer;
    this.makeLayerCommand("Toggle Mask", id, before, after);
    this.requestRender();
  }

  applyMaskToLayer(id: string): void {
    const d = this.doc(); const l = d?.getLayer(id); if (!l || l.type !== "image" || !l.mask) return;
    const imgLayer = l as ImageLayer;
    const src = pixelStore.get(imgLayer.imageId);
    const mask = maskStore.get(l.mask.id);
    if (!src || !mask) return;
    const doc = d!;
    const baked = createCanvas(src.width, src.height);
    const bctx = getContext2d(baked);
    bctx.clearRect(0, 0, src.width, src.height);
    bctx.drawImage(src, 0, 0);
    bctx.globalCompositeOperation = "destination-in";
    bctx.drawImage(mask, 0, 0, src.width, src.height);
    bctx.globalCompositeOperation = "source-over";
    const before = layersSnapshot(doc.layers);
    pixelStore.set(imgLayer.imageId, baked);
    const after = doc.layers.map((x) => (x.id === id ? { ...x, mask: null } as Layer : layerSnapshot(x)));
    const apply = (lyrs: Layer[]) => { const d2 = this.doc(); if (!d2) return; useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, lyrs), selectedIds: [id] }); };
    this.pushHistory({
      name: "Apply Mask",
      bytes: src.width * src.height * 4,
      undo: () => { pixelStore.set(imgLayer.imageId, src); apply(before); },
      redo: () => { pixelStore.set(imgLayer.imageId, baked); apply(after); },
    });
    maskStore.delete(l.mask.id);
    apply(after);
    this.markDirty();
    this.requestRender();
  }

  paintMaskDab(id: string, x: number, y: number, brushSize: number, erase: boolean, hardness = 1, alpha = 1): void {
    const d = this.doc(); const l = d?.getLayer(id); if (!l || !l.mask) return;
    const mask = maskStore.get(l.mask.id);
    if (!mask) return;
    const ctx = getContext2d(mask);
    ctx.globalCompositeOperation = "source-over";
    ctx.filter = "none";
    if (erase) {
      ctx.globalCompositeOperation = "destination-out";
    }
    const r = Math.max(0.5, brushSize / 2);
    const g = Math.max(0, Math.min(1, hardness));
    if (g >= 1) {
      ctx.globalAlpha = alpha;
      ctx.fillStyle = erase ? "#ffffff" : "#000000";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else {
      const grad = ctx.createRadialGradient(x, y, r * (1 - g), x, y, r);
      grad.addColorStop(0, erase ? `rgba(255,255,255,${alpha})` : `rgba(0,0,0,${alpha})`);
      grad.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    if (erase) ctx.globalCompositeOperation = "source-over";
    ctx.filter = "none";
    this.requestRender();
  }

  private _maskPaintBefore: { maskId: string; before: HTMLCanvasElement } | null = null;

  /** Start a mask-painting stroke: snapshot the mask for one undo entry. */
  beginMaskPaint(id: string): void {
    const d = this.doc(); const l = d?.getLayer(id); if (!l || !l.mask) return;
    const mask = maskStore.get(l.mask.id);
    if (!mask) return;
    const c = createCanvas(mask.width, mask.height);
    getContext2d(c).drawImage(mask, 0, 0);
    this._maskPaintBefore = { maskId: l.mask.id, before: c };
  }

  /** End a mask-painting stroke and commit one undo entry. */
  endMaskPaint(id: string): void {
    if (!this._maskPaintBefore) return;
    const d = this.doc(); const l = d?.getLayer(id); if (!l || !l.mask) return;
    const beforeCanvas = this._maskPaintBefore.before;
    const afterCanvas = maskStore.get(l.mask.id);
    this._maskPaintBefore = null;
    if (!afterCanvas) return;
    this.pushHistory({
      name: "Paint Mask",
      bytes: afterCanvas.width * afterCanvas.height,
      undo: () => { const m = this.doc()?.getLayer(id); if (m && m.mask) maskStore.set(m.mask.id, beforeCanvas); this.requestRender(); },
      redo: () => { const m = this.doc()?.getLayer(id); if (m && m.mask) maskStore.set(m.mask.id, afterCanvas); this.requestRender(); },
    });
    this.markDirty();
  }

  setMaskLinked(id: string, linked: boolean): void {
    const d = this.doc(); const l = d?.getLayer(id); if (!l || !l.mask) return;
    const before = layerSnapshot(l);
    const after = { ...layerSnapshot(l), mask: { ...l.mask, linked } } as Layer;
    this.makeLayerCommand(linked ? "Link Mask" : "Unlink Mask", id, before, after);
    this.requestRender();
  }

  private maskDataOf(id: string): { canvas: HTMLCanvasElement; data: Uint8ClampedArray; w: number; h: number } | null {
    const d = this.doc(); const l = d?.getLayer(id); if (!l || !l.mask) return null;
    const canvas = maskStore.get(l.mask.id);
    if (!canvas) return null;
    const ctx = getContext2d(canvas);
    const w = canvas.width;
    const h = canvas.height;
    const data = ctx.getImageData(0, 0, w, h).data;
    return { canvas, data, w, h };
  }

  private writeMaskData(e: { canvas: HTMLCanvasElement; data: Uint8ClampedArray; w: number; h: number }): void {
    const ctx = getContext2d(e.canvas);
    const img = ctx.createImageData(e.w, e.h);
    img.data.set(e.data);
    ctx.putImageData(img, 0, 0);
  }

  invertMaskLayer(id: string): void {
    const e = this.maskDataOf(id); if (!e) return;
    const beforeData = e.data.slice();
    const after = e.data.slice();
    for (let i = 3; i < after.length; i += 4) after[i] = 255 - after[i];
    this.writeMaskData({ ...e, data: after });
    this.pushMaskDataEdit("Invert Mask", id, beforeData, after);
  }

  blurMaskLayer(id: string, radius: number): void {
    const r = Math.max(0, Math.round(radius));
    const e = this.maskDataOf(id); if (!e) return;
    if (r === 0) return;
    const beforeData = e.data.slice();
    const alpha = new Float64Array(e.w * e.h);
    for (let i = 0; i < e.w * e.h; i++) alpha[i] = e.data[i * 4 + 3]!;
    const tmp = new Float64Array(alpha.length);
    for (let pass = 0; pass < 2; pass++) {
      for (let y = 0; y < e.h; y++) {
        for (let x = 0; x < e.w; x++) {
          let acc = 0;
          let n = 0;
          for (let k = -r; k <= r; k++) {
            const xx = x + k;
            if (xx < 0 || xx >= e.w) continue;
            acc += alpha[y * e.w + xx]!;
            n++;
          }
          tmp[y * e.w + x] = acc / n;
        }
      }
      for (let i = 0; i < alpha.length; i++) alpha[i] = tmp[i]!;
      for (let x = 0; x < e.w; x++) {
        for (let y = 0; y < e.h; y++) {
          let acc = 0;
          let n = 0;
          for (let k = -r; k <= r; k++) {
            const yy = y + k;
            if (yy < 0 || yy >= e.h) continue;
            acc += alpha[yy * e.w + x]!;
            n++;
          }
          tmp[y * e.w + x] = acc / n;
        }
      }
      for (let i = 0; i < alpha.length; i++) alpha[i] = tmp[i]!;
    }
    const after = e.data.slice();
    for (let idx = 0; idx < e.w * e.h; idx++) after[idx * 4 + 3] = Math.round(alpha[idx]!);
    this.writeMaskData({ ...e, data: after });
    this.pushMaskDataEdit("Blur Mask", id, beforeData, after);
  }

  levelsMaskLayer(id: string, p: { black: number; mid: number; white: number }): void {
    const e = this.maskDataOf(id); if (!e) return;
    const beforeData = e.data.slice();
    const bl = Math.max(0, Math.min(254, p.black ?? 0));
    const wh = Math.max(1, Math.min(255, p.white ?? 255));
    const mid = Math.max(0.1, Math.min(9.9, p.mid ?? 1));
    const range = Math.max(1, wh - bl);
    const lut = new Uint8ClampedArray(256);
    for (let v = 0; v < 256; v++) {
      let c = (v - bl) / range;
      if (c < 0) c = 0;
      if (c > 1) c = 1;
      lut[v] = Math.round(Math.pow(c, 1 / mid) * 255);
    }
    const after = e.data.slice();
    for (let i = 3; i < after.length; i += 4) after[i] = lut[after[i]!]!;
    this.writeMaskData({ ...e, data: after });
    this.pushMaskDataEdit("Levels Mask", id, beforeData, after);
  }

  maskFromSelection(id: string): void {
    const d = this.doc(); const l = d?.getLayer(id); if (!l || l.type === "group" || l.type === "adjustment") return;
    const sel = selectionEngine.getMask();
    if (!sel) return;
    let maskId = l.mask?.id ?? null;
    if (!maskId) {
      maskId = genId("mask");
      const w = Math.max(1, l.transform.width);
      const h = Math.max(1, l.transform.height);
      const c = createCanvas(w, h);
      getContext2d(c).fillStyle = "#000000";
      getContext2d(c).fillRect(0, 0, w, h);
      maskStore.set(maskId, c);
    }
    const mask = maskStore.get(maskId);
    if (!mask || !d) return;
    const w = mask.width;
    const h = mask.height;
    const ctx = getContext2d(mask);
    const img = ctx.createImageData(w, h);
    // Sample the selection (doc-sized alpha 0..255, 255 = selected).
    // The selection engine stores fully-selected pixels as 1 and partials as
    // 0..255, so scale values in the 0..1 range up to alpha.
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = Math.round(l.transform.x) + x;
        const dy = Math.round(l.transform.y) + y;
        let a = 0;
        if (dx >= 0 && dx < d.width && dy >= 0 && dy < d.height) {
          const sv = sel[dy * d.width + dx]!;
          a = sv <= 1 ? Math.round(sv * 255) : sv;
        }
        const i = (y * w + x) * 4;
        img.data[i] = 0;
        img.data[i + 1] = 0;
        img.data[i + 2] = 0;
        img.data[i + 3] = a;
      }
    }
    ctx.putImageData(img, 0, 0);
    const before = layerSnapshot(l);
    const after = { ...layerSnapshot(l), mask: l.mask ?? ({ id: maskId, enabled: true, linked: true } as Layer["mask"]) } as Layer;
    this.makeLayerCommand(l.mask ? "Fill Mask From Selection" : "Mask From Selection", id, before, after);
    this.requestRender();
  }

  selectionFromMask(id: string): void {
    const d = this.doc(); const l = d?.getLayer(id); if (!l || !l.mask) return;
    const mask = maskStore.get(l.mask.id);
    if (!mask || !d) return;
    const w = mask.width;
    const h = mask.height;
    const ctx = getContext2d(mask);
    const src = ctx.getImageData(0, 0, w, h).data;
    selectionEngine.resize(d.width, d.height);
    const out = new Uint8ClampedArray(d.width * d.height).fill(0);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = Math.min(d.width - 1, Math.max(0, Math.round(l.transform.x) + x));
        const dy = Math.min(d.height - 1, Math.max(0, Math.round(l.transform.y) + y));
        out[dy * d.width + dx] = src[(y * w + x) * 4 + 3]!;
      }
    }
    selectionEngine.setMask(out);
    this.requestRender();
  }

  private pushMaskDataEdit(name: string, id: string, beforeData: Uint8ClampedArray, afterData: Uint8ClampedArray): void {
    const d = this.doc(); const l = d?.getLayer(id); if (!l || !l.mask) return;
    const canvas = maskStore.get(l.mask.id);
    if (!canvas) return;
    const put = (data: Uint8ClampedArray): void => {
      const m = this.doc()?.getLayer(id);
      const c = m && m.mask ? maskStore.get(m.mask.id) : null;
      if (!c) return;
      const w = c.width;
      const h = c.height;
      const img = getContext2d(c).createImageData(w, h);
      img.data.set(data);
      getContext2d(c).putImageData(img, 0, 0);
      this.requestRender();
    };
    this.pushHistory({
      name,
      bytes: canvas.width * canvas.height,
      undo: () => put(beforeData),
      redo: () => put(afterData),
    });
    this.markDirty();
  }

  // ── clipping ──

  toggleClipping(id: string): void {
    const d = this.doc(); const l = d?.getLayer(id); if (!l || l.type === "group" || l.type === "adjustment") return;
    const doc = d!;
    const before = layerSnapshot(l);
    if (l.clipTo) {
      const after = { ...layerSnapshot(l), clipTo: null } as Layer;
      this.makeLayerCommand("Release Clip", id, before, after);
    } else {
      const idx = doc.layerIndex(id);
      let base: Layer | null = null;
      for (let i = idx - 1; i >= 0; i--) {
        const cand = doc.layers[i]!;
        if (cand.type === "group" || cand.type === "adjustment") continue;
        base = cand;
        break;
      }
      if (!base) return;
      const after = { ...layerSnapshot(l), clipTo: base.id } as Layer;
      this.makeLayerCommand("Create Clip", id, before, after);
    }
    this.requestRender();
  }

  // ── gradient ──

  paintGradient(kind: "linear" | "radial", x1: number, y1: number, x2: number, y2: number, stops: { pos: number; color: string }[], targetId?: string): void {
    const d = this.doc(); if (!d) return;
    let targetLayer: Layer | undefined;
    if (targetId) targetLayer = d.getLayer(targetId);
    else {
      const sel = useEditorStore.getState().selectedIds;
      if (sel.length > 0) targetLayer = d.getLayer(sel[sel.length - 1]!);
    }
    if (targetLayer && targetLayer.type !== "image") targetLayer = undefined;
    let c: HTMLCanvasElement;
    if (targetLayer && pixelStore.get((targetLayer as ImageLayer).imageId)) {
      c = createCanvas(d.width, d.height);
      const ctx = getContext2d(c);
      ctx.drawImage(pixelStore.get((targetLayer as ImageLayer).imageId)!, 0, 0);
    } else {
      c = createCanvas(d.width, d.height);
    }
    const ctx = getContext2d(c);
    const grad = kind === "linear"
      ? ctx.createLinearGradient(x1, y1, x2, y2)
      : ctx.createRadialGradient(x1, y1, Math.max(1, Math.hypot(x2 - x1, y2 - y1)), x2, y2, Math.max(1, Math.hypot(x2 - x1, y2 - y1) * 1.5));
    for (const s of stops) grad.addColorStop(s.pos, s.color);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, d.width, d.height);
    if (selectionEngine.hasSelection && !selectionEngine.isHidden()) {
      const [sw, sh] = selectionEngine.dims;
      if (sw === d.width && sh === d.height) {
        const mask = selectionEngine.getMask();
        if (mask) {
          const img = ctx.getImageData(0, 0, d.width, d.height);
          const data = img.data;
          for (let y = 0; y < d.height; y++) {
            const row = y * d.width;
            for (let x = 0; x < d.width; x++) {
              const a = mask[row + x];
              const i = (row + x) * 4;
              data[i + 3] = (data[i + 3] * this.selectionAlpha(a)) >> 8;
            }
          }
          ctx.putImageData(img, 0, 0);
        }
      }
    }
    const newLayer = createImageLayerFromCanvas(c, "Gradient", 0, 0);
    const after = layersSnapshot([newLayer]);
    const before = layersSnapshot(d.layers);
    useEditorStore.setState({ doc: new EditorDocument(d.width, d.height, [...d.layers, newLayer]), selectedIds: [newLayer.id] });
    this.pushHistory({
      name: "Gradient",
      bytes: d.width * d.height * 4,
      undo: () => { const d2 = this.doc(); if (!d2) return; useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, before), selectedIds: [] }); },
      redo: () => { const d2 = this.doc(); if (!d2) return; pixelStore.set(newLayer.imageId, c); useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, [...d2.layers, newLayer]), selectedIds: [newLayer.id] }); },
    });
    this.markDirty();
    this.requestRender();
  }

  // ── composite ──

  getComposite(): HTMLCanvasElement | null {
    const d = this.doc(); if (!d) return null;
    return compositeToCanvas(d, { pixels: pixelStore });
  }

  private _cachedCompositeVersion = -1;
  private _cachedCompositeKey: string | null = null;
  private _cachedCompositeCanvas: HTMLCanvasElement | null = null;

  /** Original document state (opened-session reference) used by Before/After. */
  private _origRefs = new Map<string, { canvas: HTMLCanvasElement | null; docW: number; docH: number }>();

  private captureBeforeRef(key: string, doc?: EditorDocument): void {
    try {
      const d = doc ?? this._docs.get(key) ?? (key === this._activeKey ? this.doc() : null);
      if (!d) {
        this._origRefs.set(key, { canvas: null, docW: 0, docH: 0 });
        return;
      }
      const comp = compositeToCanvas(d, { pixels: pixelStore });
      if (!comp) {
        this._origRefs.set(key, { canvas: null, docW: d.width, docH: d.height });
        return;
      }
      this._origRefs.set(key, {
        canvas: downscaleCanvas(comp, COMPARE_MAX_REF_DIM),
        docW: d.width,
        docH: d.height,
      });
    } catch {
      const d = doc ?? this._docs.get(key) ?? (key === this._activeKey ? this.doc() : null);
      this._origRefs.set(key, { canvas: null, docW: d?.width ?? 0, docH: d?.height ?? 0 });
    }
  }

  /** The stored "Before" reference for the active document (lazy fallback capture). */
  getBeforeRef(): HTMLCanvasElement | null {
    const info = this.getBeforeRefInfo();
    return info?.canvas ?? null;
  }

  /** The stored "Before" reference for a specific document key (lazy fallback capture). */
  getBeforeRefForKey(key: string): HTMLCanvasElement | null {
    const info = this.getBeforeRefInfoForKey(key);
    return info?.canvas ?? null;
  }

  /** Before details (canvas + original dimensions) for the active document. */
  getBeforeRefInfo(): { canvas: HTMLCanvasElement | null; docW: number; docH: number } | null {
    if (!this._activeKey) return null;
    return this.getBeforeRefInfoForKey(this._activeKey);
  }

  /** Before details (canvas + original dimensions) for a specific document key. */
  getBeforeRefInfoForKey(key: string): { canvas: HTMLCanvasElement | null; docW: number; docH: number } | null {
    if (!this._origRefs.has(key)) this.captureBeforeRef(key);
    const info = this._origRefs.get(key);
    if (!info) return null;
    if (info.canvas) return info;
    this.captureBeforeRef(key);
    const again = this._origRefs.get(key);
    if (!again) return null;
    if (again.canvas) return again;
    if (again.docW === 0 && again.docH === 0) return null;
    return again;
  }

  private getCompositeCached(): HTMLCanvasElement | null {
    if (
      this._cachedCompositeVersion === this.version &&
      this._cachedCompositeKey === this._activeKey &&
      this._cachedCompositeCanvas
    ) {
      return this._cachedCompositeCanvas;
    }
    const comp = this.getComposite();
    this._cachedCompositeCanvas = comp;
    this._cachedCompositeVersion = this.version;
    this._cachedCompositeKey = this._activeKey;
    return comp;
  }

  samplePixelInDoc(docX: number, docY: number): { r: number; g: number; b: number; a: number } | null {
    const comp = this.getCompositeCached();
    if (!comp) return null;
    const ctx = comp.getContext("2d", { willReadFrequently: true });
    if (!ctx) return null;
    const x = Math.floor(docX);
    const y = Math.floor(docY);
    if (x < 0 || y < 0 || x >= comp.width || y >= comp.height) return null;
    const data = ctx.getImageData(x, y, 1, 1).data;
    return { r: data[0], g: data[1], b: data[2], a: data[3] };
  }

  // ── crop / resize ──

  applyCrop(rect: { x: number; y: number; width: number; height: number }): void {
    const d = this.doc(); if (!d) return;
    const x0 = Math.round(clamp(rect.x, 0, d.width));
    const y0 = Math.round(clamp(rect.y, 0, d.height));
    const x1 = Math.round(clamp(rect.x + rect.width, 0, d.width));
    const y1 = Math.round(clamp(rect.y + rect.height, 0, d.height));
    if (x1 <= x0 || y1 <= y0) return;
    const before = layersSnapshot(d.layers);
    const pixBefore = new Map<string, HTMLCanvasElement>();
    const pixAfter = new Map<string, HTMLCanvasElement>();
    const newLayers: Layer[] = [];
    for (const l of d.layers) {
      if (l.parentId) { newLayers.push(layerSnapshot(l)); continue; }
      const copy = layerSnapshot(l);
      copy.transform.x -= x0;
      copy.transform.y -= y0;
      if (l.type === "image") {
        const src = pixelStore.get((l as ImageLayer).imageId);
        if (src && copy.transform.rotation === 0) {
          const clipped = createCanvas(Math.max(1, copy.transform.width), Math.max(1, copy.transform.height));
          const cctx = getContext2d(clipped);
          cctx.drawImage(src, -copy.transform.x, -copy.transform.y, d.width, d.height);
          pixBefore.set((l as ImageLayer).imageId, src);
          pixAfter.set((l as ImageLayer).imageId, clipped);
          pixelStore.set((l as ImageLayer).imageId, clipped);
        }
      }
      newLayers.push(copy);
    }
    const apply = (lyrs: Layer[], w: number, h: number) => {
      const d2 = this.doc(); if (!d2) return;
      useEditorStore.setState({ doc: new EditorDocument(w, h, lyrs), selectedIds: [] });
    };
    const restorePixels = (m: Map<string, HTMLCanvasElement>) => { for (const [id, c] of m) pixelStore.set(id, c); };
    const nw = x1 - x0, nh = y1 - y0;
    const after = layersSnapshot(newLayers);
    this.pushHistory({ name: "Crop", bytes: d.width * d.height * 4, undo: () => { restorePixels(pixBefore); apply(before, d.width, d.height); }, redo: () => { restorePixels(pixAfter); apply(after, nw, nh); } });
    apply(after, nw, nh);
    this.requestRender();
  }

  setImageSize(newW: number, newH: number): void {
    const d = this.doc(); if (!d) return;
    const sx = newW / d.width, sy = newH / d.height;
    const before = layersSnapshot(d.layers);
    const pixBefore = new Map<string, HTMLCanvasElement>();
    const pixAfter = new Map<string, HTMLCanvasElement>();
    const newLayers = d.layers.map((l) => {
      const copy = layerSnapshot(l);
      copy.transform.x *= sx; copy.transform.y *= sy; copy.transform.width *= sx; copy.transform.height *= sy;
      if (l.type === "image") {
        const src = pixelStore.get((l as ImageLayer).imageId);
        if (src) {
          const sc = createCanvas(Math.max(1, Math.round(src.width * sx)), Math.max(1, Math.round(src.height * sy)));
          getContext2d(sc).drawImage(src, 0, 0, sc.width, sc.height);
          pixBefore.set((l as ImageLayer).imageId, src);
          pixAfter.set((l as ImageLayer).imageId, sc);
          pixelStore.set((l as ImageLayer).imageId, sc);
        }
      }
      if (l.type === "text") (copy as TextLayer).fontSize *= Math.min(sx, sy);
      return copy;
    });
    const after = layersSnapshot(newLayers);
    const apply = (lyrs: Layer[], w: number, h: number) => { const d2 = this.doc(); if (!d2) return; useEditorStore.setState({ doc: new EditorDocument(w, h, lyrs) }); };
    const restorePixels = (m: Map<string, HTMLCanvasElement>) => { for (const [id, c] of m) pixelStore.set(id, c); };
    this.pushHistory({ name: "Image Size", bytes: d.width * d.height * 4, undo: () => { restorePixels(pixBefore); apply(before, d.width, d.height); }, redo: () => { restorePixels(pixAfter); apply(after, newW, newH); } });
    apply(after, newW, newH);
    this.requestRender();
  }

  setCanvasSize(newW: number, newH: number): void {
    const d = this.doc(); if (!d) return;
    const dx = (newW - d.width) / 2, dy = (newH - d.height) / 2;
    const before = layersSnapshot(d.layers);
    const newLayers = d.layers.map((l) => { const c = layerSnapshot(l); c.transform.x += dx; c.transform.y += dy; return c; });
    const after = layersSnapshot(newLayers);
    const apply = (lyrs: Layer[], w: number, h: number) => { const d2 = this.doc(); if (!d2) return; useEditorStore.setState({ doc: new EditorDocument(w, h, lyrs) }); };
    this.pushHistory({ name: "Canvas Size", bytes: 1024, undo: () => apply(before, d.width, d.height), redo: () => apply(after, newW, newH) });
    apply(after, newW, newH);
    this.requestRender();
  }

  rotateDocument90(cw: boolean): void {
    const d = this.doc(); if (!d) return;
    const before = layersSnapshot(d.layers);
    const newLayers = d.layers.map((l) => {
      const copy = layerSnapshot(l);
      if (!l.parentId && l.type === "image") {
        const src = pixelStore.get((l as ImageLayer).imageId);
        if (src) {
          const rot = createCanvas(src.height, src.width);
          const rctx = getContext2d(rot);
          rctx.translate(rot.width / 2, rot.height / 2);
          rctx.rotate((cw ? 90 : -90) * Math.PI / 180);
          rctx.drawImage(src, -src.width / 2, -src.height / 2);
          pixelStore.set((l as ImageLayer).imageId, rot);
        }
      }
      if (!l.parentId) {
        const t = copy.transform;
        const cx = t.x + t.width / 2, cy = t.y + t.height / 2;
        const ncx = cw ? d.height - cy : cy, ncy = cw ? cx : d.width - cx;
        t.x = ncx - t.height / 2; t.y = ncy - t.width / 2;
        t.rotation += cw ? 90 : -90;
        const w = t.width; t.width = t.height; t.height = w;
      }
      return copy;
    });
    const nw = cw ? d.height : d.width, nh = cw ? d.width : d.height;
    const after = layersSnapshot(newLayers);
    const apply = (lyrs: Layer[], w: number, h: number) => { const d2 = this.doc(); if (!d2) return; useEditorStore.setState({ doc: new EditorDocument(w, h, lyrs) }); };
    this.pushHistory({ name: cw ? "Rotate 90° CW" : "Rotate 90° CCW", bytes: 1024, undo: () => apply(before, d.width, d.height), redo: () => apply(after, nw, nh) });
    apply(after, nw, nh);
    this.requestRender();
  }

  flipDocument(horiz: boolean): void {
    const d = this.doc(); if (!d) return;
    const before = layersSnapshot(d.layers);
    const newLayers = d.layers.map((l) => {
      const copy = layerSnapshot(l);
      if (!l.parentId) {
        const t = copy.transform;
        if (horiz) { t.x = d.width - t.x - t.width; t.scaleX = -t.scaleX; }
        else { t.y = d.height - t.y - t.height; t.scaleY = -t.scaleY; }
      }
      return copy;
    });
    const after = layersSnapshot(newLayers);
    const apply = (lyrs: Layer[]) => { const d2 = this.doc(); if (!d2) return; useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, lyrs) }); };
    this.pushHistory({ name: horiz ? "Flip H" : "Flip V", bytes: 1024, undo: () => apply(before), redo: () => apply(after) });
    apply(after);
    this.requestRender();
  }

  // ── selection ops ──

  copySelection(): void {
    const d = this.doc();
    if (!d) return;
    const composite = this.getComposite();
    if (!composite) return;
    const sel = selectionEngine;
    if (!sel.hasSelection || sel.isHidden()) {
      clipboardCanvas = composite;
      clipboardOriginX = 0; clipboardOriginY = 0;
      return;
    }
    const [dw, dh] = sel.dims;
    const mask = sel.getMask();
    if (!mask || dw !== d.width || dh !== d.height) {
      clipboardCanvas = composite;
      clipboardOriginX = 0; clipboardOriginY = 0;
      return;
    }
    let minX = dw, minY = dh, maxX = -1, maxY = -1;
    for (let y = 0; y < dh; y++) {
      const row = y * dw;
      for (let x = 0; x < dw; x++) {
        if (mask[row + x] > 0) {
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (y < minY) minY = y;
          if (y > maxY) maxY = y;
        }
      }
    }
    if (maxX < 0 || maxY < 0) {
      clipboardCanvas = composite;
      clipboardOriginX = 0; clipboardOriginY = 0;
      return;
    }
    const bw = maxX - minX + 1;
    const bh = maxY - minY + 1;
    const out = createCanvas(bw, bh);
    const octx = getContext2d(out);
    octx.drawImage(composite, -minX, -minY, bw, bh, 0, 0, bw, bh);
    const img = octx.getImageData(0, 0, bw, bh);
    for (let y = 0; y < bh; y++) {
      const row = (y + minY) * dw;
      for (let x = 0; x < bw; x++) {
        if (mask[row + x + minX] === 0) img.data[(y * bw + x) * 4 + 3] = 0;
      }
    }
    octx.putImageData(img, 0, 0);
    clipboardCanvas = out;
    clipboardOriginX = minX;
    clipboardOriginY = minY;
  }

  cutSelection(): void {
    this.copySelection();
    this.deleteSelection();
  }

  pasteClipboard(): void {
    const d = this.doc(); if (!d || !clipboardCanvas) return;
    const layer = createImageLayerFromCanvas(clipboardCanvas, "Pasted", clipboardOriginX, clipboardOriginY);
    this.addLayer(layer, "Paste");
  }

  deleteSelection(): void {
    const d = this.doc();
    const layer = this.topEditableImageLayer();
    if (!d || !layer || !selectionEngine.hasSelection) return;
    const canvas = pixelStore.get(layer.imageId);
    if (!canvas) return;
    const mask = selectionEngine.getMask();
    if (!mask) return;
    const before = snapshotCanvas(canvas, { x: 0, y: 0, width: canvas.width, height: canvas.height });
    const ctx = getContext2d(canvas);
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const ox = Math.round(layer.transform.x);
    const oy = Math.round(layer.transform.y);
    const docW = d.width;
    const docH = d.height;
    for (let ly = 0; ly < canvas.height; ly++) {
      const dy = oy + ly;
      if (dy < 0 || dy >= docH) continue;
      for (let lx = 0; lx < canvas.width; lx++) {
        const dx = ox + lx;
        if (dx < 0 || dx >= docW) continue;
        if (mask[dy * docW + dx] > 0) {
          const idx = (ly * canvas.width + lx) * 4;
          imgData.data[idx + 3] = 0;
        }
      }
    }
    ctx.putImageData(imgData, 0, 0);
    const after = snapshotCanvas(canvas, { x: 0, y: 0, width: canvas.width, height: canvas.height });
    this.pushHistory({ name: "Delete Selection", bytes: canvas.width * canvas.height * 4, undo: () => { restoreSnapshot(canvas, { x: 0, y: 0, width: canvas.width, height: canvas.height }, before); this.requestRender(); }, redo: () => { restoreSnapshot(canvas, { x: 0, y: 0, width: canvas.width, height: canvas.height }, after); this.requestRender(); } });
  }

  invertSelection(): void { selectionEngine.invert(); this.requestRender(); }
  selectAll(): void { const d = this.doc(); if (d) { selectionEngine.resize(d.width, d.height); selectionEngine.makeAll(); } this.requestRender(); }
  deselect(): void { selectionEngine.clear(); this.requestRender(); }

  growSelection(): void { const d = this.doc(); if (d) selectionEngine.resize(d.width, d.height); selectionEngine.expand(4); this.requestRender(); }
  contractSelection(): void { const d = this.doc(); if (d) selectionEngine.resize(d.width, d.height); selectionEngine.contract(4); this.requestRender(); }
  featherSelection(): void { const d = this.doc(); if (d) selectionEngine.resize(d.width, d.height); selectionEngine.feather(4); this.requestRender(); }

  fillSelection(color: string, opacity: number): void {
    const d = this.doc();
    const layer = this.topEditableImageLayer();
    if (!d || !layer) return;
    const canvas = pixelStore.get(layer.imageId);
    if (!canvas) return;
    const a = Math.max(0, Math.min(1, opacity));
    const [fr, fg, fb] = hexToRgb(color);
    const mask = selectionEngine.hasSelection ? selectionEngine.getMask() : null;
    const before = snapshotCanvas(canvas, { x: 0, y: 0, width: canvas.width, height: canvas.height });
    const ctx = getContext2d(canvas);
    const img = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const data = img.data;
    const ox = Math.round(layer.transform.x);
    const oy = Math.round(layer.transform.y);
    const docW = d.width;
    const docH = d.height;
    for (let ly = 0; ly < canvas.height; ly++) {
      const dy = oy + ly;
      if (dy < 0 || dy >= docH) continue;
      for (let lx = 0; lx < canvas.width; lx++) {
        const dx = ox + lx;
        if (dx < 0 || dx >= docW) continue;
        let f = a;
        if (mask) {
          const m = mask[dy * docW + dx];
          if (m === 0) continue;
          f = a * (m / 255);
        }
        const idx = (ly * canvas.width + lx) * 4;
        const oA = data[idx + 3] / 255;
        const sA = f + oA * (1 - f);
        if (sA <= 0) continue;
        data[idx] = Math.round((fr * f + data[idx] * oA * (1 - f)) / sA);
        data[idx + 1] = Math.round((fg * f + data[idx + 1] * oA * (1 - f)) / sA);
        data[idx + 2] = Math.round((fb * f + data[idx + 2] * oA * (1 - f)) / sA);
        data[idx + 3] = Math.round(sA * 255);
      }
    }
    ctx.putImageData(img, 0, 0);
    const after = snapshotCanvas(canvas, { x: 0, y: 0, width: canvas.width, height: canvas.height });
    this.pushHistory({
      name: "Fill",
      bytes: canvas.width * canvas.height * 4,
      undo: () => { restoreSnapshot(canvas, { x: 0, y: 0, width: canvas.width, height: canvas.height }, before); this.requestRender(); },
      redo: () => { restoreSnapshot(canvas, { x: 0, y: 0, width: canvas.width, height: canvas.height }, after); this.requestRender(); },
    });
    this.requestRender();
  }

  alignLayers(mode: "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom"): void {
    const d = this.doc(); if (!d) return;
    const ids = useEditorStore.getState().selectedIds;
    if (ids.length === 0) return;
    const before = layersSnapshot(d.layers);
    const newLayers = d.layers.map((l) => {
      if (l.type === "group" || l.parentId || !ids.includes(l.id)) return l;
      const copy = layerSnapshot(l);
      const t = copy.transform;
      switch (mode) {
        case "left": t.x = 0; break;
        case "hcenter": t.x = (d.width - t.width) / 2; break;
        case "right": t.x = d.width - t.width; break;
        case "top": t.y = 0; break;
        case "vcenter": t.y = (d.height - t.height) / 2; break;
        case "bottom": t.y = d.height - t.height; break;
      }
      return copy;
    });
    const after = layersSnapshot(newLayers);
    this.commitLayers(["Left Align", "Horizontal Center", "Right Align", "Top Align", "Vertical Center", "Bottom Align"][["left", "hcenter", "right", "top", "vcenter", "bottom"].indexOf(mode)] ?? "Align Layers", before, after, 1024);
  }

  distributeLayers(axis: "h" | "v"): void {
    const d = this.doc(); if (!d) return;
    const ids = useEditorStore.getState().selectedIds;
    const layers = d.layers.filter((l) => l.type !== "group" && !l.parentId && ids.includes(l.id));
    if (layers.length < 3) return;
    const sorted = layers
      .map((l) => ({ id: l.id, t: l.transform }))
      .sort((x, y) => (axis === "h" ? x.t.x + x.t.width / 2 - (y.t.x + y.t.width / 2) : x.t.y + x.t.height / 2 - (y.t.y + y.t.height / 2)));
    const first = sorted[0]!;
    const last = sorted[sorted.length - 1]!;
    const f = axis === "h" ? first.t.x + first.t.width / 2 : first.t.y + first.t.height / 2;
    const e = axis === "h" ? last.t.x + last.t.width / 2 : last.t.y + last.t.height / 2;
    const span = e - f;
    const gap = span / (sorted.length - 1);
    const before = layersSnapshot(d.layers);
    const newLayers = d.layers.map((l) => {
      if (l.type === "group" || l.parentId || !ids.includes(l.id)) return l;
      const pos = sorted.findIndex((s) => s.id === l.id);
      const center = f + gap * pos;
      const copy = layerSnapshot(l);
      if (axis === "h") copy.transform.x = center - copy.transform.width / 2;
      else copy.transform.y = center - copy.transform.height / 2;
      return copy;
    });
    const after = layersSnapshot(newLayers);
    this.commitLayers(axis === "h" ? "Distribute Horizontal" : "Distribute Vertical", before, after, 1024);
  }

  rasterizeSelected(): void {
    const d = this.doc(); if (!d) return;
    const ids = useEditorStore.getState().selectedIds;
    if (ids.length === 0) return;
    const before = layersSnapshot(d.layers);
    let any = false;
    const newLayers = d.layers.map((l) => {
      if (l.type === "image" || !ids.includes(l.id)) return l;
      const canvas = renderLayerToCanvas(l, d.width, d.height, { pixels: pixelStore });
      const img = createImageLayerFromCanvas(canvas, `${l.name} (Rasterized)`, 0, 0);
      img.transform.width = d.width;
      img.transform.height = d.height;
      img.opacity = l.opacity;
      img.blendMode = l.blendMode;
      img.visible = l.visible;
      any = true;
      return img;
    });
    if (!any) return;
    const after = layersSnapshot(newLayers);
    this.commitLayers("Rasterize Layer", before, after, 8192);
  }

  private commitLayers(name: string, before: Layer[], after: Layer[], bytes: number): void {
    const applyLayers = (lyrs: Layer[]) => {
      const d2 = this.doc(); if (!d2) return;
      useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, lyrs) });
    };
    this.pushHistory({ name, bytes, undo: () => applyLayers(before), redo: () => applyLayers(after) });
    applyLayers(after);
    this.requestRender();
  }

  // ── brush stroke ──

  commitStroke(layerId: string, strokeCanvas: HTMLCanvasElement, bbox: { x: number; y: number; width: number; height: number }, mode: "paint" | "erase" | "screen" | "multiply", historyName?: string): void {
    const d = this.doc(); const l = d?.getLayer(layerId);
    if (!l || l.type !== "image") return;
    const canvas = pixelStore.get((l as ImageLayer).imageId);
    if (!canvas) return;
    const r = { x: Math.max(0, Math.floor(bbox.x)), y: Math.max(0, Math.floor(bbox.y)), width: Math.ceil(bbox.width), height: Math.ceil(bbox.height) };
    r.width = Math.min(r.width, canvas.width - r.x);
    r.height = Math.min(r.height, canvas.height - r.y);
    if (r.width <= 0 || r.height <= 0) return;
    let src = strokeCanvas;
    const sel = selectionEngine;
    if (sel.hasSelection && !sel.isHidden()) {
      const [sw, sh] = sel.dims;
      const d = this.doc();
      if (d && sw === d.width && sh === d.height && r.x >= 0 && r.y >= 0) {
        const mask = sel.getMask();
        if (mask) {
          const mw = Math.max(1, Math.floor(r.width));
          const mh = Math.max(1, Math.floor(r.height));
          if (mw > 0 && mh > 0) {
            const masked = createCanvas(strokeCanvas.width, strokeCanvas.height);
            const mctx = getContext2d(masked);
            mctx.drawImage(strokeCanvas, 0, 0);
            const maskCanvas = createCanvas(mw, mh);
            const m2 = getContext2d(maskCanvas);
            const mImg = m2.createImageData(mw, mh);
            const md = mImg.data;
            const mrx = Math.max(0, Math.floor(r.x));
            const mry = Math.max(0, Math.floor(r.y));
            for (let y = 0; y < mh; y++) {
              const sy = mry + y;
              if (sy < 0 || sy >= sh) continue;
              const row = sy * sw;
              const outRow = y * mw * 4;
              for (let x = 0; x < mw; x++) {
                const sx = mrx + x;
                if (sx < 0 || sx >= sw) continue;
                md[outRow + x * 4 + 3] = this.selectionAlpha(mask[row + sx]);
              }
            }
            m2.putImageData(mImg, 0, 0);
            mctx.save();
            mctx.globalCompositeOperation = "destination-in";
            mctx.drawImage(maskCanvas, mrx, mry);
            mctx.restore();
            src = masked;
          }
        }
      }
    }
    const before = snapshotCanvas(canvas, r);
    const ctx = getContext2d(canvas);
    ctx.save();
    ctx.beginPath();
    ctx.rect(r.x, r.y, r.width, r.height);
    ctx.clip();
    ctx.globalCompositeOperation = mode === "erase" ? "destination-out" : mode === "screen" ? "screen" : mode === "multiply" ? "multiply" : "source-over";
    ctx.drawImage(src, 0, 0);
    ctx.restore();
    const after = snapshotCanvas(canvas, r);
    const calcBytes = (s: ReturnType<typeof snapshotCanvas>) => s.kind === "data" ? s.imageData.data.byteLength : s.url.length;
    this.pushHistory({ name: historyName ?? (mode === "erase" ? "Eraser" : "Brush Stroke"), bytes: calcBytes(before) + calcBytes(after), undo: () => { restoreSnapshot(canvas, r, before); this.requestRender(); }, redo: () => { restoreSnapshot(canvas, r, after); this.requestRender(); } });
  }

  private dabSprites = new Map<string, HTMLCanvasElement>();

  private brushDabSprite(size: number, hardness: number, color: string): HTMLCanvasElement {
    const key = `${Math.round(size)}:${hardness.toFixed(3)}:${color.toLowerCase()}`;
    let c = this.dabSprites.get(key);
    if (c) return c;
    if (this.dabSprites.size > 128) this.dabSprites.clear();
    const dim = Math.max(8, Math.ceil(size) + 8);
    c = createCanvas(dim, dim);
    const ctx = getContext2d(c);
    const pad = (dim - size) / 2;
    ctx.translate(pad, pad);
    if (hardness >= 1 || size < 3) {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(size / 2, size / 2, Math.max(0.75, size / 2), 0, Math.PI * 2);
      ctx.fill();
    } else {
      const r = size / 2;
      const inner = Math.max(0.5, r * hardness);
      const [cr, cg, cb] = hexToRgb(color);
      const g = ctx.createRadialGradient(r, r, 0, r, r, r);
      g.addColorStop(0, color);
      g.addColorStop(Math.min(0.999, inner / r), color);
      g.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(r, r, r, 0, Math.PI * 2);
      ctx.fill();
    }
    this.dabSprites.set(key, c);
    return c;
  }

  private stampDab(strokeCtx: CanvasRenderingContext2D, size: number, hardness: number, opacity: number, color: string, x: number, y: number): void {
    const sprite = this.brushDabSprite(size, hardness, color);
    const pad = (sprite.width - size) / 2;
    strokeCtx.save();
    strokeCtx.globalCompositeOperation = "source-over";
    strokeCtx.globalAlpha = Math.max(0, Math.min(1, opacity));
    strokeCtx.drawImage(sprite, Math.round(x - size / 2) - pad, Math.round(y - size / 2) - pad);
    strokeCtx.restore();
  }

  /**
   * Per-dab brush parameters. Uses real pen pressure (event.pressure, only for
   * pointerType === "pen" with a positive pressure) to scale dab size and alpha;
   * mouse input falls back to the configured values unchanged.
   */
  private strokeDabParams(e: PointerEvent, alpha: number, size: number): { alpha: number; size: number } {
    if (e && e.pointerType === "pen" && typeof e.pressure === "number" && e.pressure > 0) {
      const p = Math.min(1, Math.max(0, e.pressure));
      return {
        alpha: Math.max(0, Math.min(1, alpha * (0.3 + 0.7 * p))),
        size: Math.max(1, size * (0.5 + 0.5 * p)),
      };
    }
    return { alpha, size };
  }

  /**
   * Normalize a selection-mask value into a canvas alpha (0..255).
   * The selection engine stores "fully selected" pixels as `1` and
   * feather-soft values as 0..255, so `1` must map to full opacity.
   */
  private selectionAlpha(v: number): number {
    if (v <= 0) return 0;
    return v === 1 ? 255 : Math.min(255, Math.max(0, Math.round(v)));
  }

  /**
   * Brush dynamics + scatter, applied per dab (brush engine pro features).
   * Dynamics varies size/opacity, scatter offsets the dab position; both use
   * the real random source and are a no-op when set to 0 (default).
   */
  private brushDabVariation(opts: { dynamics: number; scatter: number }, size: number, alpha: number, x: number, y: number): { alpha: number; size: number; x: number; y: number } {
    const d = Math.max(0, Math.min(1, opts.dynamics));
    const sc = Math.max(0, Math.min(1, opts.scatter));
    if (d > 0) {
      const v = d * (Math.random() * 2 - 1);
      size = Math.max(1, size * (1 + 0.4 * v));
      alpha = Math.max(0, Math.min(1, alpha * (1 + 0.3 * v)));
    }
    if (sc > 0) {
      const r = Math.max(1, size * sc * 0.5);
      x += (Math.random() * 2 - 1) * r;
      y += (Math.random() * 2 - 1) * r;
    }
    return { alpha, size, x, y };
  }

  // ── paint tools (pencil / clone / heal / dodge / burn / smudge) ──

  private toolStampSize(tool: string): number {
    const opts = useEditorStore.getState().toolOptions;
    switch (tool) {
      case "brush":
      case "eraser": return opts.brush.size;
      case "pencil": return opts.pencil.size;
      case "clone": return opts.clone.size;
      case "heal": return opts.heal.size;
      case "dodge": return opts.dodge.size;
      case "burn": return opts.burn.size;
      default: return opts.smudge.size;
    }
  }

  private toolStrokeSpacing(tool: string): number {
    const opts = useEditorStore.getState().toolOptions;
    switch (tool) {
      case "brush":
      case "eraser": return opts.brush.spacing;
      case "pencil": return opts.pencil.spacing;
      case "clone": return opts.clone.spacing;
      case "heal": return opts.heal.spacing;
      case "dodge": return opts.dodge.spacing;
      case "burn": return opts.burn.spacing;
      default: return opts.smudge.spacing;
    }
  }

  private beginStrokeState(d: any): boolean {
    const s = this.activeToolState; if (!s) return false;
    const selId = useEditorStore.getState().selectedIds[0];
    const layer = selId ? d.getLayer(selId) : null;
    const imgLayer = layer && layer.type === "image" ? layer as ImageLayer : null;
    if (!imgLayer || imgLayer.locked) return false;
    s.transformId = imgLayer.id;
    s.strokeCanvas = document.createElement("canvas");
    s.strokeCanvas.width = d.width;
    s.strokeCanvas.height = d.height;
    s.strokeCtx = s.strokeCanvas.getContext("2d")!;
    return true;
  }

  /**
   * Convert a document-space pointer point to the active stroke layer's
   * pixel-canvas space, mirroring the compositor's forward transform
   * (translate -> rotate -> scale -> content box) without a DOMMatrix
   * dependency. Painted dabs therefore land on the correct pixels of
   * translated, scaled or rotated layers. Skewed layers keep the previous
   * document-space behaviour (skew is an edge case with no dab pipeline).
   */
  private strokePointFromDoc(docP: { x: number; y: number }): { x: number; y: number } | null {
    const s = this.activeToolState;
    if (!s?.transformId) return null;
    const d = this.doc();
    const layer = d?.getLayer(s.transformId);
    if (!layer || layer.type !== "image") return null;
    const canvas = pixelStore.get(layer.imageId); if (!canvas) return null;
    const t = layer.transform;
    const rad = (t.rotation * Math.PI) / 180;
    const cos = Math.cos(rad);
    const sin = Math.sin(rad);
    const dx = docP.x - t.x;
    const dy = docP.y - t.y;
    const rx = dx * cos + dy * sin;
    const ry = -dx * sin + dy * cos;
    const sx = t.scaleX !== 0 ? t.scaleX : 1;
    const sy = t.scaleY !== 0 ? t.scaleY : 1;
    const boxW = t.width !== 0 ? t.width : canvas.width;
    const boxH = t.height !== 0 ? t.height : canvas.height;
    return { x: (rx / sx) * (canvas.width / boxW), y: (ry / sy) * (canvas.height / boxH) };
  }

  private stampToolDab(tool: string, x: number, y: number): void {
    const s = this.activeToolState; if (!s || !s.strokeCtx) return;
    if (tool !== "clone" && tool !== "heal" && tool !== "smudge") {
      const lp = this.strokePointFromDoc({ x, y });
      if (lp) { x = lp.x; y = lp.y; }
    }
    const st = useEditorStore.getState();
    const opts = st.toolOptions;
    const size = this.toolStampSize(tool);
    const extraPersist = tool === "clone" || tool === "heal" ? Math.max(2, size * 0.15) : 0;
    s.strokeBBox.minX = Math.min(s.strokeBBox.minX, x - size / 2 - extraPersist);
    s.strokeBBox.minY = Math.min(s.strokeBBox.minY, y - size / 2 - extraPersist);
    s.strokeBBox.maxX = Math.max(s.strokeBBox.maxX, x + size / 2 + extraPersist);
    s.strokeBBox.maxY = Math.max(s.strokeBBox.maxY, y + size / 2 + extraPersist);
    switch (tool) {
      case "eraser": {
        this.stampDab(s.strokeCtx, opts.brush.size, opts.brush.hardness, opts.brush.opacity, "#000000", x, y);
        break;
      }
      case "pencil": {
        this.stampDab(s.strokeCtx, opts.pencil.size, 1, opts.pencil.opacity, opts.pencil.color, x, y);
        break;
      }
      case "dodge": {
        this.stampDab(s.strokeCtx, opts.dodge.size, 0.85, opts.dodge.strength, "#ffffff", x, y);
        break;
      }
      case "burn": {
        this.stampDab(s.strokeCtx, opts.burn.size, 0.85, opts.burn.strength, "#000000", x, y);
        break;
      }
      case "clone": {
        this.stampCloneDab(s, opts.clone.size, opts.clone.opacity, x, y);
        break;
      }
      case "heal": {
        this.stampHealDab(s, opts.heal.size, opts.heal.opacity, x, y);
        break;
      }
      case "smudge":
        // Smudge stamps only while moving (texture pull), never a static first dab.
        break;
      default: {
        this.stampDab(s.strokeCtx, opts.brush.size, opts.brush.hardness, opts.brush.opacity, opts.brush.color, x, y);
        break;
      }
    }
  }

  private paintStrokeMove(tool: string, docP: { x: number; y: number }): void {
    const s = this.activeToolState;
    if (!s || !s.strokeCtx || !s.lastDoc) return;
    const size = this.toolStampSize(tool);
    const spacing = Math.max(0.05, this.toolStrokeSpacing(tool));
    const step = Math.max(1, size * spacing);
    const dx = docP.x - s.lastDoc.x;
    const dy = docP.y - s.lastDoc.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 0) {
      const dabs = Math.max(1, Math.round(dist / step));
      if (tool === "smudge") {
        const strength = Math.max(0.02, Math.min(1, useEditorStore.getState().toolOptions.smudge.strength));
        for (let i = 1; i <= dabs; i++) {
          const t = i / dabs;
          const t0 = (i - 1) / dabs;
          this.smearDab(s, size, strength, s.lastDoc.x + dx * t0, s.lastDoc.y + dy * t0, s.lastDoc.x + dx * t, s.lastDoc.y + dy * t);
        }
      } else {
        for (let i = 1; i <= dabs; i++) {
          const t = i / dabs;
          this.stampToolDab(tool, s.lastDoc.x + dx * t, s.lastDoc.y + dy * t);
        }
      }
    }
    s.lastDoc = { x: docP.x, y: docP.y };
  }

  private stampCloneDab(s: NonNullable<EditorEngine["activeToolState"]>, size: number, opacity: number, x: number, y: number): void {
    const src = s.sampleSource;
    if (!src || !s.strokeCtx || !s.strokeStartDoc || !this._cloneSource) return;
    const offX = x - s.strokeStartDoc.x;
    const offY = y - s.strokeStartDoc.y;
    const sx = clamp(this._cloneSource.x + offX, 0, src.width);
    const sy = clamp(this._cloneSource.y + offY, 0, src.height);
    const { canvas: patch, dim } = this.samplePatchSprite(src, sx, sy, size, 0.85);
    s.strokeCtx.save();
    s.strokeCtx.globalAlpha = Math.max(0, Math.min(1, opacity));
    s.strokeCtx.drawImage(patch, Math.round(x - dim / 2), Math.round(y - dim / 2));
    s.strokeCtx.restore();
  }

  private stampHealDab(s: NonNullable<EditorEngine["activeToolState"]>, size: number, opacity: number, x: number, y: number): void {
    const src = s.sampleSource;
    if (!src || !s.strokeCtx || !s.strokeStartDoc || !this._cloneSource) return;
    const offX = x - s.strokeStartDoc.x;
    const offY = y - s.strokeStartDoc.y;
    const sx = clamp(this._cloneSource.x + offX, 0, src.width);
    const sy = clamp(this._cloneSource.y + offY, 0, src.height);
    const { canvas: patch, dim } = this.samplePatchSprite(src, sx, sy, size, 0.9);
    const pctx = getContext2d(patch);
    const img = pctx.getImageData(0, 0, patch.width, patch.height);
    this.boxBlurImageData(img, 2);
    pctx.putImageData(img, 0, 0);
    const targetLum = this.regionLuminance(src, x, y, size);
    const srcLum = this.regionLuminance(patch, patch.width / 2, patch.height / 2, size);
    if (targetLum > 0 && srcLum > 0) {
      const factor = Math.min(3, Math.max(1 / 3, targetLum / srcLum));
      const d = pctx.getImageData(0, 0, patch.width, patch.height);
      for (let i = 0; i < d.data.length; i += 4) {
        d.data[i] = d.data[i] * factor;
        d.data[i + 1] = d.data[i + 1] * factor;
        d.data[i + 2] = d.data[i + 2] * factor;
      }
      pctx.putImageData(d, 0, 0);
    }
    s.strokeCtx.save();
    s.strokeCtx.globalAlpha = Math.max(0, Math.min(1, opacity));
    s.strokeCtx.drawImage(patch, Math.round(x - dim / 2), Math.round(y - dim / 2));
    s.strokeCtx.restore();
  }

  private smearDab(s: NonNullable<EditorEngine["activeToolState"]>, size: number, strength: number, fx: number, fy: number, tx: number, ty: number): void {
    const src = s.smudgeSrc;
    if (!src || !s.strokeCtx) return;
    s.smudged = true;
    const half = size / 2;
    s.strokeBBox.minX = Math.min(s.strokeBBox.minX, tx - half);
    s.strokeBBox.minY = Math.min(s.strokeBBox.minY, ty - half);
    s.strokeBBox.maxX = Math.max(s.strokeBBox.maxX, tx + half);
    s.strokeBBox.maxY = Math.max(s.strokeBBox.maxY, ty + half);
    s.strokeCtx.save();
    s.strokeCtx.globalAlpha = strength;
    s.strokeCtx.drawImage(src, fx - half, fy - half, size, size, tx - half, ty - half, size, size);
    s.strokeCtx.restore();
    const sctx = src.getContext("2d");
    if (sctx) {
      sctx.save();
      sctx.globalCompositeOperation = "copy";
      sctx.drawImage(s.strokeCtx.canvas, tx - half, ty - half, size, size, tx - half, ty - half, size, size);
      sctx.restore();
    }
  }

  private samplePatchSprite(source: HTMLCanvasElement, cx: number, cy: number, size: number, hardness: number): { canvas: HTMLCanvasElement; dim: number } {
    const feather = Math.max(2, Math.round(size * Math.max(0, Math.min(1, 1 - hardness)) ));
    const dim = Math.max(Math.ceil(size) + 4, Math.ceil(size) + feather * 2);
    const c = createCanvas(dim, dim);
    const ctx = getContext2d(c);
    ctx.drawImage(source, cx - dim / 2, cy - dim / 2, dim, dim, 0, 0, dim, dim);
    const r = dim / 2;
    const inner = Math.max(1, r * Math.max(0.1, Math.min(1, hardness)));
    const g = ctx.createRadialGradient(r, r, 0, r, r, r);
    g.addColorStop(0, "rgba(0,0,0,1)");
    g.addColorStop(Math.min(0.999, inner / r), "rgba(0,0,0,1)");
    g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.globalCompositeOperation = "destination-in";
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, dim, dim);
    return { canvas: c, dim };
  }

  private boxBlurImageData(img: ImageData, radius: number): void {
    const r = Math.max(1, Math.round(radius));
    const { width: w, height: h, data } = img;
    const tmp = new Float32Array(data.length);
    const bounds = (x: number) => Math.max(0, Math.min(x, w - 1));
    const top = (y: number) => Math.max(0, Math.min(y, h - 1));
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let rsum = 0, gsum = 0, bsum = 0, asum = 0, n = 0;
        for (let ky = -r; ky <= r; ky++) {
          for (let kx = -r; kx <= r; kx++) {
            const px = bounds(x + kx);
            const py = top(y + ky);
            const o = (py * w + px) * 4;
            rsum += data[o]; gsum += data[o + 1]; bsum += data[o + 2]; asum += data[o + 3]; n++;
          }
        }
        const o = (y * w + x) * 4;
        tmp[o] = rsum / n; tmp[o + 1] = gsum / n; tmp[o + 2] = bsum / n; tmp[o + 3] = asum / n;
      }
    }
    for (let i = 0; i < data.length; i++) data[i] = tmp[i];
  }

  private regionLuminance(c: HTMLCanvasElement, cx: number, cy: number, size: number): number {
    const ctx = getContext2d(c);
    const x0 = Math.max(0, Math.floor(cx - size / 2));
    const y0 = Math.max(0, Math.floor(cy - size / 2));
    const width = Math.min(c.width - x0, size);
    const height = Math.min(c.height - y0, size);
    if (width <= 0 || height <= 0) return 0;
    const data = ctx.getImageData(x0, y0, width, height).data;
    let sum = 0; let n = 0;
    for (let i = 0; i < data.length; i += 4) {
      sum += 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
      n++;
    }
    return n ? sum / n : 0;
  }

  private duplicateCanvasFull(c: HTMLCanvasElement): HTMLCanvasElement {
    const copy = createCanvas(c.width, c.height);
    getContext2d(copy).drawImage(c, 0, 0);
    return copy;
  }

  // ── paint bucket (flood fill) ──

  private bucketFillAt(docP: { x: number; y: number }): void {
    const d = this.doc(); if (!d) return;
    const selId = useEditorStore.getState().selectedIds[0];
    const layer = selId ? d.getLayer(selId) : null;
    const imgLayer = layer && layer.type === "image" ? layer as ImageLayer : null;
    if (!imgLayer || imgLayer.locked) return;
    const canvas = pixelStore.get(imgLayer.imageId);
    if (!canvas) return;
    const w = canvas.width;
    const h = canvas.height;
    const ctx = getContext2d(canvas);
    const data = ctx.getImageData(0, 0, w, h);
    const tol = Math.max(0, Math.min(255, useEditorStore.getState().toolOptions.bucket.tolerance));
    const [fr, fg, fb] = hexToRgb(useEditorStore.getState().toolOptions.brush.color);
    const x = Math.floor(docP.x);
    const y = Math.floor(docP.y);
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx0 = y * w + x;
    const o0 = idx0 * 4;
    const tr = data.data[o0]; const tg = data.data[o0 + 1]; const tb = data.data[o0 + 2];
    const match = (i: number): boolean => {
      const o = i * 4;
      return Math.abs(data.data[o] - tr) <= tol && Math.abs(data.data[o + 1] - tg) <= tol && Math.abs(data.data[o + 2] - tb) <= tol;
    };
    const selMask = selectionEngine.getMask(w, h);
    const region = new Uint8ClampedArray(w * h);
    if (selMask) {
      for (let i = 0; i < region.length; i++) region[i] = selMask[i] > 0 ? 1 : 0;
    } else {
      region[idx0] = 1;
      const stack: number[] = [idx0];
      while (stack.length > 0) {
        const i = stack.pop() as number;
        const ix = i % w;
        const iy = (i - ix) / w;
        if (ix > 0 && region[i - 1] === 0 && match(i - 1)) { region[i - 1] = 1; stack.push(i - 1); }
        if (ix < w - 1 && region[i + 1] === 0 && match(i + 1)) { region[i + 1] = 1; stack.push(i + 1); }
        if (iy > 0 && region[i - w] === 0 && match(i - w)) { region[i - w] = 1; stack.push(i - w); }
        if (iy < h - 1 && region[i + w] === 0 && match(i + w)) { region[i + w] = 1; stack.push(i + w); }
      }
    }
    let minX = w, minY = h, maxX = -1, maxY = -1;
    let count = 0;
    for (let i = 0; i < region.length; i++) {
      if (region[i] === 0) continue;
      const px = i % w; const py = (i - px) / w;
      if (px < minX) minX = px;
      if (px > maxX) maxX = px;
      if (py < minY) minY = py;
      if (py > maxY) maxY = py;
      count++;
    }
    if (count === 0) return;
    const fillCanvas = createCanvas(d.width, d.height);
    const fctx = getContext2d(fillCanvas);
    const fimg = fctx.createImageData(w, h);
    for (let i = 0; i < region.length; i++) {
      if (region[i] === 0) continue;
      const o = i * 4;
      fimg.data[o] = fr; fimg.data[o + 1] = fg; fimg.data[o + 2] = fb; fimg.data[o + 3] = 255;
    }
    fctx.putImageData(fimg, 0, 0);
    const pad = 0;
    this.commitStroke(imgLayer.id, fillCanvas, { x: minX - pad, y: minY - pad, width: maxX - minX + 1 + pad * 2, height: maxY - minY + 1 + pad * 2 }, "paint", "Paint Bucket");
    useEditorStore.getState().setStatus(`Paint bucket: ${count} pixels`);
    this.markDirty();
    this.requestRender();
  }

  // ── pen tool (paths) ──

  getPenPreview(): number[][] | null {
    return this._penPoints ? this._penPoints.map((p) => [p[0], p[1]]) : null;
  }

  cancelPen(): void {
    this._penPoints = null;
    this.requestRender();
  }

  private commitPenPath(): void {
    const pts = this._penPoints;
    const d = this.doc();
    if (!pts || pts.length < 2 || !d) { this._penPoints = null; return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const p of pts) {
      if (p[0] < minX) minX = p[0];
      if (p[1] < minY) minY = p[1];
      if (p[0] > maxX) maxX = p[0];
      if (p[1] > maxY) maxY = p[1];
    }
    const w = Math.max(2, Math.round(maxX - minX) + 1);
    const h = Math.max(2, Math.round(maxY - minY) + 1);
    const local = pts.map((p) => [p[0] - minX, p[1] - minY]);
    const opts = useEditorStore.getState().toolOptions.pen;
    const sl = factoryCreateShapeLayer("path", "Path");
    sl.fill = opts.fill && opts.fill !== "transparent" ? opts.fill : null;
    sl.stroke = opts.stroke;
    sl.strokeWidth = opts.strokeWidth;
    sl.transform = { x: minX, y: minY, width: w, height: h, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 };
    sl.pathPoints = local;
    this.addLayer(sl, "New Path");
    useEditorStore.setState({ tool: "move", selectedIds: [sl.id] });
    this._penPoints = null;
  }

  // ── path edit ──

  private pathShape(id: string): ShapeLayer | null {
    const l = this.doc()?.getLayer(id);
    if (!l || l.type !== "shape" || l.shape !== "path") return null;
    return l as ShapeLayer;
  }

  /** Undoable structural edit of a path layer's anchors/attribute values. */
  editPathLayer(id: string, patch: Partial<ShapeLayer>, name = "Edit Path"): void {
    const l = this.pathShape(id);
    if (!l) return;
    const d = this.doc()!;
    const before = { ...l, pathData: clonePathData(l.pathData), pathPoints: l.pathPoints?.map((p) => [p[0], p[1]]) };
    const after = { ...l, ...patch, pathData: clonePathData(patch.pathData ?? l.pathData), transform: { ...l.transform, ...patch.transform } } as ShapeLayer;
    const apply = (val: ShapeLayer) => {
      useEditorStore.setState({ doc: new EditorDocument(d.width, d.height, d.layers.map((x) => (x.id === id ? val : x))) });
    };
    apply(after);
    this.pushHistory({ name, bytes: 1024, undo: () => apply(before), redo: () => apply(after) });
    this.version++;
    this.markDirty();
    this.requestRender();
  }

  private applyPathData(id: string, mutator: (pts: PathPoint[]) => PathPoint[], name: string): void {
    const l = this.pathShape(id);
    if (!l) return;
    const d = this.doc()!;
    const before = clonePathData(l.pathData);
    const after = mutator(clonePathData(l.pathData));
    const apply = (pts: PathPoint[]) => {
      useEditorStore.setState({ doc: new EditorDocument(d.width, d.height, d.layers.map((x) => (x.id === id ? { ...x, pathData: pts } as Layer : x))) });
    };
    apply(after);
    this.pushHistory({ name, bytes: 1024, undo: () => apply(before), redo: () => apply(after) });
    this.version++;
    this.markDirty();
    this.requestRender();
  }

  /** Move a path anchor by (dx, dy) in layer-local units. Undoable. */
  movePathAnchor(id: string, index: number, dx: number, dy: number): void {
    this.applyPathData(id, (pts) => {
      const p = pts[index];
      if (p) { p.x += dx; p.y += dy; }
      return pts;
    }, "Move Anchor");
  }

  /** Add a path anchor after `afterIndex` (or append when negative). Undoable. */
  addPathAnchor(id: string, afterIndex: number, x: number, y: number): void {
    this.applyPathData(id, (pts) => {
      const p: PathPoint = { x, y, inX: 0, inY: 0, outX: 0, outY: 0, smooth: false };
      const at = afterIndex < 0 ? pts.length : Math.min(afterIndex + 1, pts.length);
      pts.splice(at, 0, p);
      return pts;
    }, "Add Anchor");
  }

  /** Remove a path anchor. Undoable. */
  deletePathAnchor(id: string, index: number): void {
    this.applyPathData(id, (pts) => {
      if (index >= 0 && index < pts.length) pts.splice(index, 1);
      return pts;
    }, "Delete Anchor");
  }

  /** Set one control handle (in/out) of an anchor, as offsets relative to the anchor. Undoable. */
  setPathAnchorHandle(id: string, index: number, side: "in" | "out", hx: number, hy: number): void {
    this.applyPathData(id, (pts) => {
      const p = pts[index];
      if (p) {
        if (side === "in") { p.inX = hx; p.inY = hy; }
        else { p.outX = hx; p.outY = hy; }
      }
      return pts;
    }, "Edit Handle");
  }

  /** Toggle smooth on an anchor; when enabled a missing out-handle is mirrored from the in-handle. Undoable. */
  togglePathAnchorSmooth(id: string, index: number): void {
    this.applyPathData(id, (pts) => {
      const p = pts[index];
      if (p) {
        p.smooth = !p.smooth;
        if (p.smooth && p.inX === 0 && p.inY === 0 && (p.outX !== 0 || p.outY !== 0)) { p.inX = -p.outX; p.inY = -p.outY; }
        if (p.smooth && p.outX === 0 && p.outY === 0 && (p.inX !== 0 || p.inY !== 0)) { p.outX = -p.inX; p.outY = -p.inY; }
      }
      return pts;
    }, "Smooth Anchor");
  }

  /** Convert the path's closed interior into an active selection. */
  selectionFromPath(id: string): void {
    const l = this.pathShape(id);
    if (!l) return;
    const d = this.doc()!;
    const pts = l.pathData;
    if (!pts || pts.length < 2) return;
    selectionEngine.resize(d.width, d.height);
    const closed = pts.length >= 3;
    const t = traceShapePath(pts, closed);
    const ox = Math.round(l.transform.x);
    const oy = Math.round(l.transform.y);
    if (t.outline.length < 3) return;
    selectionEngine.applyPolygon(t.outline, ox, oy, "replace");
    useEditorStore.getState().setStatus(`Selection from path "${l.name}"`);
    this.requestRender();
  }

  // ── text edit ──

  commitTextEdit(id: string, changes: Partial<TextLayer>): void {
    const d = this.doc(); const l = d?.getLayer(id);
    if (!l || l.type !== "text") return;
    const before = { ...(l as TextLayer), transform: { ...(l as TextLayer).transform } };
    const after = { ...(l as TextLayer), ...changes, transform: { ...(l.transform), ...changes.transform } };
    const apply = (val: typeof before) => {
      const d2 = this.doc(); if (!d2) return;
      useEditorStore.setState({ doc: new EditorDocument(d2.width, d2.height, d2.layers.map((x) => (x.id === id ? { ...val, transform: { ...val.transform } } as Layer : x))) });
    };
    apply(after);
    this.pushHistory({ name: "Edit Text", bytes: 512, undo: () => apply(before), redo: () => apply(after) });
    this.requestRender();
  }

  updateTextLayerLive(id: string, patch: Partial<TextLayer>): void {
    const d = this.doc(); if (!d) return;
    const l = d.getLayer(id);
    if (!l || l.type !== "text") return;
    const merged = { ...(l as TextLayer), ...patch };
    useEditorStore.setState({ doc: new EditorDocument(d.width, d.height, d.layers.map((x) => (x.id === id ? { ...merged, transform: { ...merged.transform } } as Layer : x))) });
    this.version++; runtime.canvas?.requestRender();
    this.markDirty();
  }

  /** Undoable committed text edit (one history entry per call, e.g. on blur / discrete control change). */
  updateTextLayer(id: string, patch: Partial<TextLayer>, name = "Edit Text"): void {
    const d = this.doc(); if (!d) return;
    const before = d.getLayer(id);
    if (!before || before.type !== "text") return;
    const merged = { ...before, ...patch };
    const apply = (val: TextLayer) => {
      const dd = this.doc();
      if (!dd) return;
      useEditorStore.setState({ doc: new EditorDocument(dd.width, dd.height, dd.layers.map((x) => (x.id === id ? { ...val, transform: { ...val.transform } } as Layer : x))) });
    };
    apply(merged);
    this.pushHistory({ name, bytes: 512, undo: () => apply(before), redo: () => apply(merged) });
    this.version++;
    this.markDirty();
    this.requestRender();
  }

  private _textEditBefore: { id: string; layer: TextLayer } | null = null;

  /** Begin a grouped text-edit session for live preview (called on input focus). */
  beginTextEditSession(id: string): void {
    const l = this.doc()?.getLayer(id);
    if (l && l.type === "text") this._textEditBefore = { id, layer: { ...(l as TextLayer) } };
    else this._textEditBefore = null;
  }

  /** Commit the grouped session as a single undoable "Edit Text" entry. */
  commitTextEditSession(id: string): void {
    const pre = this._textEditBefore;
    this._textEditBefore = null;
    if (!pre || pre.id !== id) return;
    const d = this.doc();
    const after = d?.getLayer(id);
    if (!d || !after || after.type !== "text") return;
    const before = pre.layer;
    const apply = (val: TextLayer) => {
      useEditorStore.setState({ doc: new EditorDocument(d.width, d.height, d.layers.map((x) => (x.id === id ? { ...val, transform: { ...val.transform } } as Layer : x))) });
    };
    this.pushHistory({ name: "Edit Text", bytes: 512, undo: () => apply(before), redo: () => apply(after as TextLayer) });
    this.version = this.version;
    this.markDirty();
    this.requestRender();
  }

  // ── effect ──

  topEditableImageLayer(): ImageLayer | null {
    const d = this.doc(); if (!d) return null;
    const sel = useEditorStore.getState().selectedIds;
    for (let i = d.layers.length - 1; i >= 0; i--) {
      const l = d.layers[i];
      if (sel.includes(l.id) && l.type === "image" && !l.locked) return l as ImageLayer;
    }
    for (let i = d.layers.length - 1; i >= 0; i--) {
      if (d.layers[i]!.type === "image" && !(d.layers[i] as ImageLayer).locked && !d.layers[i]!.parentId) return d.layers[i] as ImageLayer;
    }
    return null;
  }

  effectSourceCanvas(): HTMLCanvasElement | null {
    if (this.useLayerFx) {
      const l = this.topEditableImageLayer();
      if (l) return pixelStore.get(l.imageId) ?? null;
    }
    return this.getComposite();
  }

  async effectPreview(op: ProcessOp, params: ProcessParams): Promise<HTMLCanvasElement> {
    const src = this.effectSourceCanvas() ?? createCanvas(1, 1);
    const preview = await processingEngine.makePreviewCanvas(src, 512);
    const mask = this.buildEffectMask(preview);
    const result = await processingEngine.processCanvas(op, preview, params, mask, preview.width, preview.height);
    const out = createCanvas(preview.width, preview.height);
    getContext2d(out).putImageData(result, 0, 0);
    return out;
  }

  /**
   * Builds a per-pixel effect mask for the effect source canvas. The mask
   * combines the active layer mask and the current selection, mapped through
   * the layer transform (translation / rotation / uniform scale supported).
   * Returns null when nothing restricts the effect. Mask values are 0..255
   * (grayscale, so feathered selections blend linearly).
   */
  buildEffectMask(source: HTMLCanvasElement): Uint8ClampedArray | null {
    const w = source.width;
    const h = source.height;
    if (w <= 0 || h <= 0) return null;
    const mask = new Uint8ClampedArray(w * h).fill(255);
    let active = false;

    if (this.useLayerFx) {
      const l = this.topEditableImageLayer();
      if (l && l.mask && l.mask.enabled) {
        const lm = maskStore.get(l.mask.id);
        if (lm) {
          active = true;
          const lw = lm.width;
          const lh = lm.height;
          const scalex = lw / (l.transform.width || lw);
          const scaley = lh / (l.transform.height || lh);
          const ldata = getContext2d(lm).getImageData(0, 0, lw, lh).data;
          for (let y = 0; y < h; y++) {
            for (let x = 0; x < w; x++) {
              const lx = clamp(Math.round(x * (l.transform.width / w) * scalex), 0, lw - 1);
              const ly = clamp(Math.round(y * (l.transform.height / h) * scaley), 0, lh - 1);
              const v = ldata[(ly * lw + lx) * 4 + 3];
              mask[y * w + x] = (mask[y * w + x] * v) >> 8;
            }
          }
        }
      }
    }

    if (selectionEngine.hasSelection) {
      const sMask = selectionEngine.getMask();
      const [sw, sh] = selectionEngine.dims;
      if (sMask && sw > 0 && sh > 0) {
        active = true;
        const t = this.useLayerFx ? this.topEditableImageLayer()?.transform : null;
        const all = !t && sw === w && sh === h;
        for (let y = 0; y < h; y++) {
          for (let x = 0; x < w; x++) {
            let dx = x;
            let dy = y;
            if (t) {
              // Map target (layer content space) → doc space via inverse transform.
              const cx = x * (t.width / w);
              const cy = y * (t.height / h);
              const rad = (t.rotation * Math.PI) / 180;
              const cosR = Math.cos(rad);
              const sinR = Math.sin(rad);
              const rx = cosR * (cx * t.scaleX) - sinR * (cy * t.scaleY);
              const ry = sinR * (cx * t.scaleX) + cosR * (cy * t.scaleY);
              dx = t.x + rx;
              dy = t.y + ry;
            }
            const sx = all ? x : clamp(Math.round(dx), 0, sw - 1);
            const sy = all ? y : clamp(Math.round(dy), 0, sh - 1);
            const sel = sMask[sy * sw + sx];
            const sel01 = clamp(sel, 0, 1);
            const i = y * w + x;
            mask[i] = Math.round(mask[i] * sel01);
          }
        }
      }
    }

    return active ? mask : null;
  }

  async adjustmentsPreview(values: Adjustments): Promise<HTMLCanvasElement> {
    return this.effectPreview("adjustments", { values });
  }

  /**
   * Filter previews are versioned: starting a new preview increments the
   * version, and any older in-flight result is dropped (throws `preview:stale`)
   * so a stale worker result can never replace a newer preview.
   */
  private _previewVersion = 0;

  cancelFilterPreviews(): void {
    this._previewVersion++;
  }

  async filterPreview(op: ProcessOp, params: ProcessParams): Promise<HTMLCanvasElement> {
    const ver = ++this._previewVersion;
    const out = await this.effectPreview(op, params);
    if (ver !== this._previewVersion) throw new Error("preview:stale");
    return out;
  }

  async filterApply(op: ProcessOp, params: ProcessParams, historyName: string = op): Promise<void> {
    await this.effectApply(op, params, historyName);
  }

  async effectApply(op: ProcessOp, params: ProcessParams, historyName: string = op): Promise<void> {
    const canvas = this.effectSourceCanvas();
    if (!canvas) return;
    useEditorStore.setState({ busy: true });
    try {
      const before = snapshotCanvas(canvas, { x: 0, y: 0, width: canvas.width, height: canvas.height });
      const mask = this.buildEffectMask(canvas);
      const result = await processingEngine.processCanvas(op, canvas, params, mask, canvas.width, canvas.height);
      getContext2d(canvas).putImageData(result, 0, 0);
      const after = snapshotCanvas(canvas, { x: 0, y: 0, width: canvas.width, height: canvas.height });
      this.pushHistory({ name: historyName, bytes: (before.kind === "data" ? before.imageData.data.byteLength : before.url.length) + (after.kind === "data" ? after.imageData.data.byteLength : after.url.length), undo: () => { restoreSnapshot(canvas, { x: 0, y: 0, width: canvas.width, height: canvas.height }, before); this.requestRender(); }, redo: () => { restoreSnapshot(canvas, { x: 0, y: 0, width: canvas.width, height: canvas.height }, after); this.requestRender(); } });
      this._uiFxApplied?.();
      this.requestRender();
    } catch (err) {
      // On failure the original image is untouched: putImageData / pushHistory
      // never ran. Surface a useful message and NO history entry is created.
      useEditorStore.setState({ status: `Processing failed: ${(err as Error).message}. Original image preserved.` });
      throw err;
    } finally {
      useEditorStore.setState({ busy: false });
    }
  }

  async adjustmentsApply(values: Adjustments): Promise<void> {
    await this.effectApply("adjustments", { values }, "Adjust Image");
  }

  async applyEffectToSelectionOrDoc(op: ProcessOp, params: ProcessParams): Promise<void> {
    await this.effectApply(op, params);
  }

  // ── Morphological processing ──

  /**
   * Gray RGBA canvas from a single-channel value array (0..255). Used to feed
   * layer masks and selections through the shared morphology pipeline.
   */
  private grayFromValues(values: Uint8ClampedArray, w: number, h: number): HTMLCanvasElement {
    const c = createCanvas(Math.max(1, w), Math.max(1, h));
    const ctx = getContext2d(c);
    const img = ctx.createImageData(w, h);
    for (let i = 0; i < w * h; i++) {
      const pi = i * 4;
      const v = values[i] ?? 0;
      img.data[pi] = v;
      img.data[pi + 1] = v;
      img.data[pi + 2] = v;
      img.data[pi + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  /** Convert a layer mask canvas (values live in the alpha plane) to gray RGBA. */
  private maskCanvasToGray(maskCanvas: HTMLCanvasElement): HTMLCanvasElement {
    const w = maskCanvas.width;
    const h = maskCanvas.height;
    const data = getContext2d(maskCanvas).getImageData(0, 0, w, h).data;
    const vals = new Uint8ClampedArray(w * h);
    for (let i = 0; i < w * h; i++) vals[i] = data[i * 4 + 3];
    return this.grayFromValues(vals, w, h);
  }

  /** The canvas a morphological operation reads, for the requested target. */
  private morphoSourceCanvas(target: MorphoTarget): HTMLCanvasElement | null {
    switch (target) {
      case "layer":
        return this.effectSourceCanvas();
      case "mask": {
        const l = this.topEditableImageLayer();
        const mc = l?.mask ? maskStore.get(l.mask.id) : undefined;
        return mc ? this.maskCanvasToGray(mc) : null;
      }
      case "selection": {
        const sm = selectionEngine.getMask();
        const [sw, sh] = selectionEngine.dims;
        if (!sm || sw <= 0 || sh <= 0) return null;
        return this.grayFromValues(sm, sw, sh);
      }
    }
  }

  /**
   * Morphological preview (versioned like filterPreview, stale results dropped).
   * The preview is always rendered at preview resolution regardless of target.
   */
  async morphoPreview(op: ProcessOp, params: ProcessParams, target: MorphoTarget): Promise<HTMLCanvasElement> {
    const ver = ++this._previewVersion;
    const src = this.morphoSourceCanvas(target);
    if (!src) throw new Error("No apply target available for morphological processing.");
    const preview = await processingEngine.makePreviewCanvas(src, 512);
    const result = await processingEngine.processCanvas(op, preview, { ...params, inputMode: target === "layer" ? (params.inputMode ?? 0) : 0 });
    const out = createCanvas(preview.width, preview.height);
    getContext2d(out).putImageData(result, 0, 0);
    if (ver !== this._previewVersion) throw new Error("preview:stale");
    return out;
  }

  /**
   * Morphological processing apply. Commits a SINGLE history entry and works at
   * full document resolution.
   *   - "layer": the active editable image layer (or composite when layer-fx is
   *     disabled), identical path to filterApply — full undo/redo + Before/After.
   *   - "mask": the top editable image layer's mask canvas, alpha plane replaced
   *     in place. Mask id / association / transform are preserved.
   *   - "selection": the selection mask array, replaced with the (0..255)
   *     morphological result. Undoable.
   */
  async morphoApply(op: ProcessOp, params: ProcessParams, target: MorphoTarget, historyName = "Morphological Processing"): Promise<void> {
    if (target === "layer") {
      await this.effectApply(op, params, historyName);
      return;
    }
    useEditorStore.setState({ busy: true });
    try {
      if (target === "mask") {
        const l = this.topEditableImageLayer();
        if (!l || !l.mask) throw new Error("No active layer mask.");
        const maskCanvas = maskStore.get(l.mask.id);
        if (!maskCanvas) throw new Error("Layer mask canvas is missing.");
        const w = maskCanvas.width;
        const h = maskCanvas.height;
        const beforeGray = this.maskCanvasToGray(maskCanvas);
        const result = await processingEngine.processCanvas(op, beforeGray, { ...params, inputMode: 0 });
        const after = createCanvas(w, h);
        const actx = getContext2d(after);
        actx.drawImage(maskCanvas, 0, 0); // preserve RGB of the existing mask
        const out = actx.getImageData(0, 0, w, h);
        for (let i = 0; i < w * h; i++) out.data[i * 4 + 3] = result.data[i * 4];
        actx.putImageData(out, 0, 0);
        const beforeCanvas = maskCanvas;
        maskStore.set(l.mask.id, after);
        this.pushHistory({
          name: historyName,
          bytes: w * h,
          undo: () => { const m = this.doc()?.getLayer(l.id) as ImageLayer | undefined; if (m?.mask) maskStore.set(m.mask.id, beforeCanvas); this.requestRender(); },
          redo: () => { const m = this.doc()?.getLayer(l.id) as ImageLayer | undefined; if (m?.mask) maskStore.set(m.mask.id, after); this.requestRender(); },
        });
        this.requestRender();
        return;
      }

      const selectionMask = selectionEngine.getMask();
      const [sw, sh] = selectionEngine.dims;
      if (!selectionMask || sw <= 0 || sh <= 0) throw new Error("No active selection.");
      const gray = this.grayFromValues(selectionMask, sw, sh);
      const result = await processingEngine.processCanvas(op, gray, { ...params, inputMode: 0 });
      const next = new Uint8ClampedArray(sw * sh);
      for (let i = 0; i < next.length; i++) next[i] = result.data[i * 4];
      const before = selectionMask;
      selectionEngine.setMask(next);
      this.pushHistory({
        name: historyName,
        bytes: sw * sh,
        undo: () => { selectionEngine.setMask(before); this.requestRender(); },
        redo: () => { selectionEngine.setMask(new Uint8ClampedArray(next)); this.requestRender(); },
      });
      this.requestRender();
    } catch (err) {
      useEditorStore.setState({ status: `Morphological processing failed: ${(err as Error).message}` });
      throw err;
    } finally {
      useEditorStore.setState({ busy: false });
    }
  }

  /**
   * Connected-component statistics for the current morpho target. Reads the
   * document/mask/selection at full resolution (foreground = value >= 128).
   * Returns null when no target exists. Used to surface honest component
   * metadata (count, bounding box, area) after applying Connected Components.
   */
  async morphoComponentStats(target: MorphoTarget): Promise<MorphoComponentStats | null> {
    if (target === "mask") {
      const l = this.topEditableImageLayer();
      const mc = l?.mask ? maskStore.get(l.mask.id) : undefined;
      if (!mc) return null;
      const w = mc.width;
      const h = mc.height;
      const data = getContext2d(mc).getImageData(0, 0, w, h).data;
      const vals = new Uint8ClampedArray(w * h);
      for (let i = 0; i < w * h; i++) vals[i] = data[i * 4 + 3] >= 128 ? 255 : 0;
      return analyzeConnectedComponents(vals, w, h);
    }
    if (target === "selection") {
      const sm = selectionEngine.getMask();
      const [sw, sh] = selectionEngine.dims;
      if (!sm || sw <= 0 || sh <= 0) return null;
      return analyzeConnectedComponents(sm, sw, sh);
    }
    const canvas = this.effectSourceCanvas();
    if (!canvas) return null;
    const w = canvas.width;
    const h = canvas.height;
    const data = getContext2d(canvas).getImageData(0, 0, w, h).data;
    const bin = binaryFromLuminanceThreshold(data, w, h, 128);
    return analyzeConnectedComponents(bin, w, h);
  }

  // ── Tool handling ──

  private activeToolState: {
    tool: string;
    pointerDown: boolean;
    startVP: { x: number; y: number };
    startDoc: { x: number; y: number };
    lastDoc: { x: number; y: number };
    transformId?: string;
    transformBefore?: LayerTransform;
    strokeCanvas?: HTMLCanvasElement;
    strokeCtx?: CanvasRenderingContext2D;
    strokeBBox: { minX: number; minY: number; maxX: number; maxY: number };
    selectionStartDoc?: { x: number; y: number };
    cropStartDoc?: { x: number; y: number };
    cropRect?: { x: number; y: number; width: number; height: number };
    lassoPoints?: number[][];
    gradientStartDoc?: { x: number; y: number };
    shapeStartDoc?: { x: number; y: number };
    shapeKind?: ShapeKind;
    shapeDraft?: { x: number; y: number; width: number; height: number };
    strokeStartDoc?: { x: number; y: number };
    sampleSource?: HTMLCanvasElement | null;
    smudgeSrc?: HTMLCanvasElement | null;
    smudged?: boolean;
    maskEditLayerId?: string;
  } | null = null;

  private _cloneSource: { x: number; y: number } | null = null;

  private _snapLines: SnapLine[] = [];

  /** Active alignment guide overlays produced by the last snap resolution. */
  get snapLines(): readonly SnapLine[] {
    return this._snapLines;
  }

  private snapSettings(): SnapSettings {
    const st = useEditorStore.getState();
    const zoom = Math.max(0.05, st.zoomDisplay || 1);
    return {
      enabled: st.snapToGrid || st.snapToGuides || st.snapToLayers || st.snapToCenter || st.snapToEdges || st.snapToArtboards,
      grid: st.snapToGrid,
      guides: st.snapToGuides,
      layers: st.snapToLayers,
      center: st.snapToCenter,
      edges: st.snapToEdges,
      artboards: st.snapToArtboards,
      gridSpacing: gridStep(st.gridSettings),
      tolerance: 6 / zoom,
    };
  }

  private snapContext(excludeLayerId?: string): SnapContext {
    const d = this.doc();
    const st = useEditorStore.getState();
    const layerBounds: SnapRect[] = [];
    if (d) {
      for (const l of d.layers) {
        if (l.id === excludeLayerId || !l.visible) continue;
        if (l.type === "group" || l.type === "adjustment") continue;
        layerBounds.push({ x: l.transform.x, y: l.transform.y, width: l.transform.width, height: l.transform.height });
      }
    }
    return {
      guides: st.guides,
      artboards: st.artboards,
      layerBounds,
      docWidth: d?.width ?? 0,
      docHeight: d?.height ?? 0,
    };
  }

  private _penPoints: number[][] | null = null;

  private _cropRect: { x: number; y: number; width: number; height: number } | null = null;

  handlePointerDown(tool: string, vp: { x: number; y: number }, docP: { x: number; y: number }, e: PointerEvent): void {
    const d = this.doc();
    if (!d) return;
    this.activeToolState = {
      tool,
      pointerDown: true,
      startVP: vp,
      startDoc: docP,
      lastDoc: docP,
      strokeBBox: { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity },
    };
    const s = this.activeToolState;

    switch (tool) {
      case "move": {
        const sel = useEditorStore.getState().selectedIds;
        if (sel.length === 0) {
          useEditorStore.getState().selectTopAtPoint(docP.x, docP.y);
          const newSel = useEditorStore.getState().selectedIds;
          if (newSel.length === 0) break;
        }
        const layerId = useEditorStore.getState().selectedIds[0];
        const layer = layerId ? d.getLayer(layerId) : null;
        if (layer) {
          s.transformId = layer.id;
          s.transformBefore = { ...layer.transform };
        }
        break;
      }
      case "selection": {
        selectionEngine.resize(d.width, d.height);
        s.selectionStartDoc = { ...docP };
        const selOpts = useEditorStore.getState().toolOptions.selection;
        if (selOpts.useWand) {
          const canvas = this.getComposite();
          if (canvas) {
            const ctx = getContext2d(canvas);
            const w = canvas.width;
            const h = canvas.height;
            selectionEngine.resize(w, h);
            const img = ctx.getImageData(0, 0, w, h);
            selectionEngine.selectMagicWand(img, selOpts.tolerance, docP.x, docP.y, selOpts.mode);
          }
          this.requestRender();
        } else if (selOpts.shape === "lasso") {
          s.lassoPoints = [[docP.x, docP.y]];
        }
        break;
      }
      case "eyedropper": {
        const px = this.samplePixelInDoc(docP.x, docP.y);
        if (px) {
          const hex = "#" + [px.r, px.g, px.b].map((v) => v.toString(16).padStart(2, "0")).join("").toLowerCase();
          useEditorStore.getState().setToolOption("brush", { color: hex });
          useEditorStore.getState().setStatus(`Color sampled ${hex.toUpperCase()} (RGB ${px.r}, ${px.g}, ${px.b})`);
        }
        break;
      }
      case "gradient": {
        s.gradientStartDoc = { ...docP };
        break;
      }
      case "crop": {
        s.cropStartDoc = { ...docP };
        this._cropRect = { x: docP.x, y: docP.y, width: 0, height: 0 };
        s.cropRect = this._cropRect;
        break;
      }
      case "brush":
      case "eraser":
      case "pencil":
      case "clone":
      case "heal":
      case "dodge":
      case "burn":
      case "smudge": {
        if (tool === "clone" && e.altKey) {
          this._cloneSource = { x: docP.x, y: docP.y };
          useEditorStore.getState().setStatus("Clone source set");
          break;
        }
        const opts = useEditorStore.getState().toolOptions;
        const maskEditId = useEditorStore.getState().editingMaskId;
        if (tool === "brush" || tool === "eraser") {
          if (maskEditId && d.getLayer(maskEditId)?.mask) {
            s.maskEditLayerId = maskEditId;
            s.lastDoc = { ...docP };
            this.beginMaskPaint(maskEditId);
            const selId = maskEditId;
            const layer = d.getLayer(selId);
            if (layer) {
              const lx = docP.x - layer.transform.x;
              const ly = docP.y - layer.transform.y;
              const bs = Math.max(1, opts.brush.size);
              const erase = tool === "eraser";
              this.paintMaskDab(selId, lx, ly, bs, erase, Math.max(0, Math.min(1, opts.brush.hardness)), Math.max(0.05, Math.min(1, opts.brush.opacity)));
            }
            break;
          }
          const selId = useEditorStore.getState().selectedIds[0];
          const layer = selId ? d.getLayer(selId) : null;
          const imgLayer = layer && layer.type === "image" ? layer as ImageLayer : null;
          if (imgLayer && !imgLayer.locked) {
            s.transformId = imgLayer.id;
            s.strokeCanvas = document.createElement("canvas");
            s.strokeCanvas.width = d.width;
            s.strokeCanvas.height = d.height;
            s.strokeCtx = s.strokeCanvas.getContext("2d")!;
            const baseSize = Math.max(1, opts.brush.size);
            const hardness = Math.max(0, Math.min(1, opts.brush.hardness));
            const color = tool === "eraser" ? "#000000" : opts.brush.color;
            const dab = this.strokeDabParams(e, opts.brush.flow, baseSize);
            const lp = this.strokePointFromDoc({ x: docP.x, y: docP.y });
            const lx = lp?.x ?? docP.x;
            const ly = lp?.y ?? docP.y;
            const varied = this.brushDabVariation(opts.brush, dab.size, dab.alpha, lx, ly);
            const size = varied.size;
            s.strokeBBox = { minX: varied.x - size / 2, minY: varied.y - size / 2, maxX: varied.x + size / 2, maxY: varied.y + size / 2 };
            this.stampDab(s.strokeCtx, size, hardness, varied.alpha, color, varied.x, varied.y);
          }
          break;
        }
        if (!this.beginStrokeState(d)) break;
        s.strokeStartDoc = { x: docP.x, y: docP.y };
        if (tool === "clone" || tool === "heal") {
          s.sampleSource = this.duplicateCanvasFull(this.getComposite() ?? document.createElement("canvas"));
        }
        if (tool === "smudge") {
          const selId = useEditorStore.getState().selectedIds[0];
          const layer = selId ? d.getLayer(selId) : null;
          const imgLayer = layer && layer.type === "image" ? layer as ImageLayer : null;
          const canvas = imgLayer ? pixelStore.get(imgLayer.imageId) : null;
          if (!canvas) { this.activeToolState = null; break; }
          s.smudgeSrc = this.duplicateCanvasFull(canvas);
          s.strokeBBox = { minX: docP.x - opts.smudge.size / 2, minY: docP.y - opts.smudge.size / 2, maxX: docP.x + opts.smudge.size / 2, maxY: docP.y + opts.smudge.size / 2 };
          break;
        }
        this.stampToolDab(tool, docP.x, docP.y);
        break;
      }
      case "bucket": {
        this.bucketFillAt(docP);
        break;
      }
      case "pen": {
        const penOpts = useEditorStore.getState().toolOptions.pen;
        const size = Math.max(1, penOpts.strokeWidth);
        if (!this._penPoints) {
          this._penPoints = [[docP.x, docP.y]];
        } else {
          const last = this._penPoints[this._penPoints.length - 1];
          const dist = Math.hypot(docP.x - last[0], docP.y - last[1]);
          if (dist <= Math.max(2, size * 3)) {
            if (this._penPoints.length >= 2) {
              this.commitPenPath();
            }
            break;
          }
          this._penPoints.push([docP.x, docP.y]);
        }
        this.requestRender();
        break;
      }
      case "text": {
        const opts = useEditorStore.getState().toolOptions.text;
        const tl = factoryCreateTextLayer({
          text: "Text",
          fontFamily: opts.fontFamily,
          fontSize: opts.fontSize,
          fontWeight: opts.fontWeight,
          fontStyle: opts.fontStyle,
          color: opts.color,
          align: opts.align,
          direction: opts.direction,
          letterSpacing: opts.letterSpacing,
          x: docP.x,
          y: docP.y,
        });
        this.addLayer(tl, "New Text");
        useEditorStore.setState({ tool: "move", selectedIds: [tl.id] });
        break;
      }
      case "shape": {
        s.shapeStartDoc = { ...docP };
        s.shapeKind = useEditorStore.getState().toolOptions.shape.kind;
        break;
      }
    }
  }

  handlePointerMove(tool: string, vp: { x: number; y: number }, docP: { x: number; y: number }, e: PointerEvent): void {
    const d = this.doc();
    const s = this.activeToolState;
    if (!d || !s || !s.pointerDown) return;

    switch (tool) {
      case "move": {
        if (!s.transformId) break;
        const layer = d.getLayer(s.transformId);
        if (!layer || !s.transformBefore) break;
        const dx = docP.x - s.startDoc.x;
        const dy = docP.y - s.startDoc.y;
        const settings = this.snapSettings();
        if (settings.enabled) {
          const res = snapMove(
            { x: s.transformBefore.x, y: s.transformBefore.y, width: layer.transform.width, height: layer.transform.height },
            dx,
            dy,
            settings,
            this.snapContext(s.transformId)
          );
          this._snapLines = res.lines;
          this.updateLayerTransformLive(s.transformId, { x: res.x, y: res.y });
        } else {
          this._snapLines = [];
          this.updateLayerTransformLive(s.transformId, {
            x: s.transformBefore.x + dx,
            y: s.transformBefore.y + dy,
          });
        }
        break;
      }
      case "shape": {
        if (!s.shapeStartDoc) break;
        const x = Math.min(s.shapeStartDoc.x, docP.x);
        const y = Math.min(s.shapeStartDoc.y, docP.y);
        const w = Math.abs(docP.x - s.shapeStartDoc.x);
        const h = Math.abs(docP.y - s.shapeStartDoc.y);
        s.shapeDraft = { x, y, width: w, height: h };
        this.requestRender();
        break;
      }
      case "selection": {
        if (!s.selectionStartDoc) break;
        const selOpts = useEditorStore.getState().toolOptions.selection;
        if (selOpts.shape === "lasso") {
          if (!s.lassoPoints) s.lassoPoints = [[s.selectionStartDoc.x, s.selectionStartDoc.y]];
          const last = s.lassoPoints[s.lassoPoints.length - 1];
          const dist = Math.hypot(docP.x - last[0], docP.y - last[1]);
          if (dist >= 3) {
            s.lassoPoints.push([docP.x, docP.y]);
            selectionEngine.setShape({ kind: "lasso", x: 0, y: 0, width: 1, height: 1, lassoPath: s.lassoPoints });
          }
          this.requestRender();
          break;
        }
        const x = Math.min(s.selectionStartDoc.x, docP.x);
        const y = Math.min(s.selectionStartDoc.y, docP.y);
        const w = Math.abs(docP.x - s.selectionStartDoc.x);
        const h = Math.abs(docP.y - s.selectionStartDoc.y);
        const mode = selOpts.mode;
        selectionEngine.setRect(selOpts.shape, x, y, w, h, mode);
        this.requestRender();
        break;
      }
      case "gradient": {
        if (s.gradientStartDoc) this.requestRender();
        break;
      }
      case "crop": {
        if (!s.cropStartDoc) break;
        const aspect = useEditorStore.getState().toolOptions.crop.aspect;
        let w = Math.abs(docP.x - s.cropStartDoc.x);
        let h = Math.abs(docP.y - s.cropStartDoc.y);
        if (aspect !== "free") {
          const ratio = /^(\d+):(\d+)$/.exec(aspect);
          if (aspect === "1:1") { const m = Math.max(w, h); w = m; h = m; }
          else if (ratio) { const aw = +ratio[1]; const ah = +ratio[2]; const m = Math.max(w / aw, h / ah); w = m * aw; h = m * ah; }
        }
        let rx: number;
        let ry: number;
        if (e.altKey) {
          w *= 2;
          h *= 2;
          if (aspect !== "free") {
            const ratio = /^(\d+):(\d+)$/.exec(aspect);
            if (aspect === "1:1") { const m = Math.max(w, h); w = m; h = m; }
            else if (ratio) { const aw = +ratio[1]; const ah = +ratio[2]; const m = Math.max(w / aw, h / ah); w = m * aw; h = m * ah; }
          }
          rx = s.cropStartDoc.x - w / 2;
          ry = s.cropStartDoc.y - h / 2;
        } else {
          const dx = docP.x >= s.cropStartDoc.x ? 1 : -1;
          const dy = docP.y >= s.cropStartDoc.y ? 1 : -1;
          rx = dx > 0 ? s.cropStartDoc.x : s.cropStartDoc.x - w;
          ry = dy > 0 ? s.cropStartDoc.y : s.cropStartDoc.y - h;
        }
        this._cropRect = this.clampCropRect(rx, ry, w, h);
        s.cropRect = this._cropRect;
        this.requestRender();
        break;
      }
      case "brush":
      case "eraser":
      case "pencil":
      case "clone":
      case "heal":
      case "dodge":
      case "burn":
      case "smudge": {
        if (tool === "brush" || tool === "eraser") {
          const maskEditLayerId = useEditorStore.getState().editingMaskId;
          if (maskEditLayerId && s.maskEditLayerId === maskEditLayerId) {
            const layer = d.getLayer(maskEditLayerId);
            if (layer && s.lastDoc) {
              const opts = useEditorStore.getState().toolOptions.brush;
              const baseSize = Math.max(1, opts.size);
              const spacing = Math.max(0.05, opts.spacing);
              const step = Math.max(1, baseSize * spacing);
              const dx = docP.x - s.lastDoc.x;
              const dy = docP.y - s.lastDoc.y;
              const dist = Math.hypot(dx, dy);
              const dabs = dist > 0 ? Math.max(1, Math.round(dist / step)) : 1;
              for (let i = 1; i <= dabs; i++) {
                const t = i / dabs;
                const lx = s.lastDoc.x + dx * t - layer.transform.x;
                const ly = s.lastDoc.y + dy * t - layer.transform.y;
                this.paintMaskDab(maskEditLayerId, lx, ly, baseSize, tool === "eraser", Math.max(0, Math.min(1, opts.hardness)), Math.max(0.05, Math.min(1, opts.opacity)));
              }
            }
            this.requestRender();
            break;
          }
          if (!s.strokeCtx || !s.lastDoc) break;
          const opts = useEditorStore.getState().toolOptions.brush;
          const baseSize = Math.max(1, opts.size);
          const hardness = Math.max(0, Math.min(1, opts.hardness));
          const color = tool === "eraser" ? "#000000" : opts.color;
          const dab = this.strokeDabParams(e, opts.flow, baseSize);
          const size = dab.size;
          const spacing = Math.max(0.05, opts.spacing);
          const step = Math.max(1, baseSize * spacing);
          const dx = docP.x - s.lastDoc.x;
          const dy = docP.y - s.lastDoc.y;
          const dist = Math.hypot(dx, dy);
          if (dist > 0) {
            const dabs = Math.max(1, Math.round(dist / step));
            for (let i = 1; i <= dabs; i++) {
              const t = i / dabs;
              const px = s.lastDoc.x + dx * t;
              const py = s.lastDoc.y + dy * t;
              const lp = this.strokePointFromDoc({ x: px, y: py });
              const lpx = lp?.x ?? px;
              const lpy = lp?.y ?? py;
              const varied = this.brushDabVariation(opts, dab.size, dab.alpha, lpx, lpy);
              this.stampDab(s.strokeCtx, varied.size, hardness, varied.alpha, color, varied.x, varied.y);
              s.strokeBBox.minX = Math.min(s.strokeBBox.minX, varied.x - varied.size / 2);
              s.strokeBBox.minY = Math.min(s.strokeBBox.minY, varied.y - varied.size / 2);
              s.strokeBBox.maxX = Math.max(s.strokeBBox.maxX, varied.x + varied.size / 2);
              s.strokeBBox.maxY = Math.max(s.strokeBBox.maxY, varied.y + varied.size / 2);
            }
          }
          this.requestRender();
          break;
        }
        this.paintStrokeMove(tool, docP);
        this.requestRender();
        break;
      }
    }
    s.lastDoc = docP;
  }

  handlePointerUp(tool: string, vp: { x: number; y: number }, docP: { x: number; y: number }, _e: PointerEvent): void {
    const d = this.doc();
    const s = this.activeToolState;
    if (!d || !s || !s.pointerDown) { this.activeToolState = null; return; }

    switch (tool) {
      case "move": {
        if (s.transformId && s.transformBefore) {
          this.commitLayerTransform(s.transformId, s.transformBefore, "Move Layer");
        }
        this._snapLines = [];
        break;
      }
      case "selection": {
        const selOpts = useEditorStore.getState().toolOptions.selection;
        if (selOpts.shape === "lasso" && s.lassoPoints && s.lassoPoints.length >= 3 && !selOpts.useWand) {
          selectionEngine.setLasso(s.lassoPoints, selOpts.mode);
          this.requestRender();
        }
        s.lassoPoints = undefined;
        break;
      }
      case "shape": {
        if (s.shapeStartDoc) {
          const opts = useEditorStore.getState().toolOptions.shape;
          let draft = s.shapeDraft;
          const minSize = 6;
          if (!draft || draft.width < minSize || draft.height < minSize) {
            const cx = s.shapeStartDoc.x;
            const cy = s.shapeStartDoc.y;
            draft = { x: cx - 50, y: cy - 50, width: 100, height: 100 };
          }
          const sl = factoryCreateShapeLayer(s.shapeKind ?? "rect", "New Shape");
          sl.fill = opts.fill;
          sl.stroke = opts.stroke;
          sl.strokeWidth = opts.strokeWidth;
          sl.cornerRadius = opts.cornerRadius;
          sl.points = opts.points;
          sl.starRatio = opts.starRatio;
          sl.transform.x = draft.x;
          sl.transform.y = draft.y;
          sl.transform.width = Math.max(minSize, draft.width);
          sl.transform.height = Math.max(minSize, draft.height);
          this.addLayer(sl, "New Shape");
          useEditorStore.setState({ tool: "move", selectedIds: [sl.id] });
        }
        s.shapeStartDoc = undefined;
        s.shapeKind = undefined;
        s.shapeDraft = undefined;
        break;
      }
      case "gradient": {
        if (s.gradientStartDoc) {
          const opts = useEditorStore.getState().toolOptions.gradient;
          const gx = Math.hypot(docP.x - s.gradientStartDoc.x, docP.y - s.gradientStartDoc.y);
          if (gx < 2) {
            this.paintGradient(opts.kind, s.gradientStartDoc.x, s.gradientStartDoc.y, s.gradientStartDoc.x + 100, s.gradientStartDoc.y, [
              { pos: 0, color: opts.colorStart },
              { pos: 1, color: opts.colorEnd },
            ]);
          } else {
            this.paintGradient(opts.kind, s.gradientStartDoc.x, s.gradientStartDoc.y, docP.x, docP.y, [
              { pos: 0, color: opts.colorStart },
              { pos: 1, color: opts.colorEnd },
            ]);
          }
        }
        s.gradientStartDoc = undefined;
        break;
      }
      case "crop": {
        // Crop rect stored in state, apply when user clicks "Apply" via menu
        break;
      }
      case "brush":
      case "eraser":
      case "pencil":
      case "clone":
      case "heal":
      case "dodge":
      case "burn":
      case "smudge": {
        if (s.maskEditLayerId && useEditorStore.getState().editingMaskId === s.maskEditLayerId) {
          this.endMaskPaint(s.maskEditLayerId);
          s.maskEditLayerId = undefined;
          break;
        }
        if (s.strokeCanvas && s.transformId) {
          if (tool === "smudge" && !s.smudged) break;
          const pad = 4;
          const bbox = {
            x: Math.max(0, s.strokeBBox.minX - pad),
            y: Math.max(0, s.strokeBBox.minY - pad),
            width: s.strokeBBox.maxX - s.strokeBBox.minX + pad * 2,
            height: s.strokeBBox.maxY - s.strokeBBox.minY + pad * 2,
          };
          let stroke = s.strokeCanvas;
          if (tool === "brush" || tool === "eraser") {
            const opacity = Math.max(0, Math.min(1, useEditorStore.getState().toolOptions.brush.opacity));
            if (opacity < 1) {
              const capped = createCanvas(stroke.width, stroke.height);
              const cctx = getContext2d(capped);
              cctx.drawImage(stroke, 0, 0);
              cctx.globalCompositeOperation = "destination-in";
              cctx.globalAlpha = opacity;
              cctx.fillStyle = "#ffffff";
              cctx.beginPath();
              cctx.rect(0, 0, capped.width, capped.height);
              cctx.fill();
              stroke = capped;
            }
          }
          const mode = tool === "eraser" ? "erase" : tool === "dodge" ? "screen" : tool === "burn" ? "multiply" : "paint";
          const historyName = tool === "eraser" ? "Eraser" : tool === "pencil" ? "Pencil" : tool === "clone" ? "Clone Stamp" : tool === "heal" ? "Healing Brush" : tool === "dodge" ? "Dodge" : tool === "burn" ? "Burn" : tool === "smudge" ? "Smudge" : "Brush Stroke";
          this.commitStroke(s.transformId, stroke, bbox, mode, historyName);
        }
        break;
      }
    }
    this.activeToolState = null;
  }

  handleDblClick(docP: { x: number; y: number }): void {
    const d = this.doc();
    if (!d) return;
    // Find layer at point
    for (let i = d.layers.length - 1; i >= 0; i--) {
      const l = d.layers[i];
      if (!l.visible || l.type === "group" || l.parentId) continue;
      const t = l.transform;
      if (l.type === "adjustment") {
        if (l.adjustment === "levels" || l.adjustment === "curves") {
          useEditorStore.getState().openDialog({ name: l.adjustment === "levels" ? "levels" : "curves", payload: { layerId: l.id } });
        }
        break;
      }
      if (docP.x >= t.x && docP.x <= t.x + t.width && docP.y >= t.y && docP.y <= t.y + t.height) {
        if (l.type === "text") {
          useEditorStore.setState({ dialog: { name: "textEdit", payload: { layerId: l.id } } });
        }
        break;
      }
    }
  }

  getCropRect(): { x: number; y: number; width: number; height: number } | null {
    return this._cropRect;
  }

  getShapeDraftRect(): { x: number; y: number; width: number; height: number; kind: ShapeKind } | null {
    const s = this.activeToolState;
    if (!s?.shapeDraft || !s.shapeKind) return null;
    return { ...s.shapeDraft, kind: s.shapeKind };
  }

  setCropRect(rect: { x: number; y: number; width: number; height: number }): void {
    const d = this.doc(); if (!d) return;
    this._cropRect = {
      x: clamp(rect.x, 0, d.width),
      y: clamp(rect.y, 0, d.height),
      width: clamp(rect.width, 0, d.width),
      height: clamp(rect.height, 0, d.height),
    };
    this.requestRender();
  }

  getCropRectForRender(): { x: number; y: number; width: number; height: number } | null {
    return this._cropRect;
  }

  applyCropFromTool(): void {
    const rect = this.getCropRect();
    if (rect && rect.width > 2 && rect.height > 2) {
      this.applyCrop(rect);
    }
    this._cropRect = null;
    this.requestRender();
  }

  private clampCropRect(x: number, y: number, w: number, h: number): { x: number; y: number; width: number; height: number } {
    const d = this.doc(); if (!d) return { x, y, width: w, height: h };
    const width = Math.min(w, d.width);
    const height = Math.min(h, d.height);
    return {
      x: clamp(x, 0, Math.max(0, d.width - width)),
      y: clamp(y, 0, Math.max(0, d.height - height)),
      width,
      height,
    };
  }

  private selectionBounds(): { x: number; y: number; width: number; height: number } | null {
    if (!selectionEngine.hasSelection) return null;
    const shape = selectionEngine.shape;
    if (!shape) return null;
    if (shape.kind === "lasso" && shape.lassoPath && shape.lassoPath.length >= 3) {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of shape.lassoPath) {
        if (p[0] < minX) minX = p[0];
        if (p[1] < minY) minY = p[1];
        if (p[0] > maxX) maxX = p[0];
        if (p[1] > maxY) maxY = p[1];
      }
      return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
    }
    return { x: shape.x, y: shape.y, width: shape.width, height: shape.height };
  }

  /** Crop the document to the active selection bounds. Returns true when applied. */
  applyCropToSelection(): boolean {
    const rect = this.selectionBounds();
    if (!rect) return false;
    const d = this.doc(); if (!d) return false;
    const clamped = this.clampCropRect(rect.x, rect.y, rect.width, rect.height);
    if (clamped.width < 2 || clamped.height < 2) return false;
    this._cropRect = null;
    this.applyCrop(clamped);
    selectionEngine.clear();
    this.requestRender();
    return true;
  }

  hasCropSelection(): boolean {
    const rect = this.selectionBounds();
    return !!rect && rect.width >= 2 && rect.height >= 2;
  }

  cancelCrop(): void {
    this._cropRect = null;
    this.requestRender();
  }
}

export const editorEngine = new EditorEngine();
