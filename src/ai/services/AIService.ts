import { useEditorStore } from "../../state/store";
import type { AICapability, AISettings, AIJob, AIOperation, AIParams, AIResult, AIImageData, AISelection } from "../types";
import { AIError } from "../core/AIError";
import { AIProviderRegistry, type AIProvider } from "../core/AIProvider";
import { buildAIRequest, aiCacheKey, type BuildRequestOptions } from "../core/AIRequest";
import { LocalAIProvider } from "../providers/LocalAIProvider";
import { RemoteAIProvider, type RemoteAIProviderConfig } from "../providers/RemoteAIProvider";
import { MockAIProvider } from "../providers/MockAIProvider";
import { AICache } from "./AICache";
import { AIJobManager } from "./AIJobManager";
import { ImageAnalysisService } from "../image/ImageAnalysisService";
import { loadAiSettings, persistAiSettings } from "./AISettingsStore";

export const AI_PROVIDER_LABELS: Record<string, string> = {
  local: "Local AI",
  remote: "Remote AI",
  mock: "Mock AI (dev/test)",
};

export const AI_TASK_LABELS: Record<AIOperation, string> = {
  analyzeImage: "AI Analysis",
  describe: "AI Image Description",
  detectObjects: "AI Object Detection",
  detectFaces: "AI Face Detection",
  detectText: "AI Text Detection",
  classifyScene: "AI Scene Classification",
  analyzeComposition: "AI Composition Analysis",
  selectSubject: "AI Select Subject",
  selectObject: "AI Select Object",
  segment: "AI Segments",
  removeBackground: "AI Remove Background",
  removeObject: "AI Object Removal",
  inpaint: "AI Inpaint",
  generativeFill: "AI Generative Fill",
  generativeExpand: "AI Generative Expand",
  objectReplace: "AI Object Replacement",
  generateImage: "AI Generate Image",
  generateVariation: "AI Variation",
  upscale: "AI Upscale",
  denoise: "AI Denoise",
  sharpen: "AI Sharpen",
  colorize: "AI Colorize",
  restore: "AI Restoration",
  relight: "AI Relight",
  enhance: "AI Smart Enhance",
  textAssist: "AI Text Assistant",
  segmentProduct: "AI Cutout Product",
  analyzeBackground: "AI Analyze Background",
  detectSurface: "AI Detect Surface",
  estimateLighting: "AI Estimate Lighting",
  matchLighting: "AI Match Lighting",
  generateShadow: "AI Suggest Shadow",
  matchPerspective: "AI Match Perspective",
};

/** Key kept strictly in memory — never persisted to localStorage. */
let remoteApiKey: string | null = null;

export interface RunOptions extends BuildRequestOptions {
  useCache?: boolean;
}

export class AIService {
  private registry = new AIProviderRegistry();
  private cache = new AICache(96);
  private manager: AIJobManager;
  readonly analysis: ImageAnalysisService;

  constructor() {
    this.analysis = new ImageAnalysisService();

    this.registry.register(new LocalAIProvider());
    this.registry.register(new RemoteAIProvider(() => this.remoteConfig()));

    // Mock provider is only registered in development builds AND when mock is
    // explicitly enabled in settings. It is never present in production.
    if (import.meta.env.DEV) {
      this.registry.register(new MockAIProvider(() => {
        return import.meta.env.DEV && this.settings().mockEnabled;
      }));
    }

    this.manager = new AIJobManager(
      (jobs) => useEditorStore.setState({ aiJobs: jobs }),
      { maxConcurrent: 1, autoTrim: 30 }
    );
  }

  private settings(): AISettings {
    const s = useEditorStore.getState().aiSettings;
    return s && typeof s === "object" ? s : loadAiSettings();
  }

  private remoteConfig(): RemoteAIProviderConfig {
    const s = this.settings();
    return {
      endpoint: s.remoteEndpoint,
      models: [],
      defaultModel: s.defaultModel,
      apiKey: remoteApiKey,
      timeoutMs: 120_000,
    };
  }

