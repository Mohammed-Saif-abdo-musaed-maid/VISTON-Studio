/**
 * Phase 30 — Grid settings.
 *
 * The visual grid already existed but had no user-controllable spacing. These
 * settings make the grid a real, persisted document setting (spacing,
 * subdivisions and colour) instead of a hard-coded overlay.
 *
 * Visibility itself remains the existing `showGrid` store flag so there is a
 * single source of truth for on/off.
 */

export interface GridSettings {
  /** Major grid cell size in document pixels. */
  spacing: number;
  /** Minor lines drawn per major cell (1 = major lines only). */
  subdivisions: number;
  color: string;
}

export const DEFAULT_GRID_SETTINGS: GridSettings = {
  spacing: 64,
  subdivisions: 4,
  color: "#3b82f6",
};

export function sanitizeGridSettings(raw: unknown): GridSettings {
  if (!raw || typeof raw !== "object") return { ...DEFAULT_GRID_SETTINGS };
  const o = raw as Record<string, unknown>;
  const spacing = typeof o.spacing === "number" && Number.isFinite(o.spacing) && o.spacing >= 2 ? Math.round(o.spacing) : DEFAULT_GRID_SETTINGS.spacing;
  const subdivisions = typeof o.subdivisions === "number" && Number.isFinite(o.subdivisions)
    ? Math.min(32, Math.max(1, Math.round(o.subdivisions)))
    : DEFAULT_GRID_SETTINGS.subdivisions;
  const color = typeof o.color === "string" && /^#[0-9a-fA-F]{6}$/.test(o.color) ? o.color : DEFAULT_GRID_SETTINGS.color;
  return { spacing, subdivisions, color };
}

/** Distance between adjacent grid lines used for snapping (minor step). */
export function gridStep(settings: GridSettings): number {
  return settings.spacing / Math.max(1, settings.subdivisions);
}

/** Grid line coordinates across `extent` document pixels (major + minor). */
export function gridLinePositions(settings: GridSettings, extent: number): { major: number[]; minor: number[] } {
  const major: number[] = [];
  const minor: number[] = [];
  const spacing = Math.max(1, settings.spacing);
  const sub = Math.max(1, settings.subdivisions);
  const step = spacing / sub;
  if (step < 2) return { major, minor };
  const count = Math.min(4000, Math.floor(extent / step));
  for (let i = 0; i <= count; i++) {
    const pos = i * step;
    if (pos > extent) break;
    if (i % sub === 0) major.push(pos);
    else minor.push(pos);
  }
  return { major, minor };
}
