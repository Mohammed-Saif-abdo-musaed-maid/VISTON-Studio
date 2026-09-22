import type { AIOperation } from "../types";

export type AIErrorCode =
  | "provider-unavailable"
  | "capability-unavailable"
  | "not-configured"
  | "auth"
  | "network"
  | "timeout"
  | "rate-limit"
  | "invalid-image"
  | "invalid-prompt"
  | "invalid-request"
  | "unsupported-format"
  | "cancelled"
  | "out-of-memory"
  | "server"
  | "unknown";

const USER_MESSAGES: Record<AIErrorCode, string> = {
  "provider-unavailable": "AI provider unavailable",
  "capability-unavailable": "This AI capability is not supported by the connected provider",
  "not-configured": "AI provider is not configured",
  auth: "AI provider authentication failed",
  network: "Network error while contacting the AI provider",
  timeout: "The AI provider request timed out",
  "rate-limit": "AI provider rate limit reached",
  "invalid-image": "The image is not valid for this AI operation",
  "invalid-prompt": "The AI prompt is invalid",
  "invalid-request": "The AI request is invalid",
  "unsupported-format": "The image format is not supported",
  cancelled: "Operation cancelled",
  "out-of-memory": "Not enough memory for this AI operation",
  server: "The AI provider returned a server error",
  unknown: "An unknown AI error occurred",
};

export class AIError extends Error {
  code: AIErrorCode;
  operation: AIOperation | null;

  constructor(code: AIErrorCode, message?: string, operation?: AIOperation) {
    super(message ?? USER_MESSAGES[code]);
    this.name = "AIError";
    this.code = code;
    this.operation = operation ?? null;
  }

  static userMessage(err: unknown): string {
    if (err instanceof AIError) return err.message;
    if (err instanceof Error) return `AI operation failed: ${err.message}`;
    return "AI operation failed";
  }

  static isCancellation(err: unknown): boolean {
    return err instanceof AIError && err.code === "cancelled";
  }

  static userSafe(err: unknown): string {
    if (err instanceof AIError) return err.message;
    return "AI operation failed";
  }
}