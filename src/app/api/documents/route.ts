import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";
import { saveOriginal } from "@/lib/files/storage";
import { processDocument } from "@/lib/ai/process-document";
import { logAuditEvent } from "@/lib/audit";

// #12: Max 100 MB per file, max 20 files per request
const MAX_FILE_SIZE = 100 * 1024 * 1024;
const MAX_FILES = 20;

// #9: Simple concurrency limiter — max 2 AI processing jobs at once on the Pi
let activeProcessing = 0;
const processingQueue: Array<() => void> = [];

function scheduleProcessDocument(documentId: string, buffer: Buffer) {
  const run = () => {
    activeProcessing++;
    processDocument(documentId, buffer)
      .catch((err) => console.error("Background processing failed:", err))
      .finally(() => {
        activeProcessing--;
        const next = processingQueue.shift();
        if (next) next();
      });
  };

  if (activeProcessing < 2) {
    run();
  } else {
    processingQueue.push(run);
  }
}

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
  const trashed = searchParams.get("trashed") === "true";

  const where: Record<string, unknown> = {
    // By default show only non-trashed docs; ?trashed=true shows only trashed
    deletedAt: trashed ? { not: null } : null,
  };

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

    // #12: Limit file count
    if (files.length > MAX_FILES) {
      return NextResponse.json(
        { error: `Maximal ${MAX_FILES} Dateien pro Upload erlaubt` },
        { status: 400 }
      );
    }

    const results = [];

    for (const file of files) {
      // #12: Limit file size before reading into memory
      if (file.size > MAX_FILE_SIZE) {
        return NextResponse.json(
          { error: `Datei "${file.name}" ist zu groß (max. 100 MB)` },
          { status: 400 }
        );
      }

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

      // Log upload event
      logAuditEvent({
        entityType: "document",
        entityId: document.id,
        entityTitle: document.title,
        action: "upload",
        newValues: { title: document.title, fileSize, mimeType: file.type || "application/pdf" },
        source: "ui",
      });

      // #9: Schedule with concurrency limit (max 2 parallel AI jobs)
      scheduleProcessDocument(document.id, buffer);

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
