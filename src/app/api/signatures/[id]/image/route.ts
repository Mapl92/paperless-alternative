import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { readFileFromStorage } from "@/lib/files/storage";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const signature = await prisma.signature.findUnique({ where: { id } });
  if (!signature) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  const buffer = await readFileFromStorage(signature.imageFile);

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "public, max-age=31536000, immutable",
    },
  });
}
