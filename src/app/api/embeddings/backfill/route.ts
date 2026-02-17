import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { pool } from "@/lib/db/prisma";
import { generateEmbedding, storeEmbedding } from "@/lib/ai/embeddings";

// #24: Use globalThis so backfill state survives across Next.js route bundle re-instantiations
const g = globalThis as unknown as {
  __backfillRunning?: boolean;
  __backfillProgress?: { processed: number; failed: number; total: number };
};

function getProgress() {
  return g.__backfillProgress ?? { processed: 0, failed: 0, total: 0 };
}

export async function GET() {
  const [total, embedded] = await Promise.all([
    prisma.document.count({ where: { aiProcessed: true } }),
    pool
      .query(`SELECT COUNT(*) FROM "Document" WHERE "embedding" IS NOT NULL`)
      .then((r) => parseInt(r.rows[0].count)),
  ]);

  return NextResponse.json({
    total,
    embedded,
    pending: total - embedded,
    running: g.__backfillRunning ?? false,
    progress: g.__backfillRunning ? getProgress() : null,
  });
}

export async function POST() {
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

  g.__backfillRunning = true;
  g.__backfillProgress = { processed: 0, failed: 0, total: 0 };

  runBackfill().finally(() => {
    g.__backfillRunning = false;
  });

  return NextResponse.json({ message: "Backfill gestartet" });
}

async function runBackfill() {
  const result = await pool.query(
    `SELECT d."id", d."title", d."content", d."aiSummary"
     FROM "Document" d
     WHERE d."embedding" IS NULL AND d."aiProcessed" = true AND d."content" IS NOT NULL
     ORDER BY d."createdAt" DESC`
  );

  g.__backfillProgress!.total = result.rows.length;
  console.log(`Backfill: ${result.rows.length} documents to process`);

  for (const row of result.rows) {
    try {
      const text = `${row.title}\n${row.aiSummary || ""}\n${row.content}`;
      const embedding = await generateEmbedding(text);

      if (embedding) {
        await storeEmbedding(row.id, embedding);
        g.__backfillProgress!.processed++;
      } else {
        g.__backfillProgress!.failed++;
      }

      // Rate limit: ~10 requests/second to stay within Gemini free tier
      await new Promise((resolve) => setTimeout(resolve, 100));
    } catch (error) {
      console.error(`Backfill failed for document ${row.id}:`, error);
      g.__backfillProgress!.failed++;
    }
  }

  console.log(
    `Backfill complete: ${g.__backfillProgress!.processed} processed, ${g.__backfillProgress!.failed} failed`
  );
}
