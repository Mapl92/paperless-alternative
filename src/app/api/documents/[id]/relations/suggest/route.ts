import { NextRequest, NextResponse } from "next/server";
import { pool, prisma } from "@/lib/db/prisma";

/**
 * GET /api/documents/[id]/relations/suggest — top 5 similar docs via pgvector
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  try {
    // Get already-linked document IDs
    const existingRelations = await prisma.documentRelation.findMany({
      where: {
        OR: [{ sourceDocumentId: id }, { targetDocumentId: id }],
      },
      select: { sourceDocumentId: true, targetDocumentId: true },
    });

    const linkedIds = new Set<string>();
    linkedIds.add(id);
    for (const r of existingRelations) {
      linkedIds.add(r.sourceDocumentId);
      linkedIds.add(r.targetDocumentId);
    }

    const excludeIds = [...linkedIds];

    // pgvector cosine similarity query
    const result = await pool.query(
      `SELECT
         b.id,
         b.title,
         b."thumbnailFile",
         1 - (a.embedding <=> b.embedding) AS similarity
       FROM "Document" a
       JOIN "Document" b ON a.id != b.id
       WHERE a.id = $1
         AND a.embedding IS NOT NULL
         AND b.embedding IS NOT NULL
         AND b."deletedAt" IS NULL
         AND b.id != ALL($2::text[])
       ORDER BY a.embedding <=> b.embedding
       LIMIT 5`,
      [id, excludeIds]
    );

    // Fetch extra metadata for suggested docs
    if (result.rows.length === 0) {
      return NextResponse.json([]);
    }

    const docIds = result.rows.map((r: { id: string }) => r.id);
    const docs = await prisma.document.findMany({
      where: { id: { in: docIds } },
      select: {
        id: true,
        title: true,
        thumbnailFile: true,
        correspondent: { select: { name: true } },
        documentType: { select: { name: true } },
      },
    });
    const docMap = new Map(docs.map((d) => [d.id, d]));

    const suggestions = result.rows.map(
      (row: { id: string; similarity: string }) => ({
        ...docMap.get(row.id),
        similarity: Math.round(parseFloat(row.similarity) * 1000) / 10,
      })
    );

    return NextResponse.json(suggestions);
  } catch (error) {
    console.error("Failed to suggest relations:", error);
    return NextResponse.json(
      { error: "Vorschläge fehlgeschlagen" },
      { status: 500 }
    );
  }
}
