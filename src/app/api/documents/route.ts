import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { saveOriginal } from "@/lib/files/storage";
import { processDocument } from "@/lib/ai/process-document";

export async function GET(request: NextRequest) {
  const searchParams = request.nextUrl.searchParams;
  const page = parseInt(searchParams.get("page") || "1");
  const limit = parseInt(searchParams.get("limit") || "24");
  const search = searchParams.get("search") || "";
  const tagId = searchParams.get("tagId");
  const correspondentId = searchParams.get("correspondentId");
  const documentTypeId = searchParams.get("documentTypeId");
  const sortField = searchParams.get("sortField") || "createdAt";
  const sortOrder = searchParams.get("sortOrder") || "desc";
  const documentDateFrom = searchParams.get("documentDateFrom");
  const documentDateTo = searchParams.get("documentDateTo");
  const addedDateFrom = searchParams.get("addedDateFrom");
  const addedDateTo = searchParams.get("addedDateTo");

  const where: Record<string, unknown> = {};

  if (search) {
    where.OR = [
      { title: { contains: search, mode: "insensitive" } },
      { content: { contains: search, mode: "insensitive" } },
    ];
  }

  if (tagId) {
    where.tags = { some: { id: tagId } };
  }

  if (correspondentId) {
    where.correspondentId = correspondentId;
  }

  if (documentTypeId) {
    where.documentTypeId = documentTypeId;
  }

  if (documentDateFrom || documentDateTo) {
    where.documentDate = {};
    if (documentDateFrom) (where.documentDate as Record<string, unknown>).gte = new Date(documentDateFrom);
    if (documentDateTo) (where.documentDate as Record<string, unknown>).lte = new Date(documentDateTo);
  }

  if (addedDateFrom || addedDateTo) {
    where.addedAt = {};
    if (addedDateFrom) (where.addedAt as Record<string, unknown>).gte = new Date(addedDateFrom);
    if (addedDateTo) (where.addedAt as Record<string, unknown>).lte = new Date(addedDateTo);
  }

  const [documents, total] = await Promise.all([
    prisma.document.findMany({
      where,
      include: {
        tags: true,
        correspondent: true,
        documentType: true,
      },
      orderBy: { [sortField]: sortOrder },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.document.count({ where }),
  ]);

  return NextResponse.json({
    documents,
    total,
    page,
    totalPages: Math.ceil(total / limit),
  });
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const files = formData.getAll("files") as File[];

    if (!files.length) {
      return NextResponse.json(
        { error: "Keine Dateien hochgeladen" },
        { status: 400 }
      );
    }

    const results = [];

    for (const file of files) {
      const buffer = Buffer.from(await file.arrayBuffer());

      // Save original file
      const { path, checksum, fileSize } = await saveOriginal(
        buffer,
        file.name
      );

      // Create document record
      const document = await prisma.document.create({
        data: {
          title: file.name.replace(/\.[^/.]+$/, ""),
          originalFile: path,
          fileSize,
          checksum,
          mimeType: file.type || "application/pdf",
        },
      });

      // Process document asynchronously (OCR + Classification)
      processDocument(document.id, buffer).catch((err) =>
        console.error("Background processing failed:", err)
      );

      results.push(document);
    }

    return NextResponse.json({ documents: results }, { status: 201 });
  } catch (error) {
    console.error("Upload error:", error);
    return NextResponse.json(
      { error: "Upload fehlgeschlagen" },
      { status: 500 }
    );
  }
}
