// WARNING: This file contains a raw SQL query against the "Document" table.
// Prisma does not type-check these queries. If the Document schema changes
// (column renames, type changes), these queries MUST be updated manually.
// Affected: Monthly trend aggregation query.

import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { pool } from "@/lib/db/prisma";
import { readdir, stat, statfs } from "fs/promises";
import { join } from "path";

/** Recursively sum file sizes in a directory.
 *  Each entry is wrapped in its own try-catch so a single failing stat()
 *  (e.g. EMFILE when hundreds of files are opened concurrently) doesn't
 *  abort the whole directory. Sizes are collected as return values and
 *  reduced at the end — avoids the shared-`total` mutation pitfall.
 */
async function getDirectorySize(dirPath: string): Promise<number> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const sizes = await Promise.all(
      entries.map(async (entry): Promise<number> => {
        const full = join(dirPath, entry.name);
        try {
          if (entry.isDirectory()) return await getDirectorySize(full);
          if (entry.isFile()) return (await stat(full)).size;
        } catch {
          // single-entry error — skip, don't abort the whole directory
        }
        return 0;
      })
    );
    return sizes.reduce((sum, s) => sum + s, 0);
  } catch {
    return 0;
  }
}

export async function GET() {
  const now = new Date();
  const sevenDaysFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
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
    expiringDocs,
  ] = await Promise.all([
    prisma.document.count({ where: { deletedAt: null } }),
    prisma.tag.count(),
    prisma.correspondent.count(),
    prisma.document.count({ where: { aiProcessed: false, deletedAt: null } }),
    prisma.todo.count({ where: { completed: false } }),

    // Last 6 docs
    prisma.document.findMany({
      where: { deletedAt: null },
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
      where: { tags: { none: {} }, correspondentId: null, aiProcessed: true, deletedAt: null },
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
         AND "deletedAt" IS NULL
       GROUP BY 1
       ORDER BY 1`
    ),

    // Actual disk usage of the data directory
    getDirectorySize(dataDir),

    // Documents expiring within 30 days (including already expired in last 30 days)
    prisma.document.findMany({
      where: { expiresAt: { gte: thirtyDaysAgo, lte: thirtyDaysFromNow }, deletedAt: null },
      orderBy: { expiresAt: "asc" },
      take: 8,
      select: {
        id: true,
        title: true,
        expiresAt: true,
        correspondent: { select: { name: true } },
        documentType: { select: { name: true } },
      },
    }),
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
    expiringDocuments: expiringDocs,
  });
}
