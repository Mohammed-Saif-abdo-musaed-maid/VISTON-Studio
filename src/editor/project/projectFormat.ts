import { EditorDocument, pixelStore, maskStore } from "../core/document";
import type { AdjustmentKind, AdjustmentParams, BlendMode, ImageLayer, Layer, ShapeKind, TextAlign, TextDirection, LayerStyles } from "../core/types";
import { ADJUSTMENT_KINDS as ADJUSTMENT_KINDS_ARR, SHAPE_KINDS as SHAPE_KINDS_ARR, emptyLayerStyles, LAYER_STYLE_KINDS } from "../core/types";
import type { ProductCompositeMetadata, ProductShadowMetadata, ProductLightingValues } from "../core/types";
import { emptyProductLighting } from "../core/types";
import { normalizeColorSpace } from "../core/colorSpace";
import { DOCUMENT_SCHEMA_VERSION } from "../core/documentMeta";
import { createImageLayerFromCanvas, createBlankImageLayer } from "../layers/layerFactory";
import { dataURLToCanvasAsync, createCanvas } from "../../utils/canvas";
import type { AILayerMetadata, AIParams, AISelection } from "../../ai/types";

const MASK_RESOURCE_PREFIX = "mask:";
const AI_OPERATION_VALUES = new Set<AILayerMetadata["operation"]>([
  "analyzeImage",
  "describe",
  "detectObjects",
  "detectFaces",
  "detectText",
  "classifyScene",
  "analyzeComposition",
  "selectSubject",
  "selectObject",
  "segment",
  "removeBackground",
  "removeObject",
  "inpaint",
  "generativeFill",
  "generativeExpand",
  "objectReplace",
  "generateImage",
  "generateVariation",
  "upscale",
  "denoise",
  "sharpen",
  "colorize",
  "restore",
  "relight",
  "enhance",
  "textAssist",
  "segmentProduct",
  "analyzeBackground",
  "detectSurface",
  "estimateLighting",
  "matchLighting",
  "generateShadow",
  "matchPerspective",
]);

/**
 * Vision Studio native project format (".vstudio").
 *
 * File layout (JSON text):
 *
 * {
 *   "vs": "VISIONSTUDIO",            // magic — identity & corruption guard
 *   "file": "vstudio",
 *   "version": 1,                    // project file schema version
 *   "app": "Vision Studio",
 *   "meta": {                        // document identity + resolution + background
 *     "id", "name", "createdAt", "modifiedAt", "dpi",
 *     "background", "colorProfile", "schemaVersion"
 *   },
 *   "activeLayerId": string | null,
 *   "layers": [ SerializedLayer ],   // editable layer descriptors, no image bytes
 *   "resources": { imageId: dataURL }// out-of-band pixel data
 * }
 *
 * Metadata/layer descriptors and pixel data are intentionally separated
 * (resources map) so small layer edits never force reserialization of pixel
 * buffers and large projects stay editable.
 */

export const PROJECT_MAGIC = "VISIONSTUDIO";
export const PROJECT_FILE_KIND = "vstudio";
export const PROJECT_FORMAT_VERSION = 1;
export const EXT = "vstudio";
export const LEGACY_EXT = "vsproject";

export interface ProjectMeta {
  id: string;
  name: string;
  width: number;
  height: number;
  createdAt: number;
  modifiedAt: number;
  dpi: number;
  background: string | null;
  colorProfile: string;
  schemaVersion: number;
  physicalUnit: string | null;
  physicalWidth: number | null;
  physicalHeight: number | null;
}

export type ProjectMetaInput = Pick<
  ProjectMeta,
  | "id"
  | "name"
  | "createdAt"
  | "modifiedAt"
  | "dpi"
  | "background"
  | "colorProfile"
  | "physicalUnit"
  | "physicalWidth"
  | "physicalHeight"
>;

export interface ProjectFile {
  vs: string;
  file: typeof PROJECT_FILE_KIND;
  version: number;
  app: string;
  meta: ProjectMeta;
  activeLayerId: string | null;
  layers: Record<string, unknown>[];
  resources: Record<string, string>;
  /** Optional serialized 3D scenes (Phase 12). Older files omit this key. */
  scenes?: unknown[];
  /** Optional imported model resources ("model/<->" assets). */
  imported?: { assetId?: unknown; name?: unknown; kind?: unknown; dataUrl?: unknown }[];
  /** Optional Phase 29 artboards. Older files omit this key. */
  artboards?: unknown[];
  /** Optional Phase 30 guides. Older files omit this key. */
  guides?: unknown[];
  /** Optional Phase 30 grid settings. Older files omit this key. */
  grid?: unknown;
}

export interface ProjectWarnings {
  skippedLayers: string[];
  recoveredImages: string[];
  notes: string[];
}

export interface ProjectLoadResult {
  doc: EditorDocument;
  meta: ProjectMeta;
  warnings: ProjectWarnings;
  activeLayerId: string | null;
}

export interface ProjectParseResult {
  file: ProjectFile | null;
  error: string | null;
  errorCode?: "malformed" | "unsupported-version" | "unknown-format";
  warnings: ProjectWarnings;
}

export class ProjectError extends Error {
  category: "malformed" | "unsupported-version" | "missing-data" | "corrupt-image";
  constructor(category: ProjectError["category"], message: string) {
    super(message);
    this.category = category;
  }
}

const ADJUSTMENT_KINDS = new Set<AdjustmentKind>(ADJUSTMENT_KINDS_ARR);
const SHAPE_KINDS = new Set<ShapeKind>(SHAPE_KINDS_ARR);
const BLEND_MODES = new Set<BlendMode>([
  "normal", "multiply", "screen", "overlay", "soft-light", "hard-light",
  "darken", "lighten", "difference", "exclusion", "color-dodge", "color-burn",
  "hue", "saturation", "color", "luminosity",
]);
const TEXT_ALIGNS = new Set<TextAlign>(["left", "center", "right", "justify"]);

function sanitizeBlendMode(v: unknown): BlendMode {
  return typeof v === "string" && (BLEND_MODES as Set<string>).has(v) ? (v as BlendMode) : "normal";
}

