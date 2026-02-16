import { prisma } from "@/lib/db/prisma";

interface LogApiCallParams {
  type: "openrouter" | "gemini-chat" | "gemini-embedding" | "gemini-title" | "vector-search";
  action: string;
  model?: string;
  durationMs: number;
  inputTokens?: number;
  outputTokens?: number;
  status: "success" | "error";
  error?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Fire-and-forget API call logger. Silently catches its own errors.
 */
export function logApiCall(params: LogApiCallParams): void {
  prisma.apiLog
    .create({
      data: {
        type: params.type,
        action: params.action,
        model: params.model,
        durationMs: params.durationMs,
        inputTokens: params.inputTokens,
        outputTokens: params.outputTokens,
        status: params.status,
        error: params.error,
        metadata: params.metadata ? JSON.parse(JSON.stringify(params.metadata)) : undefined,
      },
    })
    .catch(() => {
      // silently ignore logging errors
    });
}
