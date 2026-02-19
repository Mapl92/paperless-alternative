import { prisma } from "@/lib/db/prisma";
import { performOCROnMultiplePages } from "./ocr";
import { classifyDocument } from "./classify";
import { generateEmbedding, storeEmbedding } from "./embeddings";
import { applyMatchingRules } from "./apply-rules";
import { getAISettings } from "./settings";
import { saveThumbnail, saveArchive } from "@/lib/files/storage";
import { logAuditEvent } from "@/lib/audit";
import { PDFDocument } from "pdf-lib";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, readdir, unlink, mkdtemp, rm } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

// MIME types treated as single-page images (not PDFs)
export const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/tiff",
  "image/webp",
  "image/bmp",
  "image/gif",
]);

export function isImageMimeType(mimeType: string): boolean {
  return SUPPORTED_IMAGE_MIME_TYPES.has(mimeType.toLowerCase());
}

/**
 * Convert an image buffer to a single-page PDF using pdf-lib.
 * pdf-lib natively supports JPG and PNG; all other formats are converted to PNG via sharp first.
 */
async function imageToPdf(imageBuffer: Buffer, mimeType: string): Promise<Buffer> {
  const sharp = (await import("sharp")).default;
  const pdfDoc = await PDFDocument.create();

  let image;
  if (mimeType === "image/jpeg" || mimeType === "image/jpg") {
    image = await pdfDoc.embedJpg(imageBuffer);
  } else {
    // Normalise to PNG for all other formats (TIFF, WebP, BMP, GIF, …)
    const pngBuffer = await sharp(imageBuffer).png().toBuffer();
    image = await pdfDoc.embedPng(pngBuffer);
  }

  const { width, height } = image.size();
  const page = pdfDoc.addPage([width, height]);
  page.drawImage(image, { x: 0, y: 0, width, height });

  return Buffer.from(await pdfDoc.save());
}

const execFileAsync = promisify(execFile);

/**
 * Convert PDF pages to PNG images using pdftoppm (poppler-utils)
 */
async function pdfPagesToPng(
  pdfBuffer: Buffer,
  maxPages: number
): Promise<Buffer[]> {
  const tempDir = await mkdtemp(join(tmpdir(), "documind-"));
  const pdfPath = join(tempDir, "input.pdf");

  try {
    // #26: writeFile inside try so the finally cleanup runs even if writing fails
    await writeFile(pdfPath, pdfBuffer);
    // pdftoppm converts PDF pages to PPM/PNG images
    // -png: output as PNG
    // -r 200: 200 DPI resolution
    // -l <n>: last page to convert
    await execFileAsync("pdftoppm", [
      "-png",
      "-r",
      "200",
      "-l",
      String(maxPages),
      pdfPath,
      join(tempDir, "page"),
    ]);

    // pdftoppm creates files like page-1.png or page-01.png (zero-padded
    // depending on total page count). Read all matching PNGs sorted by name.
    const files = await readdir(tempDir);
    const pageFiles = files
      .filter((f) => f.startsWith("page-") && f.endsWith(".png"))
      .sort();

    const pages: Buffer[] = [];
    for (const file of pageFiles) {
      const buf = await readFile(join(tempDir, file));
      pages.push(buf);
      await unlink(join(tempDir, file));
    }

    return pages;
  } finally {
    // Cleanup entire temp directory (PDF + any remaining PNG files)
    // #27: Log cleanup failures — silent errors here hide disk-full conditions
    await rm(tempDir, { recursive: true, force: true }).catch((err) => {
      console.error(`[process-document] Failed to clean up temp dir ${tempDir}:`, err);
    });
  }
}

async function findOrCreateTag(name: string) {
  const existing = await prisma.tag.findUnique({ where: { name } });
  if (existing) return existing;
  try {
    return await prisma.tag.create({ data: { name } });
  } catch {
    const found = await prisma.tag.findUnique({ where: { name } });
    if (found) return found;
    throw new Error(`Failed to find or create tag: ${name}`);
  }
}

async function findOrCreateCorrespondent(name: string) {
  const existing = await prisma.correspondent.findUnique({ where: { name } });
  if (existing) return existing;
  try {
    return await prisma.correspondent.create({ data: { name } });
  } catch {
    const found = await prisma.correspondent.findUnique({ where: { name } });
    if (found) return found;
    throw new Error(`Failed to find or create correspondent: ${name}`);
  }
}

async function findOrCreateDocumentType(name: string) {
  const existing = await prisma.documentType.findUnique({ where: { name } });
  if (existing) return existing;
  try {
    return await prisma.documentType.create({ data: { name } });
  } catch {
    const found = await prisma.documentType.findUnique({ where: { name } });
    if (found) return found;
    throw new Error(`Failed to find or create document type: ${name}`);
  }
}

