import { logApiCall } from "@/lib/logging";

interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>;
}

interface AIResponse {
  content: string;
}

export async function callOpenRouter(
  messages: ChatMessage[],
  model?: string,
  action: string = "unknown"
): Promise<AIResponse> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  const baseUrl =
    process.env.OPENROUTER_BASE_URL || "https://openrouter.ai/api/v1";
  const defaultModel = process.env.OPENROUTER_MODEL || "openai/gpt-4.1-mini";
  const usedModel = model || defaultModel;

  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured");
  }

  const start = Date.now();

  const response = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "HTTP-Referer": "https://documind.local",
      "X-Title": "DocuMind",
    },
    body: JSON.stringify({
      model: usedModel,
      messages,
      temperature: 0.1,
      max_tokens: 4096,
    }),
  });

  const durationMs = Date.now() - start;

  if (!response.ok) {
    const error = await response.text();
    logApiCall({
      type: "openrouter",
      action,
      model: usedModel,
      durationMs,
      status: "error",
      error: `${response.status} - ${error.slice(0, 500)}`,
    });
    throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
  }

  const data = await response.json();

  logApiCall({
    type: "openrouter",
    action,
    model: usedModel,
    durationMs,
    inputTokens: data.usage?.prompt_tokens,
    outputTokens: data.usage?.completion_tokens,
    status: "success",
  });

  return {
    content: data.choices[0]?.message?.content || "",
  };
}