function safeTransform(raw: unknown): {
  x: number; y: number; width: number; height: number; rotation: number; scaleX: number; scaleY: number; skewX: number; skewY: number;
} {
  const t = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const num = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) ? v : def);
  return {
    x: num(t.x, 0),
    y: num(t.y, 0),
    width: num(t.width, 64),
    height: num(t.height, 64),
    rotation: num(t.rotation, 0),
    scaleX: num(t.scaleX, 1),
    scaleY: num(t.scaleY, 1),
    skewX: num(t.skewX, 0),
    skewY: num(t.skewY, 0),
  };
}

let LAYER_IDSEQ = 0;
function genLayerId(): string {
  LAYER_IDSEQ += 1;
  return `lay-${Date.now().toString(36)}-${LAYER_IDSEQ.toString(36)}`;
}

function serializeLayerBase(layer: Layer): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: layer.id,
    name: layer.name,
    type: layer.type,
    visible: !!layer.visible,
    locked: !!layer.locked,
    opacity: typeof layer.opacity === "number" ? layer.opacity : 1,
    blendMode: layer.blendMode,
    transform: { ...layer.transform },
    parentId: layer.parentId,
  };
  if (layer.clipTo) base.clipTo = layer.clipTo;
  if (layer.mask) base.mask = { id: layer.mask.id, enabled: layer.mask.enabled, linked: layer.mask.linked !== false };
  if (layer.ai) base.ai = serializeAiMetadata(layer.ai);
  if (layer.styles) base.styles = serializeLayerStyles(layer.styles);
  if (layer.type === "image") {
    const img = layer as ImageLayer;
    if (img.product) base.product = img.product;
    if (img.shadow) base.shadow = img.shadow;
  }
  return base;
}

function serializeAiMetadata(ai: AILayerMetadata): Record<string, unknown> {
  const sel = ai.sourceSelection;
  const out: Record<string, unknown> = {
    operation: ai.operation,
    provider: ai.provider,
    model: ai.model ?? null,
    prompt: ai.prompt ?? null,
    sourceLayerId: ai.sourceLayerId ?? null,
    createdAt: typeof ai.createdAt === "number" ? ai.createdAt : Date.now(),
    origin: ai.origin,
  };
  if (Object.keys(ai.parameters ?? {}).length > 0) out.parameters = ai.parameters;
  if (sel) {
    const maskArr = sel.mask ? Array.from(sel.mask.data) : null;
    out.sourceSelection = {
      kind: sel.kind,
      bounds: sel.bounds,
      mask: sel.mask ? { width: sel.mask.width, height: sel.mask.height, data: maskArr, weight: sel.mask.weight } : null,
    };
  }
  return out;
}

function serializeLayerVariants(layer: Layer, base: Record<string, unknown>): void {
  if (layer.type === "image") {
    base.imageId = layer.imageId;
  } else if (layer.type === "text") {
    base.text = layer.text;
    base.fontFamily = layer.fontFamily;
    base.fontSize = layer.fontSize;
    base.fontWeight = layer.fontWeight;
    base.fontStyle = layer.fontStyle;
    base.color = layer.color;
    base.align = layer.align;
    base.direction = layer.direction;
    base.letterSpacing = layer.letterSpacing;
    base.lineHeight = layer.lineHeight;
    base.autoFit = layer.autoFit;
    if (layer.overflowHidden) base.overflowHidden = true;
    if (layer.stroke) base.stroke = layer.stroke;
    if (layer.strokeWidth) base.strokeWidth = layer.strokeWidth;
    if (layer.shadow) base.shadow = { ...layer.shadow };
    if (layer.textPath && layer.textPath.points.length >= 2) base.textPath = { points: layer.textPath.points.map((p) => [p[0], p[1]]) };
  } else if (layer.type === "shape") {
    base.shape = layer.shape;
    base.fill = layer.fill;
    base.stroke = layer.stroke;
    base.strokeWidth = layer.strokeWidth;
    if (layer.cornerRadius) base.cornerRadius = layer.cornerRadius;
    if (layer.points !== 5) base.points = layer.points;
    if (layer.starRatio !== 0.4) base.starRatio = layer.starRatio;
    if (layer.pathPoints && layer.pathPoints.length >= 2) base.pathPoints = layer.pathPoints.map((p) => [p[0], p[1]]);
    if (layer.pathData && layer.pathData.length >= 2) base.pathData = layer.pathData;
  } else if (layer.type === "adjustment") {
    base.adjustment = layer.adjustment;
    base.amount = layer.amount;
    if (layer.params) base.params = layer.params;
  } else if (layer.type === "group") {
    base.collapsed = layer.collapsed;
  } else if (layer.type === "3d-scene") {
    base.sceneId = layer.sceneId;
    base.imageId = layer.imageId;
  } else if (layer.type === "3d-object" || layer.type === "3d-group") {
    base.sceneId = layer.sceneId;
    base.objectId = layer.objectId;
    base.imageId = layer.imageId;
  }
}

/** Compact, JSON-safe serialization of a layer's style effects. */
function serializeLayerStyles(styles: LayerStyles): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const key of LAYER_STYLE_KINDS) {
    const v = styles[key];
    if (v) out[key] = { ...v };
  }
  return out;
}

const STYLE_NUM = (v: unknown, def: number) => (typeof v === "number" && Number.isFinite(v) ? v : def);
const STYLE_CLAMP = (v: unknown, def: number, min: number, max: number) => Math.min(max, Math.max(min, STYLE_NUM(v, def)));
const STYLE_COLOR = (v: unknown) => (typeof v === "string" && v.length > 0 ? v : "#000000");

function parseStyleEffect(raw: unknown): Record<string, unknown> | null {
  return raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
}

