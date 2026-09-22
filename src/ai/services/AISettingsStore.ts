import type { AISettings } from "../types";

export const AI_SETTINGS_KEY = "vs-ai-settings-v1";

export const DEFAULT_AI_SETTINGS: AISettings = {
  provider: "remote",
  defaultModel: "default",
  remoteEndpoint: "",
  cacheEnabled: true,
  mockEnabled: false,
  maxJobs: 8,
};

export function loadAiSettings(): AISettings {
  try {
    const raw = localStorage.getItem(AI_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_AI_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<AISettings>;
    return {
      provider: typeof parsed.provider === "string" ? parsed.provider : DEFAULT_AI_SETTINGS.provider,
      defaultModel: typeof parsed.defaultModel === "string" ? parsed.defaultModel : DEFAULT_AI_SETTINGS.defaultModel,
      remoteEndpoint: typeof parsed.remoteEndpoint === "string" ? parsed.remoteEndpoint : DEFAULT_AI_SETTINGS.remoteEndpoint,
      cacheEnabled: typeof parsed.cacheEnabled === "boolean" ? parsed.cacheEnabled : DEFAULT_AI_SETTINGS.cacheEnabled,
      mockEnabled: typeof parsed.mockEnabled === "boolean" ? parsed.mockEnabled : DEFAULT_AI_SETTINGS.mockEnabled,
      maxJobs: typeof parsed.maxJobs === "number" && parsed.maxJobs > 0 && Number.isFinite(parsed.maxJobs)
        ? Math.floor(parsed.maxJobs)
        : DEFAULT_AI_SETTINGS.maxJobs,
    };
  } catch {
    return { ...DEFAULT_AI_SETTINGS };
  }
}

export function persistAiSettings(patch: Partial<AISettings>): AISettings {
  const merged = { ...loadAiSettings(), ...patch };
  try {
    localStorage.setItem(AI_SETTINGS_KEY, JSON.stringify(merged));
  } catch {
    /* storage unavailable — non-fatal */
  }
  return merged;
}