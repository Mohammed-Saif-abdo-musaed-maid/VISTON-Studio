import { genId } from "../../utils/id";
import type { DocumentExtras } from "./documentExtras";

export const DOCUMENT_SCHEMA_VERSION = 1;
export const DEFAULT_DOCUMENT_DPI = 96;
export const DEFAULT_COLOR_PROFILE = "sRGB";
export const MAX_DOCUMENT_DIMENSION = 20000;

/**
 * Formal, UI-independent metadata attached to every open document.
 * The pixel content (layers + image buffers) lives in EditorDocument +
 * pixelStore; everything about a document's *identity and state* lives here.
 */
export interface DocumentMeta {
  id: string;
  name: string;
  createdAt: number;
  modifiedAt: number;
  dpi: number;
  background: string | null;
  colorProfile: string;
  /** Physical document size, kept alongside the raster dims so print metadata survives save/load. */
  physicalUnit: string | null;
  physicalWidth: number | null;
  physicalHeight: number | null;
}

export interface DocumentRecord {
  key: string;
  meta: DocumentMeta;
  savedPath: string | null;
  savedName: string;
  dirty: boolean;
  lastSavedAt: number | null;
  selectedIds: string[];
  /** Byte size of the last successfully written project file, when known. */
  savedSize: number | null;
  /** Phase 29/30 document state (guides, artboards, grid); absent = defaults. */
  extras?: DocumentExtras;
}

export function createDocumentMeta(partial: Partial<DocumentMeta> = {}): DocumentMeta {
  const now = Date.now();
  return {
    id: partial.id ?? genId("doc"),
    name: partial.name ?? "Untitled",
    createdAt: partial.createdAt ?? now,
    modifiedAt: partial.modifiedAt ?? now,
    dpi: partial.dpi ?? DEFAULT_DOCUMENT_DPI,
    background: partial.background === undefined ? "#ffffff" : partial.background,
    colorProfile: partial.colorProfile ?? DEFAULT_COLOR_PROFILE,
    physicalUnit: partial.physicalUnit === undefined ? null : partial.physicalUnit,
    physicalWidth: partial.physicalWidth === undefined ? null : partial.physicalWidth,
    physicalHeight: partial.physicalHeight === undefined ? null : partial.physicalHeight,
  };
}

export function updateMeta(meta: DocumentMeta, patch: Partial<DocumentMeta>): DocumentMeta {
  return { ...meta, ...patch, modifiedAt: Date.now() };
}

export function sanitizeDocumentName(name: string, fallback = "Untitled"): string {
  const cleaned = name.trim().replace(/[/\\:*?"<>|]/g, "").slice(0, 120);
  return cleaned || fallback;
}

/**
 * Clamp a document dimension to an integer within the supported range.
 * Returns NaN when the raw value cannot be interpreted as a number.
 */
export function clampDocumentDimension(value: unknown, fallback: number): number {
  const n = typeof value === "string" ? parseFloat(value) : Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_DOCUMENT_DIMENSION, Math.max(1, Math.round(n)));
}