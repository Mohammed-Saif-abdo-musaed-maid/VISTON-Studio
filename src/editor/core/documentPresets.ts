/**
 * Document creation presets & unit conversions for the New Document dialog.
 *
 * Physical sizing model:
 *  - The dialog works with a canonical physical size in the current unit plus a
 *    DPI.  Raster (pixel) dimensions are always derived: px = physical * dpi.
 *  - Unit changes convert the displayed value without changing the document.
 *  - Unit "px" is the identity mapping (the value IS the pixel size); it still
 *    converts to other units through the current DPI for display.
 *  - `orient()` swaps width/height for landscape.
 */

export type DocUnit = "px" | "mm" | "cm" | "in";
export type DocOrientation = "portrait" | "landscape";

export const DPI_PRESETS = [72, 96, 150, 300, 600] as const;

/** Base (portrait) physical size of a preset. */
export interface DocPreset {
  key: string;
  label: string;
  group: "isoA" | "isoB" | "common" | "custom";
  unit: DocUnit;
  baseW: number;
  baseH: number;
  dpiDefault: number;
}

export const PRESET_GROUPS: Array<{ key: "custom" | "isoA" | "isoB" | "common"; label: string }> = [
  { key: "custom", label: "Recent / Custom" },
  { key: "isoA", label: "ISO A" },
  { key: "isoB", label: "ISO B" },
  { key: "common", label: "Common sizes" },
];

export const DOC_PRESETS: DocPreset[] = [
  { key: "custom", label: "Custom", group: "custom", unit: "px", baseW: 1280, baseH: 800, dpiDefault: 96 },

  { key: "a0", label: "A0", group: "isoA", unit: "mm", baseW: 841, baseH: 1189, dpiDefault: 300 },
  { key: "a1", label: "A1", group: "isoA", unit: "mm", baseW: 594, baseH: 841, dpiDefault: 300 },
  { key: "a2", label: "A2", group: "isoA", unit: "mm", baseW: 420, baseH: 594, dpiDefault: 300 },
  { key: "a3", label: "A3", group: "isoA", unit: "mm", baseW: 297, baseH: 420, dpiDefault: 300 },
  { key: "a4", label: "A4", group: "isoA", unit: "mm", baseW: 210, baseH: 297, dpiDefault: 300 },
  { key: "a5", label: "A5", group: "isoA", unit: "mm", baseW: 148, baseH: 210, dpiDefault: 300 },
  { key: "a6", label: "A6", group: "isoA", unit: "mm", baseW: 105, baseH: 148, dpiDefault: 300 },

  { key: "b4", label: "B4", group: "isoB", unit: "mm", baseW: 250, baseH: 353, dpiDefault: 300 },
  { key: "b5", label: "B5", group: "isoB", unit: "mm", baseW: 176, baseH: 250, dpiDefault: 300 },

  { key: "letter", label: "Letter", group: "common", unit: "in", baseW: 8.5, baseH: 11, dpiDefault: 300 },
  { key: "legal", label: "Legal", group: "common", unit: "in", baseW: 8.5, baseH: 14, dpiDefault: 300 },
  { key: "tabloid", label: "Tabloid", group: "common", unit: "in", baseW: 11, baseH: 17, dpiDefault: 300 },
  { key: "square", label: "Square", group: "common", unit: "px", baseW: 1000, baseH: 1000, dpiDefault: 96 },
  { key: "hd1920x1080", label: "1920x1080", group: "common", unit: "px", baseW: 1920, baseH: 1080, dpiDefault: 96 },
  { key: "hd1080x1920", label: "1080x1920", group: "common", unit: "px", baseW: 1080, baseH: 1920, dpiDefault: 96 },
  { key: "sq1080x1080", label: "1080x1080", group: "common", unit: "px", baseW: 1080, baseH: 1080, dpiDefault: 96 },
];

/** Physical units per inch. "px" is 1px = 1/96 in only when crossing unit types. */
const UNIT_PER_INCH: Record<DocUnit, number> = { px: 1, in: 1, cm: 2.54, mm: 25.4 };

/** Convert a value given in `unit` to its pixel dimension at `dpi`. */
export function physicalToPx(value: number, unit: DocUnit, dpi: number): number {
  if (unit === "px") return value;
  const inches = value / UNIT_PER_INCH[unit];
  return inches * dpi;
}

/** Convert a pixel dimension to a value in `unit` at `dpi`. */
export function pxToPhysical(px: number, unit: DocUnit, dpi: number): number {
  if (unit === "px") return px;
  const inches = px / dpi;
  return inches * UNIT_PER_INCH[unit];
}

/** Convert a value from one unit to another at `dpi` (same physical size). */
export function convertUnit(value: number, from: DocUnit, to: DocUnit, dpi: number): number {
  if (from === to) return value;
  const px = physicalToPx(value, from, dpi);
  return pxToPhysical(px, to, dpi);
}

export function roundPx(value: number): number {
  return Math.max(1, Math.round(value));
}

export function formatPhysical(value: number, unit: DocUnit, maxDecimals = 2): string {
  if (unit === "px") return String(Math.round(value));
  const trimmed = value.toFixed(maxDecimals).replace(/\.?0+$/, "");
  return trimmed.length > 0 ? trimmed : "0";
}

export function unitLabel(unit: DocUnit): string {
  return unit === "px" ? "px" : unit;
}

/** Swap the two dims (orientation toggle). */
export function orient(
  w: number,
  h: number,
  o: DocOrientation
): { w: number; h: number } {
  return o === "landscape" ? { w: h, h: w } : { w, h };
}

export function orientationLabel(o: DocOrientation): string {
  return o === "landscape" ? "Landscape" : "Portrait";
}

export function getPreset(key: string): DocPreset {
  return DOC_PRESETS.find((p) => p.key === key) ?? DOC_PRESETS.find((p) => p.key === "a4")!;
}