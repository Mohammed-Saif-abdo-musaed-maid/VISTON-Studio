import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { aiService } from "../services/AIService";
import { AIError } from "../core/AIError";
import { AIJobManager } from "../services/AIJobManager";
import type { AIRequest, AIResult, AIOperation, AIImageData } from "../types";
import { useEditorStore } from "../../state/store";

// A fake canvas that is never touched by the DOM APIs in these tests
// (availability gating fails before any pixel access happens).
const image = {
  canvas: { width: 4, height: 4 },
  layerId: null,
  name: "fake",
  width: 4,
  height: 4,
} as unknown as AIImageData;

const wasDefault = useEditorStore.getState().aiSettings;

beforeAll(() => {
  // Default fixture: reset settings.
  useEditorStore.getState().setAiSettings({
    provider: "remote",
    remoteEndpoint: "",
    mockEnabled: false,
  });
});

afterAll(() => {
  useEditorStore.getState().setAiSettings(wasDefault);
});

describe("AIService availability gating", () => {
  it("is unavailable with no remote endpoint — never fakes output", async () => {
    const err = await aiService.run({ operation: "textAssist", image: null, params: { mode: "rewrite", prompt: "hello" } }).catch((e) => e);
    expect(err).toBeInstanceOf(AIError);
    expect((err as AIError).code).toBe("not-configured");
  });

  it("unsupported operations on the local provider are rejected", async () => {
    useEditorStore.getState().setAiSettings({ provider: "local", mockEnabled: false });
    const err = await aiService.run({ operation: "upscale", image }).catch((e) => e);
    expect(err).toBeInstanceOf(AIError);
    expect((err as AIError).code).toBe("not-configured");
    useEditorStore.getState().setAiSettings({ provider: "remote" });
  });

  it("reports the active provider status", () => {
    useEditorStore.getState().setAiSettings({ provider: "remote", remoteEndpoint: "" });
    expect(aiService.providerAvailable()).toBe(false);
    expect(aiService.providerReason()).toContain("endpoint");
  });
});

describe("AIJobManager", () => {
  it("runs a task and settles with its result", async () => {
    const jobs: any[] = [];
    const m = new AIJobManager((list) => { jobs.push(list); });
    let completed = false;
    const request: AIRequest = {
      id: "job-1",
      operation: "describe",
      provider: "remote",
      model: null,
      image: null,
      selection: null,
      params: {},
      createdAt: Date.now(),
      cacheKey: null,
    };
    const result: AIResult = {
      request,
      canvas: null,
      text: "ok",
      structured: null,
      selection: null,
      metadata: {},
      origin: "provider",
      createdAt: Date.now(),
      provider: "remote",
      model: null,
    };
    const out = await m.enqueue({
      request,
      label: "Describe",
      execute: async (_s: AbortSignal, onProgress: (p: number) => void) => {
        onProgress(50);
        completed = true;
        return result;
      },
    });
    expect(completed).toBe(true);
    expect(out.text).toBe("ok");
    expect(jobs.length).toBeGreaterThan(0);
  });

  it("cancels a queued job", async () => {
    const m = new AIJobManager(() => undefined);
    const makeReq = (id: string, op: AIOperation): AIRequest => ({
      id,
      operation: op,
      provider: "remote",
      model: null,
      image: null,
      selection: null,
      params: {},
      createdAt: Date.now(),
      cacheKey: null,
    });
    const pending = m.enqueue({
      request: makeReq("c1", "describe"),
      label: "blocked",
      execute: (signal) =>
        new Promise((_r, reject) => {
          signal.addEventListener("abort", () => reject(new AIError("cancelled")), { once: true });
        }),
    });
    expect(m.cancel("c1")).toBe(true);
    await expect(pending).rejects.toMatchObject({ code: "cancelled" });
    expect(m.countActive()).toBe(0);
  });
});