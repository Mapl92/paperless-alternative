import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { getR2Client, getR2Bucket } from "@/lib/r2/client";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// GET /api/share/[token] — public endpoint, validates token and redirects to R2 presigned URL
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const link = await prisma.shareLink.findUnique({
    where: { token },
    include: { document: { select: { title: true } } },
  });

  if (!link) {
    return NextResponse.json({ error: "Link nicht gefunden oder abgelaufen" }, { status: 404 });
  }

  if (link.expiresAt < new Date()) {
    return NextResponse.json({ error: "Dieser Freigabe-Link ist abgelaufen" }, { status: 410 });
  }

  try {
    const r2 = getR2Client();
    const bucket = getR2Bucket();

    // Generate short-lived presigned URL (60 seconds — just enough for redirect + download start)
    const presignedUrl = await getSignedUrl(
      r2,
      new GetObjectCommand({
        Bucket: bucket,
        Key: link.r2Key,
        ResponseContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(link.fileName)}`,
      }),
      { expiresIn: 60 }
    );

    // Increment download counter (fire-and-forget)
    prisma.shareLink.update({
      where: { id: link.id },
      data: { downloads: { increment: 1 } },
    }).catch(() => {});

    return NextResponse.redirect(presignedUrl);
  } catch (error) {
    console.error("Share redirect error:", error);
    return NextResponse.json({ error: "Download fehlgeschlagen" }, { status: 500 });
  }
}
