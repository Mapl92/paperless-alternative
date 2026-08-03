import { logApiCall } from "@/lib/logging";

export type ReasoningEffort = "none" | "low" | "medium" | "high";

export interface OpenRouterMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

interface OpenRouterOptions {
  model?: string;
  action?: string;
  reasoningEffort?: ReasoningEffort;
  maxTokens?: number;
}

interface AIResponse {
  content: string;
}

export const LUNA_MODEL = "openai/gpt-5.6-luna";

function getConfig(options: OpenRouterOptions) {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const baseUrl =
    process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
  const defaultModel = process.env.OPENROUTER_MODEL || LUNA_MODEL;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  return {
    apiKey,
    baseUrl,
    model: options.model || defaultModel,
    action: options.action || "unknown",
    reasoningEffort: options.reasoningEffort || "none",
    maxTokens: options.maxTokens || 4096,
  };
}

function buildRequestBody(
  messages: OpenRouterMessage[],
  config: ReturnType<typeof getConfig>,
  stream: boolean
) {
  return {
    model: config.model,
    messages,
    max_tokens: config.maxTokens,
    reasoning: {
      effort: config.reasoningEffort,
      // The model still reasons, but the internal trace is not part of the response.
      exclude: true,
    },
    stream,
    ...(stream ? { stream_options: { include_usage: true } } : {}),
  };
}

function requestHeaders(apiKey: string) {
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
    "HTTP-Referer": "https://documind.local",
    "X-Title": "DocuMind",
  };
}

export async function callOpenRouter(
  messages: OpenRouterMessage[],
  options: OpenRouterOptions = {}
): Promise<AIResponse> {
  const config = getConfig(options);
  const start = Date.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60_000);

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: requestHeaders(config.apiKey),
      body: JSON.stringify(buildRequestBody(messages, config, false)),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  const durationMs = Date.now() - start;

  if (!response.ok) {
    const error = await response.text();
    logApiCall({
      type: "openrouter",
      action: config.action,
      model: config.model,
      durationMs,
      status: "error",
      error: `${response.status} - ${error.slice(0, 500)}`,
      metadata: { reasoningEffort: config.reasoningEffort },
    });
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  logApiCall({
    type: "openrouter",
    action: config.action,
    model: config.model,
    durationMs,
    inputTokens: data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens,
    status: "success",
    metadata: {
      reasoningEffort: config.reasoningEffort,
      reasoningTokens: data.usage?.completion_tokens_details?.reasoning_tokens,
    },
  });

  return {
    content: data.choices[0]?.message?.content || "",
  };
}

/** Stream text chunks from OpenRouter's OpenAI-compatible SSE endpoint. */
export async function* streamOpenRouter(
  messages: OpenRouterMessage[],
  options: OpenRouterOptions = {}
): AsyncGenerator<string> {
  const config = getConfig(options);
  const start = Date.now();
  const controller = new AbortController();
  // High reasoning can increase time-to-first-token, so allow a longer connect window.
  const connectTimeout = setTimeout(() => controller.abort(), 120_000);

  let response: Response;
  try {
    response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: requestHeaders(config.apiKey),
      body: JSON.stringify(buildRequestBody(messages, config, true)),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(connectTimeout);
  }

  if (!response.ok) {
    const error = await response.text();
    logApiCall({
      type: "openrouter",
      action: config.action,
      model: config.model,
      durationMs: Date.now() - start,
      status: "error",
      error: `${response.status} - ${error.slice(0, 500)}`,
      metadata: { reasoningEffort: config.reasoningEffort },
    });
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("OpenRouter response has no body");

  const decoder = new TextDecoder();
  let buffer = "";
  let usage: {
    prompt_tokens?: number;
    completion_tokens?: number;
    completion_tokens_details?: { reasoning_tokens?: number };
  } | undefined;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const payload = line.slice(6).trim();
        if (!payload || payload === "[DONE]") continue;

        const data = JSON.parse(payload);
        if (data.usage) usage = data.usage;
        const content = data.choices?.[0]?.delta?.content;
        if (typeof content === "string" && content) yield content;
      }
    }

    logApiCall({
      type: "openrouter",
      action: config.action,
      model: config.model,
      durationMs: Date.now() - start,
      inputTokens: usage?.prompt_tokens,
      outputTokens: usage?.completion_tokens,
      status: "success",
      metadata: {
        reasoningEffort: config.reasoningEffort,
        reasoningTokens: usage?.completion_tokens_details?.reasoning_tokens,
      },
    });
  } catch (error) {
    logApiCall({
      type: "openrouter",
      action: config.action,
      model: config.model,
      durationMs: Date.now() - start,
      status: "error",
      error: error instanceof Error ? error.message.slice(0, 500) : String(error).slice(0, 500),
      metadata: { reasoningEffort: config.reasoningEffort },
    });
    throw error;
  }
}