/** Tolerant reader for the `styles` field (absent on all legacy projects). */
function sanitizeLayerStyles(raw: unknown): LayerStyles | null {
  const r = parseStyleEffect(raw);
  if (!r) return null;
  const out = emptyLayerStyles();
  let present = false;

  const ds = parseStyleEffect(r.dropShadow);
  if (ds) {
    out.dropShadow = {
      kind: "dropShadow",
      enabled: ds.enabled !== false,
      offsetX: STYLE_NUM(ds.offsetX, 0),
      offsetY: STYLE_NUM(ds.offsetY, 4),
      blur: STYLE_CLAMP(ds.blur, 6, 0, 512),
      color: STYLE_COLOR(ds.color),
      opacity: STYLE_CLAMP(ds.opacity, 0.4, 0, 1),
    };
    present = true;
  }
  const is = parseStyleEffect(r.innerShadow);
  if (is) {
    out.innerShadow = {
      kind: "innerShadow",
      enabled: is.enabled !== false,
      offsetX: STYLE_NUM(is.offsetX, 0),
      offsetY: STYLE_NUM(is.offsetY, 4),
      blur: STYLE_CLAMP(is.blur, 5, 0, 512),
      color: STYLE_COLOR(is.color),
      opacity: STYLE_CLAMP(is.opacity, 0.4, 0, 1),
    };
    present = true;
  }
  const og = parseStyleEffect(r.outerGlow);
  if (og) {
    out.outerGlow = {
      kind: "outerGlow",
      enabled: og.enabled !== false,
      blur: STYLE_CLAMP(og.blur, 8, 0, 512),
      spread: STYLE_CLAMP(og.spread, 0, 0, 256),
      color: STYLE_COLOR(og.color),
      opacity: STYLE_CLAMP(og.opacity, 0.6, 0, 1),
    };
    present = true;
  }
  const ig = parseStyleEffect(r.innerGlow);
  if (ig) {
    out.innerGlow = {
      kind: "innerGlow",
      enabled: ig.enabled !== false,
      blur: STYLE_CLAMP(ig.blur, 8, 0, 512),
      spread: STYLE_CLAMP(ig.spread, 0, 0, 256),
      color: STYLE_COLOR(ig.color),
      opacity: STYLE_CLAMP(ig.opacity, 0.6, 0, 1),
    };
    present = true;
  }
  const st = parseStyleEffect(r.stroke);
  if (st) {
    const pos = st.position;
    out.stroke = {
      kind: "stroke",
      enabled: st.enabled !== false,
      color: STYLE_COLOR(st.color),
      width: STYLE_CLAMP(st.width, 2, 0, 512),
      position: pos === "inside" || pos === "center" || pos === "outside" ? pos : "center",
      opacity: STYLE_CLAMP(st.opacity, 1, 0, 1),
    };
    present = true;
  }
  const co = parseStyleEffect(r.colorOverlay);
  if (co) {
    out.colorOverlay = {
      kind: "colorOverlay",
      enabled: co.enabled !== false,
      color: STYLE_COLOR(co.color),
      opacity: STYLE_CLAMP(co.opacity, 1, 0, 1),
    };
    present = true;
  }
  const go = parseStyleEffect(r.gradientOverlay);
  if (go) {
    const stopsRaw = Array.isArray(go.stops) ? go.stops : [];
    const stops = stopsRaw
      .map((s: unknown) => {
        const el = parseStyleEffect(s);
        if (!el) return null;
        return { pos: STYLE_CLAMP(el.pos, 0, 0, 1), color: STYLE_COLOR(el.color) };
      })
      .filter((s: { pos: number; color: string } | null): s is { pos: number; color: string } => s !== null);
    out.gradientOverlay = {
      kind: "gradientOverlay",
      enabled: go.enabled !== false,
      gradient: go.gradient === "radial" ? "radial" : "linear",
      angle: STYLE_NUM(go.angle, 90),
      stops: stops.length > 0 ? stops : [{ pos: 0, color: "#ffffff" }, { pos: 1, color: "#000000" }],
      opacity: STYLE_CLAMP(go.opacity, 1, 0, 1),
    };
    present = true;
  }
  const be = parseStyleEffect(r.bevel);
  if (be) {
    out.bevel = {
      kind: "bevel",
      enabled: be.enabled !== false,
      size: STYLE_CLAMP(be.size, 5, 0, 512),
      angle: STYLE_NUM(be.angle, 120),
      depth: STYLE_CLAMP(be.depth, 0.5, 0, 1),
      highlightColor: STYLE_COLOR(be.highlightColor),
      shadowColor: STYLE_COLOR(be.shadowColor),
      opacity: STYLE_CLAMP(be.opacity, 1, 0, 1),
    };
    present = true;
  }

  return present ? out : null;
}

export function collectResources(layers: Layer[]): Record<string, string> {
  const resources: Record<string, string> = {};
  const seen = new Set<string>();
  for (const layer of layers) {
    if (layer.type !== "image" && layer.type !== "3d-scene" && layer.type !== "3d-object" && layer.type !== "3d-group") continue;
    const id = (layer as { imageId: string }).imageId;
    if (seen.has(id)) continue;
    seen.add(id);
    const canvas = pixelStore.get(id);
    if (canvas) resources[id] = canvas.toDataURL("image/png");
  }
  for (const layer of layers) {
    if (layer.type !== "image") continue;
    const srcId = (layer as ImageLayer).product?.sourceImageId ?? null;
    if (srcId && !seen.has(srcId)) {
      seen.add(srcId);
      const canvas = pixelStore.get(srcId);
      if (canvas) resources[srcId] = canvas.toDataURL("image/png");
    }
  }
  for (const layer of layers) {
    if (!layer.mask) continue;
    const mask = maskStore.get(layer.mask.id);
    if (mask && !seen.has(`${MASK_RESOURCE_PREFIX}${layer.mask.id}`)) {
      resources[`${MASK_RESOURCE_PREFIX}${layer.mask.id}`] = mask.toDataURL("image/png");
      seen.add(`${MASK_RESOURCE_PREFIX}${layer.mask.id}`);
    }
  }
  return resources;
}

export function buildProjectFile(
  doc: EditorDocument,
  meta: ProjectMetaInput,
  activeLayerId: string | null,
  three3D?: {
    scenes?: unknown[];
    imported?: { assetId?: unknown; name?: unknown; kind?: unknown; dataUrl?: unknown }[];
    guides?: unknown[];
    artboards?: unknown[];
    grid?: unknown;
  }
): ProjectFile {
  const file: ProjectFile = {
    vs: PROJECT_MAGIC,
    file: PROJECT_FILE_KIND,
    version: PROJECT_FORMAT_VERSION,
    app: "Vision Studio",
    meta: {
      ...meta,
      width: doc.width,
      height: doc.height,
      schemaVersion: DOCUMENT_SCHEMA_VERSION,
    },
    activeLayerId,
    layers: doc.layers.map((layer) => {
      const base = serializeLayerBase(layer);
      serializeLayerVariants(layer, base);
      return base;
    }),
    resources: collectResources(doc.layers),
  };
  if (three3D) {
    if (three3D.scenes && three3D.scenes.length > 0) file.scenes = three3D.scenes;
    if (three3D.imported && three3D.imported.length > 0) file.imported = three3D.imported;
    if (three3D.guides && three3D.guides.length > 0) file.guides = three3D.guides;
    if (three3D.artboards && three3D.artboards.length > 0) file.artboards = three3D.artboards;
    if (three3D.grid) file.grid = three3D.grid;
  }
  return file;
}

