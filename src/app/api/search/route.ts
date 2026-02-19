// WARNING: This file contains raw SQL queries against the "Document" table (pgvector).
// Prisma does not type-check these queries. If the Document schema changes
// (column renames, type changes, new constraints), these queries MUST be updated manually.
// Affected: semanticSearch(), hybridSearch() — pool.query with "embedding" column.

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { pool } from "@/lib/db/prisma";
import { generateQueryEmbedding, toVectorString } from "@/lib/ai/embeddings";
import { logApiCall } from "@/lib/logging";

type SearchMode = "text" | "semantic" | "hybrid";

interface SearchResult {
  id: string;
  title: string;
  thumbnailFile: string | null;
  documentDate: string | null;
  createdAt: string;
  aiProcessed: boolean;
  correspondent: { id: string; name: string } | null;
  documentType: { id: string; name: string } | null;
  tags: Array<{ id: string; name: string; color: string }>;
  score?: number;
}

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const query = searchParams.get("q") || "";
  const mode = (searchParams.get("mode") || "hybrid") as SearchMode;
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "24");

  if (!query) {
    return NextResponse.json({ documents: [], total: 0, page, totalPages: 0 });
  }

  try {
    if (mode === "text") {
      return await textSearch(query, page, limit);
    }

    if (mode === "semantic") {
      return await semanticSearch(query, page, limit);
    }

    // hybrid (default)
    return await hybridSearch(query, page, limit);
  } catch (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "Suche fehlgeschlagen" },
      { status: 500 }
    );
  }
}

async function textSearch(query: string, page: number, limit: number) {
  const where = {
    deletedAt: null,
    OR: [
      { title: { contains: query, mode: "insensitive" as const } },
      { content: { contains: query, mode: "insensitive" as const } },
    ],
  };

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      include: { tags: true, correspondent: true, documentType: true },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.document.count({ where }),
  ]);

  return NextResponse.json({
    documents,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}

async function semanticSearch(query: string, page: number, limit: number) {
  const embedding = await generateQueryEmbedding(query);
  if (!embedding) {
    // Fallback to text search if embedding generation fails
    return textSearch(query, page, limit);
  }

  const vectorStr = toVectorString(embedding);
  const offset = (page - 1) * limit;

  // Cosine similarity search via pgvector
  const searchStart = Date.now();
  const result = await pool.query(
    `SELECT id, 1 - ("embedding" <=> $1::vector) as similarity
     FROM "Document"
     WHERE "embedding" IS NOT NULL
       AND "deletedAt" IS NULL
     ORDER BY "embedding" <=> $1::vector
     LIMIT $2 OFFSET $3`,
    [vectorStr, limit, offset]
  );
  logApiCall({
    type: "vector-search",
    action: "semantic-search",
    durationMs: Date.now() - searchStart,
    status: "success",
    metadata: { mode: "semantic", resultCount: result.rows.length },
  });

  const countResult = await pool.query(
    `SELECT COUNT(*) FROM "Document" WHERE "embedding" IS NOT NULL AND "deletedAt" IS NULL`
  );
  const total = parseInt(countResult.rows[0].count);

  if (result.rows.length === 0) {
    return NextResponse.json({ documents: [], total: 0, page, totalPages: 0 });
  }

  // Fetch full document data via Prisma
  const ids = result.rows.map((r: { id: string }) => r.id);
  const similarities = new Map(
    result.rows.map((r: { id: string; similarity: number }) => [r.id, r.similarity])
  );

  const documents = await prisma.document.findMany({
    where: { id: { in: ids } },
    include: { tags: true, correspondent: true, documentType: true },
  });

  // Sort by similarity and attach score
  const sorted = documents
    .map((doc) => ({
      ...doc,
      score: Math.round((similarities.get(doc.id) || 0) * 100) / 100,
    }))
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  return NextResponse.json({
    documents: sorted,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}

async function hybridSearch(query: string, page: number, limit: number) {
  const embedding = await generateQueryEmbedding(query);

  // If no embedding available, fall back to text-only
  if (!embedding) {
    return textSearch(query, page, limit);
  }

  const vectorStr = toVectorString(embedding);

  // Get text search results (top 50 for fusion)
  const textResults = await prisma.document.findMany({
    where: {
      deletedAt: null,
      OR: [
        { title: { contains: query, mode: "insensitive" } },
        { content: { contains: query, mode: "insensitive" } },
      ],
    },
    select: { id: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  // Get semantic search results (top 50 for fusion)
  const searchStart = Date.now();
  const semanticResult = await pool.query(
    `SELECT id, 1 - ("embedding" <=> $1::vector) as similarity
     FROM "Document"
     WHERE "embedding" IS NOT NULL
       AND "deletedAt" IS NULL
     ORDER BY "embedding" <=> $1::vector
     LIMIT 50`,
    [vectorStr]
  );
  logApiCall({
    type: "vector-search",
    action: "semantic-search",
    durationMs: Date.now() - searchStart,
    status: "success",
    metadata: { mode: "hybrid", resultCount: semanticResult.rows.length },
  });

  // Reciprocal Rank Fusion (k=60)
  const k = 60;
  const scores = new Map<string, number>();

  textResults.forEach((doc, rank) => {
    const rrf = 1 / (k + rank + 1);
    scores.set(doc.id, (scores.get(doc.id) || 0) + rrf);
  });

  semanticResult.rows.forEach((row: { id: string }, rank: number) => {
    const rrf = 1 / (k + rank + 1);
    scores.set(row.id, (scores.get(row.id) || 0) + rrf);
  });

  // Sort by combined RRF score
  const rankedIds = [...scores.entries()]
    .sort((a, b) => b[1] - a[1]);

  const total = rankedIds.length;
  const pageIds = rankedIds.slice((page - 1) * limit, page * limit);

  if (pageIds.length === 0) {
    return NextResponse.json({ documents: [], total: 0, page, totalPages: 0 });
  }

  const ids = pageIds.map(([id]) => id);
  const scoreMap = new Map(pageIds);

  const documents = await prisma.document.findMany({
    where: { id: { in: ids } },
    include: { tags: true, correspondent: true, documentType: true },
  });

  // Maintain RRF ranking order
  const sorted = documents
    .map((doc) => ({
      ...doc,
      score: Math.round((scoreMap.get(doc.id) || 0) * 1000) / 1000,
    }))
    .sort((a, b) => (b.score || 0) - (a.score || 0));

  return NextResponse.json({
    documents: sorted,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}
