import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  const [documents, tags, correspondents, documentTypes] = await Promise.all([
    prisma.document.count(),
    prisma.tag.count(),
    prisma.correspondent.count(),
    prisma.documentType.count(),
  ]);

  return NextResponse.json({ documents, tags, correspondents, documentTypes });
}
