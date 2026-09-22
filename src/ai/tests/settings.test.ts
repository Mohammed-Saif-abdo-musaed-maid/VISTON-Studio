import { describe, it, expect, beforeEach } from "vitest";
import { loadAiSettings, persistAiSettings, DEFAULT_AI_SETTINGS } from "../services/AISettingsStore";

describe("AISettingsStore", () => {
  beforeEach(() => localStorage.clear());

  it("returns defaults when empty", () => {
    expect(loadAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
  });

  it("persists and reloads merged settings", () => {
    persistAiSettings({ remoteEndpoint: "https://example.inference" });
    const loaded = loadAiSettings();
    expect(loaded.remoteEndpoint).toBe("https://example.inference");
    expect(loaded.provider).toBe(DEFAULT_AI_SETTINGS.provider);
  });

  it("tolerates corrupt storage", () => {
    localStorage.setItem("vs-ai-settings-v1", "{{{not json");
    expect(loadAiSettings()).toEqual(DEFAULT_AI_SETTINGS);
  });
});