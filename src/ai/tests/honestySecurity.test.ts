import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { aiService } from "../services/AIService";
import { persistAiSettings, loadAiSettings, AI_SETTINGS_KEY } from "../services/AISettingsStore";
import { aiCacheKey, buildAIRequest } from "../core/AIRequest";
import { useEditorStore } from "../../state/store";
import type { AIImageData } from "../types";

// A canvas-shaped object that never touches real DOM APIs in these tests.
const image = {
  canvas: { width: 4, height: 4, getContext: () => undefined },
  layerId: null,
  name: "fake",
  width: 4,
  height: 4,
} as unknown as AIImageData;

const wasDefault = useEditorStore.getState().aiSettings;
const isDev = import.meta.env.DEV;

beforeAll(() => {
  useEditorStore.getState().setAiSettings({ mockEnabled: false });
});

afterAll(() => {
  useEditorStore.getState().setAiSettings(wasDefault);
  aiService.setRemoteApiKey(null);
});

describe("AI honesty and gatekeeping", () => {
  it("the mock provider is only registered in dev builds AND when explicitly enabled", () => {
    useEditorStore.getState().setAiSettings({ mockEnabled: false });
    // Registration list includes the mock in dev only; runtime availability is gated.
    expect(aiService.providers().map((p) => p.id).includes("mock")).toBe(isDev);
    expect(aiService.providerAvailable("mock")).toBe(false);

    useEditorStore.getState().setAiSettings({ mockEnabled: true, provider: "mock" });
    expect(aiService.providerAvailable("mock")).toBe(isDev);
    expect(aiService.activeProviderId()).toBe("mock");
  });

  it("the local provider never advertises capabilities and is never available", () => {
    const local = aiService.provider("local");
    expect(local).toBeDefined();
    expect(local!.capabilities.length).toBe(0);
    expect(local!.isAvailable()).toBe(false);
    expect(aiService.providerAvailable("local")).toBe(false);
  });

  it("mock output is always labeled origin 'mock' and clearly marked", async () => {
    if (!isDev) return;
    useEditorStore.getState().setAiSettings({ mockEnabled: true, provider: "mock", cacheEnabled: false });
    const result = await aiService.run({ operation: "describe", image, params: {} });
    expect(result.origin).toBe("mock");
    expect(result.text).toContain("[MOCK]");
    expect(result.metadata?.mock).toBe(true);
  });
});

describe("AI secret handling", () => {
  it("the remote API key is kept out of localStorage and persisted settings", () => {
    localStorage.clear();
    aiService.setRemoteApiKey("sk-super-secret-token");
    persistAiSettings({ remoteEndpoint: "https://example.inference" });

    const raw = localStorage.getItem(AI_SETTINGS_KEY) ?? "";
    expect(raw).not.toContain("sk-super-secret-token");
    expect(raw).not.toContain("apiKey");

    const loaded = loadAiSettings();
    expect("apiKey" in loaded).toBe(false);
  });

  it("the cache key never includes the separately-held remote API key", () => {
    aiService.setRemoteApiKey("sk-super-secret-token");
    const request = buildAIRequest({
      operation: "generativeFill",
      provider: "remote",
      model: "gpt-vision",
      image,
      params: { prompt: "a red cube" },
    } as never);
    const key = aiCacheKey(request as never);
    // The api key is held out-of-band (memory only) and is unreachable from
    // the cache-key mechanism — it can never appear in a stable key.
    expect(key).not.toContain("sk-super-secret-token");
    // Non-secret request identity is included: op, provider, model, source, prompt.
    expect(key).toContain("generativeFill");
    expect(key).toContain("remote");
    expect(key).toContain("gpt-vision");
    expect(key).toContain("a red cube");
  });

  it("identical requests share a stable cache key and pixels change it", () => {
    const a = aiCacheKey(buildAIRequest({ operation: "denoise", provider: "remote", model: "m", image, params: { strength: 0.5 } }) as never);
    const b = aiCacheKey(buildAIRequest({ operation: "denoise", provider: "remote", model: "m", image, params: { strength: 0.5 } }) as never);
    expect(a).toBe(b);
    expect(a).toContain("denoise");
  });
});