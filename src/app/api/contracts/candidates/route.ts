import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { serializeCandidate } from "@/lib/contracts/serialize";

export async function GET(request: NextRequest) {
  const status = request.nextUrl.searchParams.get("status") ?? "pending";
  const limit = Math.min(parseInt(request.nextUrl.searchParams.get("limit") ?? "100"), 200);

  const where = status === "all" ? {} : { status };
  const candidates = await prisma.contractCandidate.findMany({
    where,
    take: limit,
    orderBy: { createdAt: "desc" },
    include: {
      document: {
        select: {
          id: true,
          title: true,
          content: true,
          thumbnailFile: true,
          documentDate: true,
          createdAt: true,
          correspondent: { select: { name: true } },
          documentType: { select: { name: true } },
        },
      },
      contract: { select: { id: true, name: true } },
    },
  });

  return NextResponse.json({
    candidates: candidates.map((candidate) => serializeCandidate(candidate as unknown as Record<string, unknown>)),
  });
}
