import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { deleteFile } from "@/lib/files/storage";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const signature = await prisma.signature.findUnique({ where: { id } });
  if (!signature) {
    return NextResponse.json({ error: "Nicht gefunden" }, { status: 404 });
  }

  // Delete file
  await deleteFile(signature.imageFile);

  // Delete DB record (tokens will have signatureId set to null via onDelete: SetNull)
  await prisma.signature.delete({ where: { id } });

  return NextResponse.json({ success: true });
}
