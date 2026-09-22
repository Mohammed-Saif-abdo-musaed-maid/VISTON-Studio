/**
 * Phase 29 — Artboards.
 *
 * An artboard is a first-class document entity: a named, movable, resizable
 * frame with an optional background, saved in the project file. It is NOT a
 * drawn rectangle. Artboards act as named export regions and layout frames;
 * layers remain global document layers (this app composites a single canvas),
 * so an artboard never silently "owns" or hides layer content.
 *
 * Backward compatibility: older projects simply have no `artboards` array.
 */

export interface Artboard {
  id: string;
  name: string;
  x: number;
  y: number;
  width: number;
  height: number;
  /** Fill painted behind the document composite for this artboard, or null. */
  background: string | null;
  visible: boolean;
}

export interface ArtboardRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

let artboardCounter = 0;

export function genArtboardId(): string {
  artboardCounter++;
  return `artboard-${Date.now().toString(36)}-${artboardCounter.toString(36)}`;
}

function finite(v: unknown, def: number): number {
  return typeof v === "number" && Number.isFinite(v) ? v : def;
}

export function normalizeArtboardRect(rect: ArtboardRect): ArtboardRect {
  const x = Math.round(finite(rect.x, 0));
  const y = Math.round(finite(rect.y, 0));
  const width = Math.max(1, Math.round(finite(rect.width, 1)));
  const height = Math.max(1, Math.round(finite(rect.height, 1)));
  return { x, y, width, height };
}

export function makeArtboard(input: ArtboardRect & { name?: string; background?: string | null }): Artboard {
  const rect = normalizeArtboardRect(input);
  const name = typeof input.name === "string" && input.name.trim().length > 0 ? input.name.trim() : "Artboard";
  return {
    id: genArtboardId(),
    name,
    ...rect,
    background: typeof input.background === "string" ? input.background : null,
    visible: true,
  };
}

/** Tolerant loader: drops malformed entries, de-dupes ids, keeps the rest. */
export function sanitizeArtboards(raw: unknown, docW: number, docH: number): Artboard[] {
  if (!Array.isArray(raw)) return [];
  const out: Artboard[] = [];
  const seen = new Set<string>();
  let index = 0;
  for (const item of raw) {
    index++;
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const id = typeof o.id === "string" && o.id.length > 0 ? o.id : genArtboardId();
    if (seen.has(id)) continue;
    seen.add(id);
    const rect = normalizeArtboardRect({
      x: finite(o.x, 0),
      y: finite(o.y, 0),
      width: finite(o.width, Math.min(1024, docW)),
      height: finite(o.height, Math.min(768, docH)),
    });
    out.push({
      id,
      name: typeof o.name === "string" && o.name.trim().length > 0 ? o.name.trim() : `Artboard ${index}`,
      ...rect,
      background: typeof o.background === "string" ? o.background : null,
      visible: o.visible !== false,
    });
  }
  return out;
}

export function artboardContains(ab: Artboard, x: number, y: number): boolean {
  return x >= ab.x && x <= ab.x + ab.width && y >= ab.y && y <= ab.y + ab.height;
}

/** Topmost artboard under a point (later entries render on top). */
export function findArtboardAt(artboards: readonly Artboard[], x: number, y: number): Artboard | null {
  for (let i = artboards.length - 1; i >= 0; i--) {
    const ab = artboards[i];
    if (ab && artboardContains(ab, x, y)) return ab;
  }
  return null;
}

export function artboardBounds(ab: Artboard): ArtboardRect {
  return { x: ab.x, y: ab.y, width: ab.width, height: ab.height };
}

/** Clamp an artboard rect so it stays within the document canvas. */
export function clampArtboardToDoc(rect: ArtboardRect, docW: number, docH: number): ArtboardRect {
  const r = normalizeArtboardRect(rect);
  const width = Math.min(r.width, Math.max(1, Math.round(docW)));
  const height = Math.min(r.height, Math.max(1, Math.round(docH)));
  const x = Math.min(Math.max(0, r.x), Math.max(0, Math.round(docW) - width));
  const y = Math.min(Math.max(0, r.y), Math.max(0, Math.round(docH) - height));
  return { x, y, width, height };
}