export function stringifyProject(file: ProjectFile): string {
  return JSON.stringify(file);
}

function emptyWarnings(): ProjectWarnings {
  return { skippedLayers: [], recoveredImages: [], notes: [] };
}

/**
 * Parse raw project text into a validated ProjectFile.
 * Handles new ".vstudio" files, legacy ".vsproject.json" files, and produces
 * clear, categorized errors instead of throwing opaque exceptions.
 */
export function parseProjectText(text: string): ProjectParseResult {
  const warnings = emptyWarnings();
  let root: unknown;
  try {
    root = JSON.parse(text);
  } catch {
    return { file: null, error: "The file is not valid project JSON. It may be corrupted or not a Vision Studio project.", errorCode: "malformed", warnings };
  }
  if (typeof root !== "object" || root === null || Array.isArray(root)) {
    return { file: null, error: "The project file has no valid root object.", errorCode: "malformed", warnings };
  }
  const obj = root as Record<string, unknown>;

  const isLegacy = obj.vs === undefined && typeof obj.version === "number" && Array.isArray(obj.layers);
  const isNew = obj.vs === PROJECT_MAGIC || obj.file === PROJECT_FILE_KIND;

  if (!isNew && !isLegacy) {
    return { file: null, error: "This file does not look like a Vision Studio project.", errorCode: "unknown-format", warnings };
  }

  if (isNew) {
    const version = Number(obj.version);
    if (!Number.isFinite(version)) {
      return { file: null, error: "The project file is missing a valid version number.", errorCode: "malformed", warnings };
    }
    if (version > PROJECT_FORMAT_VERSION) {
      return {
        file: null,
        error: `This project was created with a newer version of Vision Studio (project version ${version}; this build supports up to ${PROJECT_FORMAT_VERSION}).`,
        errorCode: "unsupported-version",
        warnings,
      };
    }
    if (!obj.meta || typeof obj.meta !== "object") {
      return { file: null, error: "The project file is missing document metadata.", errorCode: "malformed", warnings };
    }
    const layers = Array.isArray(obj.layers) ? obj.layers : [];
    const resourcesRaw = obj.resources && typeof obj.resources === "object" && !Array.isArray(obj.resources)
      ? (obj.resources as Record<string, unknown>)
      : {};
    return {
      file: {
        vs: PROJECT_MAGIC,
        file: PROJECT_FILE_KIND,
        version,
        app: typeof obj.app === "string" ? obj.app : "Vision Studio",
        meta: validateProjectMeta(obj.meta as Record<string, unknown>, warnings),
        activeLayerId: typeof obj.activeLayerId === "string" ? obj.activeLayerId : null,
        layers,
        resources: sanitizeResources(resourcesRaw),
        scenes: Array.isArray(obj.scenes) ? obj.scenes : undefined,
        imported: Array.isArray(obj.imported) ? obj.imported : undefined,
        guides: Array.isArray(obj.guides) ? obj.guides : undefined,
        artboards: Array.isArray(obj.artboards) ? obj.artboards : undefined,
        grid: obj.grid && typeof obj.grid === "object" ? obj.grid : undefined,
      },
      error: null,
      warnings,
    };
  }

  // Legacy ".vsproject.json" (version 1 with inline imageDataUrl on layers).
  warnings.notes.push("Imported a legacy project file and converted it to the current format.");
  const layers = Array.isArray(obj.layers) ? obj.layers : [];
  const resources: Record<string, string> = {};
  const meta: ProjectMeta = {
    id: typeof obj.docId === "string" ? obj.docId : `legacy-${Date.now().toString(36)}`,
    name: typeof obj.name === "string" && obj.name.length > 0 ? obj.name : "Imported Project",
    width: typeof obj.width === "number" && obj.width > 0 ? Math.round(obj.width) : 1280,
    height: typeof obj.height === "number" && obj.height > 0 ? Math.round(obj.height) : 800,
    createdAt: typeof obj.createdAt === "number" ? obj.createdAt : Date.now(),
    modifiedAt: typeof obj.modifiedAt === "number" ? obj.modifiedAt : Date.now(),
    dpi: typeof obj.dpi === "number" && obj.dpi > 0 ? obj.dpi : 96,
    background: typeof obj.background === "string" ? obj.background : "#ffffff",
    colorProfile: DEFAULT_PROFILE,
    schemaVersion: DOCUMENT_SCHEMA_VERSION,
    physicalUnit: null,
    physicalWidth: null,
    physicalHeight: null,
  };
  for (const layer of layers) {
    if (layer && typeof layer === "object") {
      const l = layer as Record<string, unknown>;
      if (l.type === "image" && typeof l.imageDataUrl === "string") {
        const imageId = typeof l.imageId === "string" && l.imageId.length > 0
          ? l.imageId
          : `legacy-${String(l.id ?? "img").replace(/[^A-Za-z0-9_-]/g, "") || "img"}-${Date.now().toString(36)}`;
        resources[imageId] = l.imageDataUrl;
        l.imageId = imageId;
      }
    }
  }
  return {
    file: {
      vs: PROJECT_MAGIC,
      file: PROJECT_FILE_KIND,
      version: PROJECT_FORMAT_VERSION,
      app: "Vision Studio",
      meta,
      activeLayerId: null,
      layers,
      resources,
    },
    error: null,
    warnings,
  };
}

const DEFAULT_PROFILE = "sRGB";

