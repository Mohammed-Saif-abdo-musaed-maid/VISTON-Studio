/**
 * Phase 29/30 — Per-document auxiliary state.
 *
 * Guides, artboards and grid settings are document state (they must survive
 * save/load) but they are intentionally NOT part of `EditorDocument`, because
 * that model is snapshotted by ~75 layer-only history closures. Keeping them in
 * a small sidecar attached to each document record means they persist and
 * round-trip without disturbing the layer history architecture.
 *
 * Older projects simply have no extras; `emptyExtras()` supplies the
 * backward-compatible defaults (no guides, no artboards, default grid).
 */

import type { Guide } from "../../state/store";
import type { Artboard } from "./artboards";
import { sanitizeArtboards } from "./artboards";
import { DEFAULT_GRID_SETTINGS, sanitizeGridSettings, type GridSettings } from "./gridSettings";

export interface DocumentExtras {
  guides: Guide[];
  artboards: Artboard[];
  grid: GridSettings;
}

export function emptyExtras(): DocumentExtras {
  return { guides: [], artboards: [], grid: { ...DEFAULT_GRID_SETTINGS } };
}

export function sanitizeGuides(raw: unknown): Guide[] {
  if (!Array.isArray(raw)) return [];
  const out: Guide[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const orientation = o.orientation === "h" || o.orientation === "v" ? o.orientation : null;
    const position = typeof o.position === "number" && Number.isFinite(o.position) ? Math.round(o.position) : null;
    if (!orientation || position === null) continue;
    const id = typeof o.id === "string" && o.id.length > 0 ? o.id : `guide-${Date.now().toString(36)}-${out.length}`;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, orientation, position });
  }
  return out;
}

export function sanitizeExtras(raw: { guides?: unknown; artboards?: unknown; grid?: unknown }, docW: number, docH: number): DocumentExtras {
  return {
    guides: sanitizeGuides(raw.guides),
    artboards: sanitizeArtboards(raw.artboards, docW, docH),
    grid: sanitizeGridSettings(raw.grid),
  };
}
