import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { saveSignature } from "@/lib/files/storage";
import sharp from "sharp";

export async function GET() {
  const signatures = await prisma.signature.findMany({
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(signatures);
}

export async function POST(request: NextRequest) {
  const { name, imageData } = await request.json();

  if (!name || !imageData) {
    return NextResponse.json(
      { error: "Name und Bilddaten erforderlich" },
      { status: 400 }
    );
  }

  // Decode base64 PNG
  const base64Data = imageData.replace(/^data:image\/png;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");

  // Get dimensions via sharp
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  // Create DB record first to get ID
  const signature = await prisma.signature.create({
    data: {
      name,
      imageFile: "", // placeholder
      width,
      height,
    },
  });

  // Save file
  const imageFile = await saveSignature(buffer, signature.id);

  // Update with file path
  const updated = await prisma.signature.update({
    where: { id: signature.id },
    data: { imageFile },
  });

  return NextResponse.json(updated, { status: 201 });
}