export function validateProjectMeta(raw: Record<string, unknown>, warnings: ProjectWarnings): ProjectMeta {
  let width = Number(raw.width);
  let height = Number(raw.height);
  if (!Number.isFinite(width) || !Number.isFinite(height) || width < 1 || height < 1 || width > 100000 || height > 100000) {
    warnings.notes.push("Document dimensions were invalid; using 1280×800.");
    width = 1280;
    height = 800;
  }
  return {
    id: typeof raw.id === "string" && raw.id.length > 0 ? raw.id : `doc-${Date.now().toString(36)}`,
    name: typeof raw.name === "string" && raw.name.length > 0 ? raw.name : "Untitled",
    width: Math.round(width),
    height: Math.round(height),
    createdAt: typeof raw.createdAt === "number" ? raw.createdAt : Date.now(),
    modifiedAt: typeof raw.modifiedAt === "number" ? raw.modifiedAt : Date.now(),
    dpi: typeof raw.dpi === "number" && raw.dpi > 0 ? raw.dpi : 96,
    background:
      typeof raw.background === "string"
        ? raw.background
        : raw.background === null
          ? null
          : "#ffffff",
    colorProfile: normalizeColorSpace(raw.colorProfile),
    schemaVersion: typeof raw.schemaVersion === "number" ? raw.schemaVersion : DOCUMENT_SCHEMA_VERSION,
    physicalUnit: typeof raw.physicalUnit === "string" ? raw.physicalUnit : null,
    physicalWidth: typeof raw.physicalWidth === "number" && Number.isFinite(raw.physicalWidth) ? raw.physicalWidth : null,
    physicalHeight: typeof raw.physicalHeight === "number" && Number.isFinite(raw.physicalHeight) ? raw.physicalHeight : null,
  };
}

function sanitizeResources(raw: Record<string, unknown>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw)) {
    if (key.length > 0 && typeof value === "string" && value.startsWith("data:")) out[key] = value;
  }
  return out;
}

function applyCommon(layer: Layer, raw: Record<string, unknown>): void {
  layer.id = typeof raw.id === "string" && raw.id.length > 0 ? raw.id : genLayerId();
  layer.name = typeof raw.name === "string" && raw.name.length > 0 ? raw.name : layer.type;
  layer.visible = raw.visible !== false;
  layer.locked = raw.locked === true;
  layer.opacity = typeof raw.opacity === "number" && Number.isFinite(raw.opacity) ? Math.min(1, Math.max(0, raw.opacity)) : 1;
  layer.blendMode = sanitizeBlendMode(raw.blendMode);
  layer.parentId = typeof raw.parentId === "string" ? raw.parentId : null;
  layer.clipTo = typeof raw.clipTo === "string" ? raw.clipTo : null;
  const mask = raw.mask;
  layer.mask = mask && typeof mask === "object"
    ? {
        id: typeof (mask as Record<string, unknown>).id === "string" ? String((mask as Record<string, unknown>).id) : genLayerId(),
        enabled: (mask as Record<string, unknown>).enabled !== false,
        linked: (mask as Record<string, unknown>).linked !== false,
      }
    : null;
  layer.transform = { ...safeTransform(raw.transform) };
  layer.ai = sanitizeAiMetadata(raw.ai);
  layer.styles = sanitizeLayerStyles(raw.styles);
  if (layer.type === "image") {
    const img = layer as ImageLayer;
    if (raw.product) img.product = sanitizeProductMeta(raw.product);
    if (raw.shadow) img.shadow = sanitizeShadowMeta(raw.shadow);
  }
}

function sanitizeLightingValues(raw: unknown): ProductLightingValues {
  const r = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  const out = emptyProductLighting();
  const num = (k: string, def: number, min: number, max: number) => {
    const v = r[k];
    return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
  };
  out.brightness = num("brightness", 0, -100, 100);
  out.contrast = num("contrast", 0, -100, 100);
  out.saturation = num("saturation", 0, -100, 100);
  out.temperature = num("temperature", 0, -100, 100);
  out.tint = num("tint", 0, -100, 100);
  out.exposure = num("exposure", 0, -3, 3);
  out.highlights = num("highlights", 0, -100, 100);
  out.shadows = num("shadows", 0, -100, 100);
  return out;
}

function sanitizeProductMeta(raw: unknown): ProductCompositeMetadata | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  if (r.role !== "product") return null;
  const seg = r.segmentOrigin;
  const segmentOrigin =
    seg === "ai" || seg === "manual" || seg === "mock" || seg === "canvas" ? seg : "none";
  const num = (k: string, def: number) => (typeof r[k] === "number" && Number.isFinite(r[k]) ? r[k] : def);
  const sp = r.smartPlace && typeof r.smartPlace === "object" ? (r.smartPlace as Record<string, unknown>) : null;
  const pm = r.perspectiveMatched && typeof r.perspectiveMatched === "object" ? (r.perspectiveMatched as Record<string, unknown>) : null;
  return {
    role: "product",
    sourceName: typeof r.sourceName === "string" ? r.sourceName : null,
    sourceWidth: Math.max(0, num("sourceWidth", 0)),
    sourceHeight: Math.max(0, num("sourceHeight", 0)),
    segmentOrigin,
    segmentOperation: typeof r.segmentOperation === "string" ? r.segmentOperation : null,
    segmentProvider: typeof r.segmentProvider === "string" ? r.segmentProvider : null,
    segmentModel: typeof r.segmentModel === "string" ? r.segmentModel : null,
    segmentPrompt: typeof r.segmentPrompt === "string" ? r.segmentPrompt : null,
    importedAt: typeof r.importedAt === "number" ? r.importedAt : Date.now(),
    lighting: sanitizeLightingValues(r.lighting),
    colorMatch: sanitizeLightingValues(r.colorMatch),
    smartPlace:
      sp && typeof sp.ai === "boolean"
        ? {
            ai: sp.ai,
            operation: typeof sp.operation === "string" ? sp.operation : null,
            provider: typeof sp.provider === "string" ? sp.provider : null,
            x: typeof sp.x === "number" ? sp.x : 0,
            y: typeof sp.y === "number" ? sp.y : 0,
            width: typeof sp.width === "number" ? sp.width : 0,
            height: typeof sp.height === "number" ? sp.height : 0,
          }
        : null,
    perspectiveMatched:
      pm && typeof pm.ai === "boolean"
        ? {
            ai: pm.ai,
            operation: typeof pm.operation === "string" ? pm.operation : null,
            provider: typeof pm.provider === "string" ? pm.provider : null,
            skewX: typeof pm.skewX === "number" ? pm.skewX : 0,
            skewY: typeof pm.skewY === "number" ? pm.skewY : 0,
          }
        : null,
    sourceImageId: typeof r.sourceImageId === "string" ? r.sourceImageId : null,
  };
}

