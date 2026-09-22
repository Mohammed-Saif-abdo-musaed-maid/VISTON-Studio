import type { AIProvider } from "../core/AIProvider";
import type { AIRequest, AIResult, AICapability } from "../types";

/**
 * Local (on-device) inference provider.
 *
 * No local inference engine is integrated yet, so the provider is present in
 * the registry but reports no capabilities and is never available. This keeps
 * the architecure honest: the editor can be pointed at a real local backend
 * later by implementing execute() below — nothing else changes.
 */
export class LocalAIProvider implements AIProvider {
  id = "local";
  name = "Local AI";
  kind = "local" as const;
  capabilities: AICapability[] = [];
  modelIds: string[] = [];
  defaultModel = "";

  isAvailable(): boolean {
    return false;
  }

  availabilityReason(): string {
    return "No local inference engine is integrated yet (AI provider unavailable).";
  }

  async execute(_request: AIRequest, _signal: AbortSignal): Promise<AIResult> {
    throw new Error("LocalAIProvider has no implemented inference engine.");
  }
}