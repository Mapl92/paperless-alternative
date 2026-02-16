import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { saveSignature } from "@/lib/files/storage";
import sharp from "sharp";

export async function POST(request: NextRequest) {
  const { token, imageData } = await request.json();

  if (!token || !imageData) {
    return NextResponse.json(
      { error: "Token und Bilddaten erforderlich" },
      { status: 400 }
    );
  }

  // Validate token
  const signingToken = await prisma.signingToken.findUnique({
    where: { token },
  });

  if (!signingToken) {
    return NextResponse.json({ error: "Token ungültig" }, { status: 404 });
  }

  if (signingToken.usedAt) {
    return NextResponse.json({ error: "Token bereits verwendet" }, { status: 400 });
  }

  if (signingToken.expiresAt < new Date()) {
    return NextResponse.json({ error: "Token abgelaufen" }, { status: 400 });
  }

  // Decode base64 PNG
  const base64Data = imageData.replace(/^data:image\/png;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");

  // Get dimensions
  const metadata = await sharp(buffer).metadata();
  const width = metadata.width || 0;
  const height = metadata.height || 0;

  // Create signature
  const signature = await prisma.signature.create({
    data: {
      name: signingToken.name,
      imageFile: "",
      width,
      height,
    },
  });

  const imageFile = await saveSignature(buffer, signature.id);

  await prisma.signature.update({
    where: { id: signature.id },
    data: { imageFile },
  });

  // Mark token as used
  await prisma.signingToken.update({
    where: { id: signingToken.id },
    data: { usedAt: new Date(), signatureId: signature.id },
  });

  return NextResponse.json({ success: true });
}
