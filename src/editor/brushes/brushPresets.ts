import type { BrushOptions } from "../../state/store";

export interface BrushPreset {
  name: string;
  size: number;
  hardness: number;
  opacity: number;
  flow: number;
  spacing: number;
  dynamics?: number;
  scatter?: number;
  custom?: boolean;
}

const STORAGE_KEY = "vs-brush-presets-v1";

export const BUILTIN_PRESETS: BrushPreset[] = [
  { name: "Soft Round", size: 60, hardness: 0.25, opacity: 1, flow: 0.8, spacing: 0.15 },
  { name: "Hard Round", size: 24, hardness: 1, opacity: 1, flow: 1, spacing: 0.1 },
  { name: "Pencil", size: 4, hardness: 1, opacity: 1, flow: 1, spacing: 0.12 },
  { name: "Marker", size: 20, hardness: 0.55, opacity: 0.8, flow: 0.5, spacing: 0.2 },
  { name: "Airbrush", size: 120, hardness: 0, opacity: 1, flow: 0.15, spacing: 0.25 },
  { name: "Chalk", size: 32, hardness: 0, opacity: 0.9, flow: 0.6, spacing: 0.35 },
];

function isValidPreset(p: unknown): p is BrushPreset {
  if (!p || typeof p !== "object") return false;
  const o = p as BrushPreset;
  return (
    typeof o.name === "string" &&
    o.name.length > 0 &&
    typeof o.size === "number" &&
    typeof o.hardness === "number" &&
    typeof o.opacity === "number" &&
    typeof o.flow === "number" &&
    typeof o.spacing === "number"
  );
}

function loadCustom(): BrushPreset[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidPreset).map((p) => ({ ...p, custom: true }));
  } catch {
    return [];
  }
}

function persistCustom(presets: BrushPreset[]): void {
  try {
    const custom = presets.filter((p) => p.custom).map(({ custom: _dropped, ...rest }) => rest);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(custom));
  } catch {
    /* storage unavailable — non-fatal */
  }
}

export function loadPresets(): BrushPreset[] {
  const custom = loadCustom();
  const taken = new Set(BUILTIN_PRESETS.map((b) => b.name.toLowerCase()));
  return [
    ...BUILTIN_PRESETS,
    ...custom.filter((c) => !taken.has(c.name.toLowerCase())),
  ];
}

export function isPresetNameTaken(name: string): boolean {
  const n = name.trim().toLowerCase();
  if (!n) return true;
  return loadPresets().some((p) => p.name.toLowerCase() === n);
}

export function saveCustomPreset(preset: BrushPreset): boolean {
  const name = preset.name.trim();
  if (!name || isPresetNameTaken(name)) return false;
  const custom = loadCustom();
  custom.push({ ...preset, name, custom: true });
  persistCustom(custom);
  return true;
}

export function removeCustomPreset(name: string): boolean {
  const custom = loadCustom();
  const next = custom.filter((p) => p.name !== name);
  if (next.length === custom.length) return false;
  persistCustom(next);
  return true;
}

export function brushOptionsToPreset(name: string, options: BrushOptions): BrushPreset {
  return {
    name,
    size: options.size,
    hardness: options.hardness,
    opacity: options.opacity,
    flow: options.flow,
    spacing: options.spacing,
    dynamics: options.dynamics,
    scatter: options.scatter,
  };
}

export function presetToBrushOptions(preset: BrushPreset): Partial<BrushOptions> {
  return {
    size: preset.size,
    hardness: preset.hardness,
    opacity: preset.opacity,
    flow: preset.flow,
    spacing: preset.spacing,
    dynamics: preset.dynamics ?? 0,
    scatter: preset.scatter ?? 0,
  };
}