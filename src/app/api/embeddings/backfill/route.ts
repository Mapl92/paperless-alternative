import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { pool } from "@/lib/db/prisma";
import { generateEmbedding, storeEmbedding } from "@/lib/ai/embeddings";

let backfillRunning = false;
let backfillProgress = { processed: 0, failed: 0, total: 0 };

export async function GET() {
  // Count documents with and without embeddings
  const [total, embedded] = await Promise.all([
    prisma.document.count({ where: { aiProcessed: true } }),
    pool
      .query(
        `SELECT COUNT(*) FROM "Document" WHERE "embedding" IS NOT NULL`
      )
      .then((r) => parseInt(r.rows[0].count)),
  ]);

  return NextResponse.json({
    total,
    embedded,
    pending: total - embedded,
    running: backfillRunning,
    progress: backfillRunning ? backfillProgress : null,
  });
}

export async function POST() {
  if (backfillRunning) {
    return NextResponse.json(
      { error: "Backfill läuft bereits", progress: backfillProgress },
      { status: 409 }
    );
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json(
      { error: "GEMINI_API_KEY nicht konfiguriert" },
      { status: 500 }
    );
  }

  // Start backfill in background
  backfillRunning = true;
  backfillProgress = { processed: 0, failed: 0, total: 0 };

  runBackfill().finally(() => {
    backfillRunning = false;
  });

  return NextResponse.json({ message: "Backfill gestartet" });
}

async function runBackfill() {
  // Get all documents without embeddings that have content
  const result = await pool.query(
    `SELECT d."id", d."title", d."content", d."aiSummary"
     FROM "Document" d
     WHERE d."embedding" IS NULL AND d."aiProcessed" = true AND d."content" IS NOT NULL
     ORDER BY d."createdAt" DESC`
  );

  backfillProgress.total = result.rows.length;
  console.log(`Backfill: ${result.rows.length} documents to process`);

  for (const row of result.rows) {
    try {
      const text = `${row.title}\n${row.aiSummary || ""}\n${row.content}`;
      const embedding = await generateEmbedding(text);

      if (embedding) {
        await storeEmbedding(row.id, embedding);
        backfillProgress.processed++;
      } else {
        backfillProgress.failed++;
      }

      // Rate limit: ~10 requests/second to stay within Gemini free tier
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Backfill failed for document ${row.id}:`, error);
      backfillProgress.failed++;
    }
  }

  console.log(
    `Backfill complete: ${backfillProgress.processed} processed, ${backfillProgress.failed} failed`
  );
}
