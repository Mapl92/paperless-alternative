import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { readFileFromStorage } from "@/lib/files/storage";
import { getR2Client, getR2Bucket, isR2Configured } from "@/lib/r2/client";
import { PutObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import crypto from "crypto";

const EXPIRY_OPTIONS: Record<string, number> = {
  "1h":  1 * 60 * 60 * 1000,
  "24h": 24 * 60 * 60 * 1000,
  "7d":  7 * 24 * 60 * 60 * 1000,
  "30d": 30 * 24 * 60 * 60 * 1000,
};

// GET /api/documents/[id]/share — list share links for this document
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const links = await prisma.shareLink.findMany({
    where: { documentId: id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(links);
}

// POST /api/documents/[id]/share — create a new share link
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  if (!isR2Configured()) {
    return NextResponse.json(
      { error: "Cloudflare R2 ist nicht konfiguriert. Bitte R2_ACCOUNT_ID, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY und R2_BUCKET_NAME in der .env.production setzen." },
      { status: 503 }
    );
  }

  try {
    const body = await request.json();
    const expiry = body.expiry ?? "7d";

    if (!EXPIRY_OPTIONS[expiry]) {
      return NextResponse.json({ error: "Ungültige Ablaufzeit" }, { status: 400 });
    }

    const document = await prisma.document.findUnique({
      where: { id },
      select: { id: true, title: true, originalFile: true, archiveFile: true, mimeType: true },
    });

    if (!document) {
      return NextResponse.json({ error: "Dokument nicht gefunden" }, { status: 404 });
    }

    // Read the file (prefer archive PDF, fallback to original)
    const filePath = document.archiveFile || document.originalFile;
    const fileBuffer = await readFileFromStorage(filePath);
    const fileName = `${document.title.replace(/[^a-zA-Z0-9äöüÄÖÜß\s\-_.]/g, "_")}.pdf`;

    // Generate secure token
    const token = crypto.randomBytes(32).toString("hex");
    const r2Key = `shares/${token}/${fileName}`;
    const expiresAt = new Date(Date.now() + EXPIRY_OPTIONS[expiry]);

    // Upload to R2
    const r2 = getR2Client();
    const bucket = getR2Bucket();

    await r2.send(new PutObjectCommand({
      Bucket: bucket,
      Key: r2Key,
      Body: fileBuffer,
      ContentType: "application/pdf",
      ContentDisposition: `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      // R2 doesn't support object-level expiry via SDK — we handle expiry ourselves
    }));

    // Store in DB
    const shareLink = await prisma.shareLink.create({
      data: { token, documentId: id, r2Key, fileName, expiresAt },
    });

    const shareUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/api/share/${token}`;

    return NextResponse.json({ ...shareLink, shareUrl }, { status: 201 });
  } catch (error) {
    console.error("Share link creation error:", error);
    return NextResponse.json(
      { error: "Freigabe-Link konnte nicht erstellt werden" },
      { status: 500 }
    );
  }
}

// DELETE /api/documents/[id]/share?linkId=xxx — revoke a share link
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const linkId = request.nextUrl.searchParams.get("linkId");

  if (!linkId) {
    return NextResponse.json({ error: "linkId fehlt" }, { status: 400 });
  }

  try {
    const link = await prisma.shareLink.findFirst({
      where: { id: linkId, documentId: id },
    });

    if (!link) {
      return NextResponse.json({ error: "Link nicht gefunden" }, { status: 404 });
    }

    // Delete from R2
    if (isR2Configured()) {
      try {
        const r2 = getR2Client();
        await r2.send(new DeleteObjectCommand({ Bucket: getR2Bucket(), Key: link.r2Key }));
      } catch (err) {
        console.error("R2 delete error (continuing with DB delete):", err);
      }
    }

    await prisma.shareLink.delete({ where: { id: linkId } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Share link delete error:", error);
    return NextResponse.json({ error: "Löschen fehlgeschlagen" }, { status: 500 });
  }
}