export async function processDocument(documentId: string, fileBuffer: Buffer) {
  try {
    const sharp = (await import("sharp")).default;

    // Determine whether this is an image or a PDF
    const docRecord = await prisma.document.findUnique({
      where: { id: documentId },
      select: { mimeType: true },
    });
    const mimeType = docRecord?.mimeType ?? "application/pdf";
    const isImage = isImageMimeType(mimeType);

    let pageImages: Buffer[];
    let pageCount: number;
    let archivePath: string | null = null;

    if (isImage) {
      // ── Image path ────────────────────────────────────────────────────────
      // Use the original image directly as the single OCR page.
      // Normalise to PNG so sharp can always handle it.
      const normalised = await sharp(fileBuffer).png().toBuffer();
      pageImages = [normalised];
      pageCount = 1;

      // Convert image to PDF and save as archiveFile so the PDF viewer works
      const pdfBuffer = await imageToPdf(fileBuffer, mimeType);
      archivePath = await saveArchive(pdfBuffer, documentId);
    } else {
      // ── PDF path ──────────────────────────────────────────────────────────
      // Load OCR page limit from settings
      const aiSettings = await getAISettings();
      const pdfBuffer = fileBuffer;

      pageImages = await pdfPagesToPng(pdfBuffer, aiSettings.ocrPageLimit);
      pageCount = pageImages.length;

      if (pageCount === 0) {
        throw new Error("Keine Seiten aus PDF extrahiert");
      }
    }

    // Generate thumbnail from first page
    const thumbnailBuffer = await sharp(pageImages[0])
      .resize(300, 400, { fit: "inside" })
      .webp({ quality: 80 })
      .toBuffer();

    const thumbnailPath = await saveThumbnail(thumbnailBuffer, documentId);

    // Resize pages for OCR (200 DPI PNGs are too large for API transfer)
    const pages = await Promise.all(
      pageImages.map(async (buf) => {
        const resized = await sharp(buf)
          .resize(1200, 1600, { fit: "inside", withoutEnlargement: true })
          .png({ quality: 85, compressionLevel: 6 })
          .toBuffer();
        return { base64: resized.toString("base64"), mimeType: "image/png" };
      })
    );

    // Perform OCR (parallel with concurrency limit)
    const ocrText = await performOCROnMultiplePages(pages);

    // Classify document
    const classification = await classifyDocument(ocrText);

    // Find or create correspondent
    let correspondentId: string | null = null;
    if (classification.correspondent) {
      const correspondent = await findOrCreateCorrespondent(classification.correspondent);
      correspondentId = correspondent.id;
    }

    // Find or create document type
    let documentTypeId: string | null = null;
    if (classification.documentType) {
      const docType = await findOrCreateDocumentType(classification.documentType);
      documentTypeId = docType.id;
    }

    // Find or create tags
    const tagIds: string[] = [];
    for (const tagName of classification.tags) {
      const tag = await findOrCreateTag(tagName);
      tagIds.push(tag.id);
    }

    // Update document with all extracted data
    await prisma.document.update({
      where: { id: documentId },
      data: {
        title: classification.title,
        content: ocrText,
        thumbnailFile: thumbnailPath,
        // For images, store the generated PDF as archiveFile
        ...(archivePath ? { archiveFile: archivePath } : {}),
        pageCount,
        correspondentId,
        documentTypeId,
        documentDate: classification.documentDate
          ? new Date(classification.documentDate)
          : null,
        expiresAt: classification.expiresAt
          ? new Date(classification.expiresAt)
          : null,
        aiProcessed: true,
        aiSummary: classification.summary,
        aiExtractedData: classification.extractedData
          ? JSON.parse(JSON.stringify(classification.extractedData))
          : undefined,
        tags: {
          connect: tagIds.map((id) => ({ id })),
        },
      },
    });

    // Log AI processing complete
    logAuditEvent({
      entityType: "document",
      entityId: documentId,
      entityTitle: classification.title,
      action: "process",
      changesSummary: `KI-Verarbeitung abgeschlossen (${pageCount} Seite${pageCount === 1 ? "" : "n"})`,
      newValues: {
        title: classification.title,
        correspondent: classification.correspondent,
        documentType: classification.documentType,
        tags: classification.tags,
        documentDate: classification.documentDate,
      },
      source: "ai",
    });

    // Apply matching rules (run after AI classification, can override results)
    try {
      await applyMatchingRules(documentId);
    } catch (ruleError) {
      console.warn(`[rules] Failed to apply rules for ${documentId}:`, ruleError);
    }

    // Generate and store embedding (non-blocking, errors are not fatal)
    try {
      const embeddingText = `${classification.title}\n${classification.summary || ""}\n${ocrText}`;
      const embedding = await generateEmbedding(embeddingText);
      if (embedding) {
        await storeEmbedding(documentId, embedding);
        console.log(`Embedding stored for document ${documentId}`);
      }
    } catch (embeddingError) {
      console.warn(`Embedding generation failed for ${documentId}:`, embeddingError);
    }

    console.log(`Document ${documentId} processed successfully`);
  } catch (error) {
    console.error(`Error processing document ${documentId}:`, error);
    // Mark as processed with error to avoid reprocessing
    await prisma.document.update({
      where: { id: documentId },
      data: {
        aiProcessed: true,
        aiSummary: `Fehler bei der Verarbeitung: ${error instanceof Error ? error.message : "Unbekannter Fehler"}`,
      },
    });
  }
}
