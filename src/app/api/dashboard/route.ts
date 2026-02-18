import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { pool } from "@/lib/db/prisma";
import { readdir, stat, statfs } from "fs/promises";
import { join } from "path";

/** Recursively sum file sizes in a directory. */
async function getDirectorySize(dirPath: string): Promise<number> {
  let total = 0;
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    await Promise.all(
      entries.map(async (entry) => {
        const full = join(dirPath, entry.name);
        if (entry.isDirectory()) {
          total += await getDirectorySize(full);
        } else if (entry.isFile()) {
          const s = await stat(full);
          total += s.size;
        }
      })
    );
  } catch {
    // Directory missing or no access — skip silently
  }
  return total;
}

export async function GET() {
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const dataDir = process.env.DATA_DIR || "./data";

  const [
    docCount,
    tagCount,
    correspondentCount,
    unprocessedCount,
    openTodoCount,
    recentDocs,
    urgentTodos,
    needsAttention,
    trendResult,
    dataDirBytes,
  ] = await Promise.all([
    prisma.document.count(),
    prisma.tag.count(),
    prisma.correspondent.count(),
    prisma.document.count({ where: { aiProcessed: false } }),
    prisma.todo.count({ where: { completed: false } }),

    // Last 6 docs
    prisma.document.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        thumbnailFile: true,
        documentDate: true,
        createdAt: true,
        correspondent: { select: { name: true } },
        documentType: { select: { name: true } },
      },
    }),

    // Todos overdue or due within 7 days
    prisma.todo.findMany({
      where: {
        completed: false,
        dueDate: { lte: sevenDaysFromNow },
      },
      orderBy: [{ dueDate: "asc" }, { priority: "asc" }],
      take: 5,
      include: {
        document: { select: { id: true, title: true } },
      },
    }),

    // Docs without tags AND without correspondent (need attention)
    prisma.document.findMany({
      where: { tags: { none: {} }, correspondentId: null, aiProcessed: true },
      take: 6,
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        title: true,
        thumbnailFile: true,
        documentDate: true,
        createdAt: true,
        documentType: { select: { name: true } },
      },
    }),

    // Monthly document count for last 6 months
    pool.query(
      `SELECT
         TO_CHAR(DATE_TRUNC('month', "createdAt"), 'YYYY-MM') AS month,
         COUNT(*)::int AS count
       FROM "Document"
       WHERE "createdAt" >= DATE_TRUNC('month', NOW()) - INTERVAL '5 months'
       GROUP BY 1
       ORDER BY 1`
    ),

    // Actual disk usage of the data directory
    getDirectorySize(dataDir),
  ]);

  // Disk stats (free / total) via statfs — Node 20 stable API
  let freeBytes: number | null = null;
  let totalBytes: number | null = null;
  try {
    const fs = await statfs(dataDir);
    freeBytes = fs.bfree * fs.bsize;
    totalBytes = fs.blocks * fs.bsize;
  } catch {
    // statfs not available or path doesn't exist yet
  }

  // Fill all 6 months (including months with 0 documents)
  const monthlyTrend = Array.from({ length: 6 }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (5 - i), 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const row = trendResult.rows.find(
      (r: { month: string; count: number }) => r.month === key
    );
    return {
      month: key,
      label: d.toLocaleDateString("de-DE", { month: "short" }),
      count: row ? row.count : 0,
    };
  });

  return NextResponse.json({
    stats: {
      documents: docCount,
      tags: tagCount,
      correspondents: correspondentCount,
      unprocessed: unprocessedCount,
      todosOpen: openTodoCount,
    },
    storage: {
      usedBytes: dataDirBytes,
      freeBytes,
      totalBytes,
    },
    monthlyTrend,
    recentDocuments: recentDocs,
    urgentTodos,
    needsAttention,
  });
}
