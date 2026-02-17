import { prisma } from "@/lib/db/prisma";
import { performOCROnMultiplePages } from "./ocr";
import { classifyDocument } from "./classify";
import { generateEmbedding, storeEmbedding } from "./embeddings";
import { getAISettings } from "./settings";
import { saveThumbnail } from "@/lib/files/storage";
import { execFile } from "child_process";
import { promisify } from "util";
import { writeFile, readFile, readdir, unlink, mkdtemp } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

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
  await writeFile(pdfPath, pdfBuffer);

  try {
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
    // Cleanup temp PDF
    await unlink(pdfPath).catch(() => {});
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

export async function processDocument(documentId: string, pdfBuffer: Buffer) {
  try {
    const sharp = (await import("sharp")).default;

    // Load OCR page limit from settings
    const aiSettings = await getAISettings();

    // Convert PDF pages to PNG using pdftoppm
    const pageImages = await pdfPagesToPng(pdfBuffer, aiSettings.ocrPageLimit);
    const pageCount = pageImages.length;

    if (pageCount === 0) {
      throw new Error("Keine Seiten aus PDF extrahiert");
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
        pageCount,
        correspondentId,
        documentTypeId,
        documentDate: classification.documentDate
          ? new Date(classification.documentDate)
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