function sanitizeShadowMeta(raw: unknown): ProductShadowMetadata | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const mode = r.mode === "shadow" || r.mode === "reflection" ? r.mode : null;
  if (!mode) return null;
  const num = (k: string, def: number, min: number, max: number) => {
    const v = r[k];
    return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
  };
  return {
    mode,
    productLayerId: typeof r.productLayerId === "string" ? r.productLayerId : null,
    opacity: num("opacity", 0.5, 0, 1),
    blur: num("blur", 12, 0, 400),
    distance: num("distance", 60, 0, 2000),
    angle: num("angle", 90, 0, 360),
    spread: num("spread", 0, -50, 50),
    tinted: num("tinted", 0, 0, 1),
    segments: num("segments", 6, 1, 64),
    generatedAt: typeof r.generatedAt === "number" ? r.generatedAt : Date.now(),
  };
}

function sanitizeAiMetadata(raw: unknown): AILayerMetadata | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  if (typeof rec.operation !== "string") return null;
  if (!AI_OPERATION_VALUES.has(rec.operation as AILayerMetadata["operation"])) return null;
  const sel = rec.sourceSelection && typeof rec.sourceSelection === "object"
    ? (rec.sourceSelection as Record<string, unknown>)
    : null;
  const selMask = sel?.mask && typeof sel.mask === "object" ? (sel.mask as Record<string, unknown>) : null;
  const dataArr = Array.isArray(selMask?.data) ? selMask.data : null;
  const masked = selMask && dataArr
    ? {
        width: typeof selMask.width === "number" ? selMask.width : 0,
        height: typeof selMask.height === "number" ? selMask.height : 0,
        data: new Uint8Array(dataArr.map((v) => (typeof v === "number" ? Math.max(0, Math.min(255, v)) : 0))),
        weight: typeof selMask.weight === "number" ? Math.min(1, Math.max(0, selMask.weight)) : 1,
      }
    : null;
  const bounds = sel?.bounds && typeof sel.bounds === "object" ? (sel.bounds as Record<string, unknown>) : null;
  const params = rec.parameters && typeof rec.parameters === "object" ? (rec.parameters as AIParams) : {};
  return {
    operation: rec.operation as AILayerMetadata["operation"],
    provider: typeof rec.provider === "string" ? rec.provider : "unknown",
    model: typeof rec.model === "string" ? rec.model : null,
    prompt: typeof rec.prompt === "string" ? rec.prompt : null,
    sourceLayerId: typeof rec.sourceLayerId === "string" ? rec.sourceLayerId : null,
    sourceSelection:
      sel && (masked || bounds)
        ? {
            kind: sel.kind === "rectangle" || sel.kind === "ellipse" || sel.kind === "lasso" || sel.kind === "raster-mask"
              ? (sel.kind as AISelection["kind"])
              : "raster-mask",
            bounds:
              bounds && typeof bounds.x === "number" && typeof bounds.y === "number" && typeof bounds.width === "number" && typeof bounds.height === "number"
                ? { x: bounds.x, y: bounds.y, width: bounds.width, height: bounds.height }
                : null,
            mask: masked,
          }
        : null,
    parameters: params as AIParams,
    createdAt: typeof rec.createdAt === "number" ? rec.createdAt : Date.now(),
    generatedFrom: typeof rec.generatedFrom === "string" ? rec.generatedFrom : null,
    origin: rec.origin === "mock" || rec.origin === "local" || rec.origin === "provider" ? (rec.origin as AILayerMetadata["origin"]) : "provider",
  };
}

/**
 * Convert a validated ProjectFile into an EditorDocument.
 * Every malformed layer/image is recovered (skipped or replaced) instead of
 * failing the whole load.
 */
