import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db/prisma";
import { prisma } from "@/lib/db/prisma";

/**
 * Jaccard similarity on word tokens (words > 3 chars, lowercased, punctuation stripped).
 * Returns 0–1 where 1 = identical word sets.
 */
function jaccardSimilarity(text1: string | null, text2: string | null): number {
  if (!text1 || !text2) return 0;
  const tokenize = (t: string): Set<string> =>
    new Set(
      t.toLowerCase()
        .replace(/[^\w\s]/g, " ")
        .split(/\s+/)
        .filter((w) => w.length > 3)
    );
  const s1 = tokenize(text1);
  const s2 = tokenize(text2);
  if (s1.size === 0 && s2.size === 0) return 1;
  let intersection = 0;
  for (const w of s1) if (s2.has(w)) intersection++;
  return intersection / new Set([...s1, ...s2]).size;
}

interface Pair {
  id1: string;
  id2: string;
  embeddingSimilarity: number;
  textSimilarity: number;
}

/** Union-Find clustering: groups all transitively connected document IDs */
function buildGroups(pairs: Pair[]): string[][] {
  const parent = new Map<string, string>();

  const allIds = new Set(pairs.flatMap((p) => [p.id1, p.id2]));
  for (const id of allIds) parent.set(id, id);

  function find(x: string): string {
    if (parent.get(x) !== x) parent.set(x, find(parent.get(x)!));
    return parent.get(x)!;
  }

  for (const { id1, id2 } of pairs) {
    parent.set(find(id1), find(id2));
  }

  const groups = new Map<string, string[]>();
  for (const id of allIds) {
    const root = find(id);
    if (!groups.has(root)) groups.set(root, []);
    groups.get(root)!.push(id);
  }

  return [...groups.values()].filter((g) => g.length > 1);
}

export async function GET(request: NextRequest) {
  try {
    const raw = parseFloat(request.nextUrl.searchParams.get("threshold") || "0.90");
    const threshold = Math.min(0.99, Math.max(0.70, raw));

    // pgvector self-join: find all pairs above the cosine similarity threshold.
    // For 242 docs this is ~29k comparisons — fast with HNSW index.
    const result = await pool.query(
      `SELECT
         a.id        AS id1,
         a.title     AS title1,
         a.content   AS content1,
         b.id        AS id2,
         b.title     AS title2,
         b.content   AS content2,
         1 - (a.embedding <=> b.embedding) AS similarity
       FROM "Document" a
       JOIN "Document" b ON a.id < b.id
       WHERE a.embedding IS NOT NULL
         AND b.embedding IS NOT NULL
         AND a."deletedAt" IS NULL
         AND b."deletedAt" IS NULL
         AND 1 - (a.embedding <=> b.embedding) > $1
       ORDER BY similarity DESC
       LIMIT 500`,
      [threshold]
    );

    if (result.rows.length === 0) {
      const scanned = await pool
        .query(`SELECT COUNT(*) FROM "Document" WHERE embedding IS NOT NULL AND "deletedAt" IS NULL`)
        .then((r: { rows: Array<{ count: string }> }) => parseInt(r.rows[0].count));
      return NextResponse.json({ groups: [], scanned, threshold });
    }

    // Compute Jaccard text similarity for each candidate pair
    const pairs: Pair[] = result.rows.map(
      (row: { id1: string; id2: string; content1: string | null; content2: string | null; similarity: string }) => ({
        id1: row.id1,
        id2: row.id2,
        embeddingSimilarity: parseFloat(row.similarity),
        textSimilarity: jaccardSimilarity(row.content1, row.content2),
      })
    );

    // Group transitively connected documents
    const allIds = new Set(pairs.flatMap((p) => [p.id1, p.id2]));
    const groupedIds = buildGroups(pairs);

    // Fetch full document metadata for all involved documents
    const docs = await prisma.document.findMany({
      where: { id: { in: [...allIds] } },
      select: {
        id: true,
        title: true,
        thumbnailFile: true,
        documentDate: true,
        createdAt: true,
        fileSize: true,
        pageCount: true,
        correspondent: { select: { name: true } },
        documentType: { select: { name: true } },
      },
    });
    const docMap = new Map(docs.map((d) => [d.id, d]));

    const groups = groupedIds
      .map((ids) => {
        const groupPairs = pairs.filter(
          (p) => ids.includes(p.id1) && ids.includes(p.id2)
        );
        const maxSimilarity = Math.max(...groupPairs.map((p) => p.embeddingSimilarity));
        const maxTextSimilarity = Math.max(...groupPairs.map((p) => p.textSimilarity));
        return {
          documents: ids.map((id) => docMap.get(id)).filter(Boolean),
          pairs: groupPairs.map(({ id1, id2, embeddingSimilarity, textSimilarity }) => ({
            id1, id2,
            embeddingSimilarity: Math.round(embeddingSimilarity * 1000) / 10, // → e.g. 96.3
            textSimilarity: Math.round(textSimilarity * 1000) / 10,
          })),
          maxSimilarity: Math.round(maxSimilarity * 1000) / 10,
          maxTextSimilarity: Math.round(maxTextSimilarity * 1000) / 10,
        };
      })
      .sort((a, b) => b.maxSimilarity - a.maxSimilarity);

    const scanned = await pool
      .query(`SELECT COUNT(*) FROM "Document" WHERE embedding IS NOT NULL`)
      .then((r: { rows: Array<{ count: string }> }) => parseInt(r.rows[0].count));

    return NextResponse.json({ groups, scanned, threshold });
  } catch (error) {
    console.error("Duplicate scan error:", error);
    return NextResponse.json({ error: "Scan fehlgeschlagen" }, { status: 500 });
  }
}
