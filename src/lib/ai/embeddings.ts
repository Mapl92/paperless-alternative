// WARNING: storeEmbedding() contains a raw SQL query against the "Document" table (pgvector).
// Prisma does not type-check this query. If the Document schema changes
// (column renames, type changes), this query MUST be updated manually.

import { pool } from "@/lib/db/prisma";
import { logApiCall } from "@/lib/logging";

const GEMINI_API_URL =
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-embedding-001:embedContent";

const EMBEDDING_DIMENSIONS = 768;

/**
 * Generate an embedding vector using Gemini gemini-embedding-001 (reduced to 768 dimensions).
 * Returns null on failure instead of throwing.
 */
export async function generateEmbedding(
  text: string
): Promise<number[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn("GEMINI_API_KEY not set, skipping embedding generation");
    return null;
  }

  // Gemini has a limit of ~2048 tokens, truncate long texts
  const truncated = text.slice(0, 8000);

  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let res: Response;
    try {
      res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text: truncated }] },
          taskType: "RETRIEVAL_DOCUMENT",
          outputDimensionality: EMBEDDING_DIMENSIONS,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const durationMs = Date.now() - start;

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini embedding API error:", res.status, err);
      logApiCall({
        type: "gemini-embedding",
        action: "embedding",
        model: "gemini-embedding-001",
        durationMs,
        status: "error",
        error: `${res.status} - ${err.slice(0, 500)}`,
      });
      return null;
    }

    const data = await res.json();
    logApiCall({
      type: "gemini-embedding",
      action: "embedding",
      model: "gemini-embedding-001",
      durationMs,
      status: "success",
    });
    return data.embedding?.values ?? null;
  } catch (error) {
    const durationMs = Date.now() - start;
    console.error("Embedding generation failed:", error);
    logApiCall({
      type: "gemini-embedding",
      action: "embedding",
      model: "gemini-embedding-001",
      durationMs,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Generate an embedding for a search query (uses RETRIEVAL_QUERY task type).
 */
export async function generateQueryEmbedding(
  text: string
): Promise<number[] | null> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return null;

  const start = Date.now();

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    let res: Response;
    try {
      res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          content: { parts: [{ text }] },
          taskType: "RETRIEVAL_QUERY",
          outputDimensionality: EMBEDDING_DIMENSIONS,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }

    const durationMs = Date.now() - start;

    if (!res.ok) {
      const err = await res.text();
      console.error("Gemini query embedding error:", res.status, err);
      logApiCall({
        type: "gemini-embedding",
        action: "query-embedding",
        model: "gemini-embedding-001",
        durationMs,
        status: "error",
        error: `${res.status} - ${err.slice(0, 500)}`,
      });
      return null;
    }

    const data = await res.json();
    logApiCall({
      type: "gemini-embedding",
      action: "query-embedding",
      model: "gemini-embedding-001",
      durationMs,
      status: "success",
    });
    return data.embedding?.values ?? null;
  } catch (error) {
    const durationMs = Date.now() - start;
    console.error("Query embedding failed:", error);
    logApiCall({
      type: "gemini-embedding",
      action: "query-embedding",
      model: "gemini-embedding-001",
      durationMs,
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

/**
 * Convert embedding array to pgvector string format: [0.1,0.2,...]
 */
export function toVectorString(embedding: number[]): string {
  return `[${embedding.join(",")}]`;
}

/**
 * Store an embedding for a document using raw SQL (Prisma can't handle vector type).
 */
export async function storeEmbedding(
  documentId: string,
  embedding: number[]
): Promise<void> {
  const vectorStr = toVectorString(embedding);
  await pool.query(
    `UPDATE "Document" SET "embedding" = $1::vector WHERE "id" = $2`,
    [vectorStr, documentId]
  );
}
