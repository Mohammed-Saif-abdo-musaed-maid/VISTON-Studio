import type { AIRequest, AIOperation, AICapability, AIResult } from "../types";

/**
 * Abstraction over any AI backend. The editor never talks to a specific
 * provider directly; it only sees this interface (via AIService).
 *
 * A provider declares the capabilities it truly implements. A capability
 * that has no real backend must NOT be listed here or must throw
 * capability-unavailable — never return fabricated results.
 */
export interface AIProvider {
  id: string;
  name: string;
  kind: "local" | "remote" | "mock";

  /** Operations this provider can genuinely perform. */
  capabilities: AICapability[];

  modelIds: string[];
  defaultModel: string;

  /** Runtime availability (config present, network reachable, etc.). */
  isAvailable(): boolean;

  /**
   * Execute one AI request. Must resolve only when real work is complete,
   * reject with AIError otherwise. `origin` of the result must be
   * "provider" (or "mock" for the dedicated mock provider).
   */
  execute(
    request: AIRequest,
    signal: AbortSignal,
    onProgress?: (percent: number) => void
  ): Promise<AIResult>;

  /** Human-readable availability reason when isAvailable() is false. */
  availabilityReason(): string;
}

export type ProviderRegistry = Map<string, AIProvider>;

export class AIProviderRegistry {
  private providers = new Map<string, AIProvider>();

  register(provider: AIProvider): void {
    if (this.providers.has(provider.id)) {
      throw new Error(`AI provider already registered: ${provider.id}`);
    }
    this.providers.set(provider.id, provider);
  }

  get(id: string): AIProvider | undefined {
    return this.providers.get(id);
  }

  all(): AIProvider[] {
    return Array.from(this.providers.values());
  }

  ids(): string[] {
    return Array.from(this.providers.keys());
  }

  supports(providerId: string, op: AIOperation): boolean {
    const p = this.providers.get(providerId);
    return !!p && p.capabilities.includes(op);
  }
}