export async function buildDocumentFromProject(file: ProjectFile): Promise<ProjectLoadResult> {
  const warnings = emptyWarnings();
  const layers: Layer[] = [];

  const masksToLoad: { id: string; dataUrl: string }[] = [];
  for (const [key, value] of Object.entries(file.resources)) {
    if (key.startsWith(MASK_RESOURCE_PREFIX)) {
      masksToLoad.push({ id: key.slice(MASK_RESOURCE_PREFIX.length), dataUrl: value });
    }
  }

  for (const raw of file.layers) {
    if (!raw || typeof raw !== "object") {
      warnings.skippedLayers.push(raw === null ? "null" : String((raw as { id?: string })?.id ?? "unknown"));
      continue;
    }
    const rec = raw as Record<string, unknown>;
    const type = rec.type;
    try {
      let layer: Layer | null = null;
      if (type === "image") {
        const imageId = typeof rec.imageId === "string" ? rec.imageId : "";
        const dataUrl = file.resources[imageId];
        let canvas: HTMLCanvasElement;
        if (dataUrl) {
          try {
            canvas = await dataURLToCanvasAsync(dataUrl);
          } catch {
            warnings.recoveredImages.push(String(rec.id ?? imageId) || imageId);
            canvas = blankFromTransform(safeTransform(rec.transform));
          }
        } else {
          warnings.recoveredImages.push(String(rec.id ?? imageId) || imageId);
          canvas = blankFromTransform(safeTransform(rec.transform));
        }
        if (canvas.width < 1 || canvas.height < 1 || canvas.width > 32000 || canvas.height > 32000) {
          warnings.recoveredImages.push(String(rec.id ?? imageId) || imageId);
          canvas = blankFromTransform(safeTransform(rec.transform));
        }
        const imgLayer = createImageLayerFromCanvas(canvas, String(rec.name ?? "Image"), 0, 0);
        if (imageId) {
          imgLayer.id = imageId;
          imgLayer.imageId = imageId;
        }
        applyCommon(imgLayer, rec);
        imgLayer.transform.width = Math.max(1, imgLayer.transform.width);
        imgLayer.transform.height = Math.max(1, imgLayer.transform.height);
        layer = imgLayer;
      } else if (type === "text") {
        layer = {
          id: "", name: "", type: "text",
          visible: true, locked: false, opacity: 1, blendMode: "normal",
          parentId: null, clipTo: null, mask: null, transform: safeTransform(rec.transform),
          text: typeof rec.text === "string" ? rec.text : "Text",
          fontFamily: typeof rec.fontFamily === "string" ? rec.fontFamily : "Arial",
          fontSize: typeof rec.fontSize === "number" && rec.fontSize > 0 ? rec.fontSize : 48,
          fontWeight: clampNum(rec.fontWeight, 100, 900, 400),
          fontStyle: rec.fontStyle === "italic" ? "italic" : "normal",
          color: typeof rec.color === "string" ? rec.color : "#222222",
          align: TEXT_ALIGNS.has(rec.align as TextAlign) ? (rec.align as TextAlign) : "left",
          direction: rec.direction === "rtl" ? "rtl" : "ltr",
          letterSpacing: typeof rec.letterSpacing === "number" ? rec.letterSpacing : 0,
          lineHeight: typeof rec.lineHeight === "number" ? rec.lineHeight : 1.4,
          autoFit: rec.autoFit === true,
          overflowHidden: rec.overflowHidden === true,
          stroke: typeof rec.stroke === "string" ? rec.stroke : null,
          strokeWidth: typeof rec.strokeWidth === "number" ? Math.max(0, rec.strokeWidth) : 0,
          shadow: (() => {
            const sh = rec.shadow as Record<string, unknown> | null | undefined;
            if (!sh || typeof sh !== "object") return null;
            const num = (k: string, def: number) => (typeof sh[k] === "number" && Number.isFinite(sh[k]) ? sh[k] : def);
            return {
              offsetX: num("offsetX", 2),
              offsetY: num("offsetY", 2),
              blur: Math.max(0, num("blur", 0)),
              color: typeof sh.color === "string" ? sh.color : "#000000",
              opacity: Math.min(1, Math.max(0, num("opacity", 0.5))),
            };
          })(),
          textPath: (() => {
            const tp = rec.textPath as { points?: unknown } | undefined;
            const pts = tp?.points;
            if (!Array.isArray(pts)) return null;
            const valid = pts
              .map((p: unknown): number[] | null => (Array.isArray(p) && p.length >= 2 && typeof p[0] === "number" && typeof p[1] === "number" ? [p[0], p[1]] : null))
              .filter((p: number[] | null): p is number[] => p !== null);
            return valid.length >= 2 ? { points: valid } : null;
          })(),
        };
        applyCommon(layer, rec);
      } else if (type === "shape") {
        layer = {
          id: "", name: "", type: "shape",
          visible: true, locked: false, opacity: 1, blendMode: "normal",
          parentId: null, clipTo: null, mask: null, transform: safeTransform(rec.transform),
          shape: SHAPE_KINDS.has(rec.shape as ShapeKind) ? (rec.shape as ShapeKind) : "rect",
          fill: typeof rec.fill === "string" ? rec.fill : "#4f8cff",
          stroke: typeof rec.stroke === "string" ? rec.stroke : "#222222",
          strokeWidth: typeof rec.strokeWidth === "number" ? Math.max(0, rec.strokeWidth) : 2,
          cornerRadius: typeof rec.cornerRadius === "number" ? Math.max(0, rec.cornerRadius) : 0,
          points: typeof rec.points === "number" ? clampNum(rec.points, 3, 64, 5) : 5,
          starRatio: typeof rec.starRatio === "number" ? Math.min(1, Math.max(0, rec.starRatio)) : 0.4,
          pathPoints: (() => {
            const pts = rec.pathPoints;
            if (!Array.isArray(pts) || pts.length < 2) return null;
            const valid = pts
              .map((p: unknown): number[] | null => (Array.isArray(p) && p.length >= 2 && typeof p[0] === "number" && typeof p[1] === "number" ? [p[0], p[1]] : null))
              .filter((p: number[] | null): p is number[] => p !== null);
            return valid.length >= 2 ? valid : null;
          })(),
          pathData: (() => {
            const pd = rec.pathData;
            if (!Array.isArray(pd) || pd.length < 2) return null;
            const valid = pd
              .map((p: unknown) => {
                if (!p || typeof p !== "object") return null;
                const q = p as Record<string, unknown>;
                if (typeof q.x !== "number" || typeof q.y !== "number") return null;
                return {
                  x: q.x,
                  y: q.y,
                  inX: typeof q.inX === "number" ? q.inX : 0,
                  inY: typeof q.inY === "number" ? q.inY : 0,
                  outX: typeof q.outX === "number" ? q.outX : 0,
                  outY: typeof q.outY === "number" ? q.outY : 0,
                  smooth: q.smooth === true,
                };
              })
              .filter((p: { x: number; y: number; inX: number; inY: number; outX: number; outY: number; smooth: boolean } | null): p is { x: number; y: number; inX: number; inY: number; outX: number; outY: number; smooth: boolean } => p !== null);
            return valid.length >= 2 ? valid : null;
          })(),
        };
        applyCommon(layer, rec);
      } else if (type === "adjustment") {
        layer = {
          id: "", name: "", type: "adjustment",
          visible: true, locked: false, opacity: 1, blendMode: "normal",
          parentId: null, clipTo: null, mask: null, transform: safeTransform(rec.transform),
          adjustment: ADJUSTMENT_KINDS.has(rec.adjustment as AdjustmentKind) ? (rec.adjustment as AdjustmentKind) : "brightness",
          amount: typeof rec.amount === "number" ? rec.amount : 0,
          params: sanitizeAdjustmentParams(rec.params),
        };
        applyCommon(layer, rec);
      } else if (type === "group") {
        layer = {
          id: "", name: "", type: "group",
          visible: true, locked: false, opacity: 1, blendMode: "normal",
          parentId: null, clipTo: null, mask: null, transform: safeTransform(rec.transform),
          collapsed: rec.collapsed === true,
        };
        applyCommon(layer, rec);
      } else if (type === "3d-scene" || type === "3d-object" || type === "3d-group") {
        const rawImageId = typeof rec.imageId === "string" ? rec.imageId : "";
        const dataUrl = rawImageId ? file.resources[rawImageId] : undefined;
        let canvas: HTMLCanvasElement;
        if (dataUrl) {
          try {
            canvas = await dataURLToCanvasAsync(dataUrl);
          } catch {
            warnings.recoveredImages.push(rawImageId);
            canvas = blankFromTransform(safeTransform(rec.transform));
          }
        } else {
          canvas = blankFromTransform(safeTransform(rec.transform));
        }
        const sceneId = typeof rec.sceneId === "string" ? rec.sceneId : "";
        const objectId = typeof rec.objectId === "string" ? rec.objectId : "";
        const imageId = rawImageId.length > 0 ? rawImageId : genLayerId();
        const base = {
          id: "", name: type, visible: true, locked: false, opacity: 1, blendMode: "normal",
          parentId: null, clipTo: null, mask: null, transform: safeTransform(rec.transform), imageId,
        };
        if (type === "3d-scene") {
          layer = { ...base, type: "3d-scene", sceneId } as unknown as Layer;
        } else {
          layer = { ...base, type, sceneId, objectId } as unknown as Layer;
        }
        applyCommon(layer, rec);
        pixelStore.set(imageId, canvas);
      } else {
        warnings.skippedLayers.push(String(rec.id ?? type ?? "unknown"));
      }
      if (layer) layers.push(layer);
    } catch {
      warnings.skippedLayers.push(String(rec.id ?? type ?? "unknown"));
    }
  }

  for (const m of masksToLoad) {
    if (!layers.some((l) => l.mask && l.mask.id === m.id)) continue;
    try {
      const canvas = await dataURLToCanvasAsync(m.dataUrl);
      if (canvas.width >= 1 && canvas.height >= 1 && canvas.width <= 32000 && canvas.height <= 32000) {
        maskStore.set(m.id, canvas);
      }
    } catch {
      warnings.recoveredImages.push(`mask:${m.id}`);
    }
  }

  const dims = normalizedDimensions(file.meta);
  const doc = new EditorDocument(dims.width, dims.height, layers);
  const activeLayerId = file.activeLayerId && layers.some((l) => l.id === file.activeLayerId) ? file.activeLayerId : null;
  return { doc, meta: { ...file.meta, schemaVersion: DOCUMENT_SCHEMA_VERSION }, warnings, activeLayerId };
}

