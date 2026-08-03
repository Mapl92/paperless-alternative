// WARNING: storeEmbedding() contains a raw SQL query against the "Document" table (pgvector).
// Prisma does not type-check this query. If the Document schema changes
// (column renames, type changes), this query MUST be updated manually.

import { pool } from "@/lib/db/prisma";
import { logApiCall } from "@/lib/logging";

export const EMBEDDING_MODEL = "gemini-embedding-2";
const GEMINI_API_URL =
  `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent`;
const EMBEDDING_DIMENSIONS = 768;
const MAX_TEXT_CHARS = 24_000;

interface GenerateEmbeddingOptions {
  throwOnRateLimit?: boolean;
}

export class EmbeddingRateLimitError extends Error {
  constructor(
    message: string,
    public readonly retryAfterMs: number | null
  ) {
    super(message);
    this.name = "EmbeddingRateLimitError";
  }
}

function parseRetryAfterMs(response: Response, errorBody: unknown): number | null {
  const header = response.headers.get("retry-after");
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);

    const date = Date.parse(header);
    if (!Number.isNaN(date)) return Math.max(0, date - Date.now());
  }

  const serialized = JSON.stringify(errorBody);
  const match = serialized.match(/(?:retryDelay|retry in)[^0-9]*([0-9.]+)s/i);
  if (!match) return null;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) ? Math.max(0, seconds * 1000) : null;
}

async function requestEmbedding(
  text: string,
  action: "embedding" | "query-embedding",
  options: GenerateEmbeddingOptions
): Promise<number[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY not set, skipping embedding generation");
    return null;
  }

  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let response: Response;
    try {
      response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text: text.slice(0, MAX_TEXT_CHARS) }] },
          outputDimensionality: EMBEDDING_DIMENSIONS,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const durationMs = Date.now() - start;

    if (!response.ok) {
      const rawError = await response.text();
      let parsedError: unknown = rawError;
      try {
        parsedError = JSON.parse(rawError);
      } catch {
        // Keep the raw response for logging.
      }

      logApiCall({
        type: "gemini-embedding",
        action,
        model: EMBEDDING_MODEL,
        durationMs,
        status: "error",
        error: `${response.status} - ${rawError.slice(0, 500)}`,
      });

      if (response.status === 429 && options.throwOnRateLimit) {
        throw new EmbeddingRateLimitError(
          "Gemini-Embedding-Limit erreicht",
          parseRetryAfterMs(response, parsedError)
        );
      }

      console.error("Gemini embedding API error:", response.status, rawError);
      return null;
    }

    const data = await response.json();
    logApiCall({
      type: "gemini-embedding",
      action,
      model: EMBEDDING_MODEL,
      durationMs,
      status: "success",
    });
    return data.embedding?.values ?? null;
  } catch (error) {
    if (error instanceof EmbeddingRateLimitError) throw error;

    console.error("Embedding generation failed:", error);
    logApiCall({
      type: "gemini-embedding",
      action,
      model: EMBEDDING_MODEL,
      durationMs: Date.now() - start,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/** Generate a retrieval-document embedding using Gemini Embedding 2. */
export function generateEmbedding(
  text: string,
  options: GenerateEmbeddingOptions = {}
): Promise<number[] | null> {
  // Embedding 2 uses prompt prefixes instead of the legacy taskType field.
  return requestEmbedding(`title: none | text: ${text}`, "embedding", options);
}

/** Generate an asymmetric search-query embedding in the same vector space. */
export function generateQueryEmbedding(text: string): Promise<number[] | null> {
  return requestEmbedding(
    `task: search result | query: ${text}`,
    "query-embedding",
    {}
  );
}

export function toVectorString(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/** Store an embedding together with the model that created its vector space. */
export async function storeEmbedding(
  documentId: string,
  embedding: number[]
): Promise<void> {
  const vectorStr = toVectorString(embedding);
  await pool.query(
    `UPDATE "Document"
     SET "embedding" = $1::vector, "embeddingModel" = $2
     WHERE "id" = $3`,
    [vectorStr, EMBEDDING_MODEL, documentId]
  );
}
