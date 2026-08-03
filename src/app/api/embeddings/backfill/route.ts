// WARNING: This file contains raw SQL queries against the "Document" table (pgvector).
// Prisma does not type-check these queries. If the Document schema changes,
// update the model-aware counts and backfill selection below.

import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db/prisma";
import {
  EMBEDDING_MODEL,
  EmbeddingRateLimitError,
  generateEmbedding,
  storeEmbedding,
} from "@/lib/ai/embeddings";

type BackfillState = "running" | "cooldown" | "complete" | "error";

interface BackfillProgress {
  processed: number;
  failed: number;
  total: number;
  batchSize: number;
  state: BackfillState;
  cooldownUntil: string | null;
  message: string | null;
  rateLimitRetries: number;
}

// Use globalThis so progress survives Next.js route bundle re-instantiations.
const g = globalThis as unknown as {
  __backfillRunning?: boolean;
  __backfillProgress?: BackfillProgress;
};

const DEFAULT_BATCH_SIZE = 50;
const MAX_BATCH_SIZE = 100;
const DEFAULT_REQUEST_DELAY_MS = 4_000;
const MAX_RATE_LIMIT_RETRIES = 6;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getProgress() {
  return g.__backfillProgress ?? null;
}

async function getStats() {
  const result = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (
         WHERE "embedding" IS NOT NULL AND "embeddingModel" = $1
       )::int AS embedded,
       COUNT(*) FILTER (
         WHERE "embedding" IS NOT NULL
           AND "embeddingModel" IS DISTINCT FROM $1
       )::int AS legacy
     FROM "Document"
     WHERE "aiProcessed" = true
       AND "content" IS NOT NULL
       AND "deletedAt" IS NULL`,
    [EMBEDDING_MODEL]
  );

  const row = result.rows[0] as { total: number; embedded: number; legacy: number };
  return {
    total: row.total,
    embedded: row.embedded,
    legacy: row.legacy,
    pending: row.total - row.embedded,
  };
}

export async function GET() {
  const stats = await getStats();
  return NextResponse.json({
    ...stats,
    model: EMBEDDING_MODEL,
    running: g.__backfillRunning ?? false,
    progress: getProgress(),
  });
}

export async function POST(request: NextRequest) {
  if (g.__backfillRunning) {
    return NextResponse.json(
      { error: "Backfill läuft bereits", progress: getProgress() },
      { status: 409 }
    );
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY nicht konfiguriert" },
      { status: 500 }
    );
  }

  let requestedBatchSize = DEFAULT_BATCH_SIZE;
  try {
    const body = await request.json();
    if (typeof body.batchSize === "number") requestedBatchSize = body.batchSize;
  } catch {
    // An empty body uses the safe default batch size.
  }

  const batchSize = Math.min(
    MAX_BATCH_SIZE,
    Math.max(1, Math.floor(requestedBatchSize))
  );

  g.__backfillRunning = true;
  g.__backfillProgress = {
    processed: 0,
    failed: 0,
    total: 0,
    batchSize,
    state: "running",
    cooldownUntil: null,
    message: null,
    rateLimitRetries: 0,
  };

  runBackfill(batchSize)
    .catch((error) => {
      console.error("Embedding backfill failed:", error);
      if (g.__backfillProgress) {
        g.__backfillProgress.state = "error";
        g.__backfillProgress.message =
          error instanceof Error ? error.message : "Unbekannter Backfill-Fehler";
      }
    })
    .finally(() => {
      g.__backfillRunning = false;
    });

  return NextResponse.json({
    message: `Embedding-Batch mit maximal ${batchSize} Dokumenten gestartet`,
    batchSize,
  });
}

async function runBackfill(batchSize: number) {
  const result = await pool.query(
    `SELECT d."id", d."title", d."content", d."aiSummary"
     FROM "Document" d
     WHERE d."aiProcessed" = true
       AND d."content" IS NOT NULL
       AND d."deletedAt" IS NULL
       AND d."embeddingModel" IS DISTINCT FROM $1
     ORDER BY d."createdAt" DESC
     LIMIT $2`,
    [EMBEDDING_MODEL, batchSize]
  );

  const progress = g.__backfillProgress!;
  progress.total = result.rows.length;
  progress.message = result.rows.length
    ? `${result.rows.length} Dokumente in diesem Batch`
    : "Keine ausstehenden Dokumente";

  const requestDelayMs = Math.max(
    250,
    Number(process.env.EMBEDDING_BACKFILL_DELAY_MS) || DEFAULT_REQUEST_DELAY_MS
  );

  for (const row of result.rows) {
    let completed = false;

    while (!completed) {
      try {
        progress.state = "running";
        progress.cooldownUntil = null;
        progress.message = "Embedding wird erzeugt";

        const text = `${row.title}\n${row.aiSummary || ""}\n${row.content}`;
        const embedding = await generateEmbedding(text, { throwOnRateLimit: true });

        if (embedding) {
          await storeEmbedding(row.id, embedding);
          progress.processed++;
        } else {
          progress.failed++;
        }
        // Only consecutive rate-limit responses should trip the safety stop.
        progress.rateLimitRetries = 0;
        completed = true;
      } catch (error) {
        if (!(error instanceof EmbeddingRateLimitError)) throw error;

        progress.rateLimitRetries++;
        if (progress.rateLimitRetries > MAX_RATE_LIMIT_RETRIES) {
          progress.state = "error";
          progress.message =
            "Gemini-Limit wiederholt erreicht. Der Batch wurde sicher angehalten und kann später fortgesetzt werden.";
          return;
        }

        const fallbackMs = Math.min(
          60 * 60 * 1000,
          60_000 * 2 ** (progress.rateLimitRetries - 1)
        );
        const cooldownMs = Math.max(
          5_000,
          error.retryAfterMs ?? fallbackMs
        );
        const jitterMs = Math.floor(Math.random() * 2_000);
        const resumeAt = new Date(Date.now() + cooldownMs + jitterMs);

        progress.state = "cooldown";
        progress.cooldownUntil = resumeAt.toISOString();
        progress.message =
          "Gemini-Nutzungslimit erreicht. Der Backfill wartet und setzt danach automatisch fort.";

        await sleep(cooldownMs + jitterMs);
      }
    }

    if (progress.processed + progress.failed < progress.total) {
      await sleep(requestDelayMs);
    }
  }

  progress.state = "complete";
  progress.cooldownUntil = null;
  progress.message = result.rows.length
    ? `Batch abgeschlossen: ${progress.processed} erfolgreich, ${progress.failed} fehlgeschlagen.`
    : "Alle Dokumente verwenden bereits das aktuelle Embedding-Modell.";
}
