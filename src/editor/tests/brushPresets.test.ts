import { describe, it, expect, beforeEach } from "vitest";
import {
  BUILTIN_PRESETS,
  loadPresets,
  isPresetNameTaken,
  saveCustomPreset,
  removeCustomPreset,
  brushOptionsToPreset,
  presetToBrushOptions,
} from "../brushes/brushPresets";

beforeEach(() => {
  localStorage.clear();
});

describe("brush presets", () => {
  it("built-in presets cover the requested engine features (size/hardness/opacity/flow/spacing)", () => {
    const names = BUILTIN_PRESETS.map((p) => p.name);
    expect(names).toEqual(["Soft Round", "Hard Round", "Pencil", "Marker", "Airbrush", "Chalk"]);
    for (const p of BUILTIN_PRESETS) {
      expect(typeof p.size).toBe("number");
      expect(typeof p.hardness).toBe("number");
      expect(typeof p.opacity).toBe("number");
      expect(typeof p.flow).toBe("number");
      expect(typeof p.spacing).toBe("number");
    }
  });

  it("loadPresets returns built-ins plus persisted customs", () => {
    expect(loadPresets().length).toBe(BUILTIN_PRESETS.length);
    const p = brushOptionsToPreset("My Airbrush", { size: 90, hardness: 0.3, opacity: 0.7, flow: 0.4, spacing: 0.2, dynamics: 0, scatter: 0, color: "#000000" });
    expect(saveCustomPreset(p)).toBe(true);
    const all = loadPresets();
    expect(all.length).toBe(BUILTIN_PRESETS.length + 1);
    expect(all.find((x) => x.name === "My Airbrush")?.custom).toBe(true);
  });

  it("duplicate / built-in / empty names are rejected", () => {
    expect(isPresetNameTaken("Hard Round")).toBe(true);
    expect(isPresetNameTaken("  Hard Round  ")).toBe(true);
    expect(isPresetNameTaken("   ")).toBe(true);
    expect(saveCustomPreset(brushOptionsToPreset("Hard Round", { size: 1, hardness: 1, opacity: 1, flow: 1, spacing: 1, dynamics: 0, scatter: 0, color: "#000000" }))).toBe(false);
  });

  it("removeCustomPreset deletes only custom presets", () => {
    expect(removeCustomPreset("Airbrush")).toBe(false);
    expect(saveCustomPreset(brushOptionsToPreset("Temp", { size: 1, hardness: 1, opacity: 1, flow: 1, spacing: 1, dynamics: 0, scatter: 0, color: "#000000" }))).toBe(true);
    expect(loadPresets().some((x) => x.name === "Temp")).toBe(true);
    expect(removeCustomPreset("Temp")).toBe(true);
    expect(loadPresets().some((x) => x.name === "Temp")).toBe(false);
  });

  it("corrupt stored JSON is ignored instead of crashing", () => {
    localStorage.setItem("vs-brush-presets-v1", "{not json");
    expect(loadPresets().length).toBe(BUILTIN_PRESETS.length);
  });

  it("presetToBrushOptions maps every brush parameter back", () => {
    const preset = brushOptionsToPreset("P", { size: 42, hardness: 0.9, opacity: 0.5, flow: 0.3, spacing: 0.33, dynamics: 0.4, scatter: 0.2, color: "#112233" });
    const back = presetToBrushOptions(preset);
    expect(back.size).toBe(42);
    expect(back.hardness).toBe(0.9);
    expect(back.opacity).toBe(0.5);
    expect(back.flow).toBe(0.3);
    expect(back.spacing).toBe(0.33);
    expect(back.dynamics).toBe(0.4);
    expect(back.scatter).toBe(0.2);
  });
});