function blankFromTransform(t: { width: number; height: number }): HTMLCanvasElement {
  const w = Math.max(1, Math.min(32000, Math.round(t.width)));
  const h = Math.max(1, Math.min(32000, Math.round(t.height)));
  return createCanvas(w, h);
}

function normalizedDimensions(meta: ProjectMeta): { width: number; height: number } {
  const width = Number(meta.width);
  const height = Number(meta.height);
  if (Number.isFinite(width) && Number.isFinite(height) && width >= 1 && height >= 1 && width <= 100000 && height <= 100000) {
    return { width: Math.round(width), height: Math.round(height) };
  }
  return { width: 1280, height: 800 };
}

function clampNum(v: unknown, min: number, max: number, def: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
}

function sanitizeAdjustmentParams(raw: unknown): AdjustmentParams | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Record<string, unknown>;
  const out: AdjustmentParams = {};
  for (const key of ["brightness", "contrast", "gamma", "saturation", "exposure", "hue", "temperature", "vibrance"] as const) {
    if (typeof p[key] === "number" && Number.isFinite(p[key])) out[key] = p[key];
  }
  const cb = p.colorBalance;
  if (cb && typeof cb === "object") {
    const c = cb as Record<string, unknown>;
    out.colorBalance = {
      shadows: typeof c.shadows === "number" ? c.shadows : 0,
      midtones: typeof c.midtones === "number" ? c.midtones : 0,
      highlights: typeof c.highlights === "number" ? c.highlights : 0,
    };
  }
  const lv = p.levels;
  if (lv && typeof lv === "object") {
    const l = lv as Record<string, unknown>;
    out.levels = {
      black: typeof l.black === "number" ? l.black : 0,
      mid: typeof l.mid === "number" ? l.mid : 1,
      white: typeof l.white === "number" ? l.white : 255,
    };
  }
  if (Array.isArray(p.curves)) {
    const pts = (p.curves as unknown[]).filter(
      (c): c is number[] => Array.isArray(c) && c.length >= 2 && c.every((n) => typeof n === "number")
    );
    if (pts.length > 0) out.curves = pts;
  }
  if (typeof p.equalize === "boolean") out.equalize = p.equalize;
  if (typeof p.tint === "number" && Number.isFinite(p.tint)) out.tint = Math.min(100, Math.max(-100, p.tint));
  const bw = p.blackWhite;
  if (bw && typeof bw === "object") {
    const w = bw as Record<string, unknown>;
    out.blackWhite = {
      red: typeof w.red === "number" ? w.red : 1,
      green: typeof w.green === "number" ? w.green : 1,
      blue: typeof w.blue === "number" ? w.blue : 1,
    };
  }
  const cm = p.channelMixer;
  if (cm && typeof cm === "object") {
    const m = cm as Record<string, unknown>;
    const row = (r: unknown, def: { r: number; g: number; b: number }): { r: number; g: number; b: number } => {
      const rr = r && typeof r === "object" ? (r as Record<string, unknown>) : {};
      return {
        r: typeof rr.r === "number" ? rr.r : def.r,
        g: typeof rr.g === "number" ? rr.g : def.g,
        b: typeof rr.b === "number" ? rr.b : def.b,
      };
    };
    out.channelMixer = {
      red: row(m.red, { r: 1, g: 0, b: 0 }),
      green: row(m.green, { r: 0, g: 1, b: 0 }),
      blue: row(m.blue, { r: 0, g: 0, b: 1 }),
    };
  }
  const sc = p.selectiveColor;
  if (sc && typeof sc === "object") {
    const s = sc as Record<string, unknown>;
    const n = (k: string): number => (typeof s[k] === "number" ? Math.min(100, Math.max(-100, s[k])) : 0);
    out.selectiveColor = {
      reds: n("reds"),
      yellows: n("yellows"),
      greens: n("greens"),
      cyans: n("cyans"),
      blues: n("blues"),
      magentas: n("magentas"),
      whites: n("whites"),
      neutrals: n("neutrals"),
      blacks: n("blacks"),
    };
  }
  const gm = p.gradientMap;
  if (gm && typeof gm === "object") {
    const g = gm as Record<string, unknown>;
    if (Array.isArray(g.stops)) {
      const stops = (g.stops as unknown[])
        .map((s): { pos: number; color: string } | null => {
          if (!s || typeof s !== "object") return null;
          const ss = s as Record<string, unknown>;
          if (typeof ss.pos !== "number" || typeof ss.color !== "string") return null;
          return { pos: Math.min(1, Math.max(0, ss.pos)), color: ss.color };
        })
        .filter((s: { pos: number; color: string } | null): s is { pos: number; color: string } => s !== null);
      if (stops.length > 0) out.gradientMap = { stops };
    }
  }
  const cl = p.colorLookup;
  if (cl && typeof cl === "object") {
    const lutName = (cl as Record<string, unknown>).lut;
    if (lutName === "identity" || lutName === "grayscale" || lutName === "invert" || lutName === "sepia") {
      out.colorLookup = { lut: lutName };
    }
  }
  return out;
}

export const PROJECT_COMPAT_EXTS = [".vstudio", `.${LEGACY_EXT}`, `.${LEGACY_EXT}.json`, ".json"];