  /** Set a remote provider API key (memory only, never persisted). */
  setRemoteApiKey(key: string | null): void {
    remoteApiKey = key && key.trim().length > 0 ? key.trim() : null;
  }

  remoteApiKeySet(): boolean {
    return remoteApiKey !== null;
  }

  providers(): AIProvider[] {
    return this.registry.all();
  }

  provider(id: string): AIProvider | undefined {
    return this.registry.get(id);
  }

  activeProviderId(): string {
    const s = this.settings();
    return this.registry.get(s.provider) ? s.provider : "remote";
  }

  activeProvider(): AIProvider {
    return this.registry.get(this.activeProviderId()) ?? this.registry.get("remote")!;
  }

  providerAvailable(id?: string): boolean {
    const pid = id ?? this.activeProviderId();
    return !!this.registry.get(pid)?.isAvailable();
  }

  providerReason(id?: string): string {
    const p = this.registry.get(id ?? this.activeProviderId());
    return p ? p.availabilityReason() : "AI provider unavailable";
  }

  /** Capabilities the active provider advertises while available. */
  availableCapabilities(): AICapability[] {
    const p = this.registry.get(this.activeProviderId());
    if (!p || !p.isAvailable()) return [];
    return p.capabilities;
  }

  supports(op: AIOperation): boolean {
    const p = this.registry.get(this.activeProviderId());
    if (!p || !p.isAvailable()) return false;
    return p.capabilities.includes(op);
  }

  jobs(): AIJob[] {
    return useEditorStore.getState().aiJobs;
  }

  cancelJob(id: string): boolean {
    return this.manager.cancel(id);
  }

  cancelAll(): void {
    this.manager.cancelAll();
  }

  /**
   * Run an AI operation through the active provider. Real work happens only
   * when a provider is configured and supports the operation; otherwise the
   * call fails with a clear, user-friendly AIError — nothing is faked.
   */
  async run(opts: RunOptions): Promise<AIResult> {
    const provider = this.registry.get(opts.provider ?? this.activeProviderId());
    if (!provider) throw new AIError("provider-unavailable", "AI provider unavailable", opts.operation);
    if (!provider.isAvailable()) throw new AIError("not-configured", provider.availabilityReason(), opts.operation);
    if (!provider.capabilities.includes(opts.operation)) {
      throw new AIError("capability-unavailable", undefined, opts.operation);
    }

    const request = buildAIRequest({
      operation: opts.operation,
      provider: provider.id,
      model: opts.model ?? (provider.defaultModel || null),
      image: opts.image ?? null,
      selection: opts.selection ?? null,
      params: opts.params ?? {},
    });

    const useCache = opts.useCache ?? this.settings().cacheEnabled;
    if (useCache) {
      const key = aiCacheKey(request);
      const hit = this.cache.get(key);
      if (hit) {
        request.cacheKey = key;
        const cached: AIResult = { ...hit, request, origin: hit.origin };
        return cached;
      }
      request.cacheKey = key;
    }

    const label = AI_TASK_LABELS[request.operation] ?? "AI Operation";
    const result = await this.manager.enqueue({
      request,
      label,
      execute: (signal, onProgress) => provider.execute(request, signal, onProgress),
    });

    if (request.cacheKey && useCache) this.cache.enqueue(request.cacheKey, result);
    useEditorStore.setState({ aiLastResult: result });
    return result;
  }

  /** Local, deterministic image analysis (real pixel statistics — not AI). */
  async analyzeLocal(image: AIImageData): Promise<AIResult> {
    const result = await this.analysis.analyzeLocal(image);
    useEditorStore.setState({ aiLastResult: result });
    return result;
  }

  clearCache(): void {
    this.cache.clear();
  }
}

export const aiService = new AIService();

export { remoteApiKey as remoteApiKeyHolder };

// Re-export types used by UI code.
export type { AIResult, AIJob, AICapability, AIParams, AIImageData, AISelection } from "../types";