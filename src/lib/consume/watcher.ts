import { open, readdir, readFile, unlink, rename, stat } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { getConsumeDir } from "@/lib/files/storage";
import { saveOriginal } from "@/lib/files/storage";
import { processDocument } from "@/lib/ai/process-document";
import { prisma } from "@/lib/db/prisma";

const SCAN_INTERVAL_MS = 30_000;
// Scanner und Netzwerkkopien schreiben Dateien nach und nach (der Brother-Scanner
// Seite für Seite, das Seitenverzeichnis erst am Ende). Eine Datei wird erst
// übernommen, wenn sie so lange unverändert ist und – bei PDFs – vollständig
// (%%EOF am Ende). Sonst landeten halbe Dateien in DocuMind (29.10.2026).
const MIN_UNCHANGED_MS = 60_000;
// Bleibt eine PDF so lange unvollständig, wird sie trotzdem verarbeitet
// (kaputte Datei statt ewig wartend).
const INCOMPLETE_PDF_MAX_WAIT_MS = 30 * 60_000;
const SUPPORTED_EXTENSIONS = [".pdf", ".png", ".jpg", ".jpeg", ".tiff", ".tif", ".webp", ".bmp", ".gif"];

const EXT_TO_MIME: Record<string, string> = {
  ".pdf":  "application/pdf",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".tiff": "image/tiff",
  ".tif":  "image/tiff",
  ".webp": "image/webp",
  ".bmp":  "image/bmp",
  ".gif":  "image/gif",
};

// #18: Use globalThis so the flag is shared across Next.js route bundles
// (avoids two scan cycles running simultaneously if modules are instantiated twice)
const g = globalThis as unknown as { __consumeRunning?: boolean; __consumeWaiting?: Set<string> };

/** PDF-Dateiende (%%EOF) in den letzten Bytes vorhanden? */
async function hasPdfEnd(filePath: string, size: number): Promise<boolean> {
  const length = Math.min(size, 2048);
  const handle = await open(filePath, "r");
  try {
    const buffer = Buffer.alloc(length);
    await handle.read(buffer, 0, length, size - length);
    return buffer.includes("%%EOF");
  } finally {
    await handle.close();
  }
}

/** Ist die Datei fertig geschrieben? */
async function isReady(filePath: string, filename: string): Promise<boolean> {
  const info = await stat(filePath);
  const age = Date.now() - info.mtimeMs;
  if (age < MIN_UNCHANGED_MS) return false;
  if (!filename.toLowerCase().endsWith(".pdf") || (await hasPdfEnd(filePath, info.size))) return true;
  const waiting = (g.__consumeWaiting ??= new Set());
  if (age < INCOMPLETE_PDF_MAX_WAIT_MS) {
    if (!waiting.has(filename)) console.log(`[consume] Waiting for incomplete PDF: ${filename}`);
    waiting.add(filename);
    return false;
  }
  console.warn(`[consume] PDF still incomplete after ${INCOMPLETE_PDF_MAX_WAIT_MS / 60_000} min, processing anyway: ${filename}`);
  waiting.delete(filename);
  return true;
}

async function scanConsumeDir() {
  if (g.__consumeRunning) return;
  g.__consumeRunning = true;

  try {
    const consumeDir = getConsumeDir();
    if (!existsSync(consumeDir)) return;

    const entries = await readdir(consumeDir);
    const files = entries.filter((f) => {
      const lower = f.toLowerCase();
      return (
        SUPPORTED_EXTENSIONS.some((ext) => lower.endsWith(ext)) &&
        !lower.startsWith(".")
      );
    });

    for (const filename of files) {
      const filePath = join(consumeDir, filename);

      try {
        if (!(await isReady(filePath, filename))) continue;
      } catch {
        continue; // Datei inzwischen weg
      }
      g.__consumeWaiting?.delete(filename);

      // Rename to .processing to prevent double pickup
      const processingPath = filePath + ".processing";
      try {
        await rename(filePath, processingPath);
      } catch {
        // File may have been removed or already picked up
        continue;
      }

      try {
        console.log(`[consume] Processing: ${filename}`);
        const buffer = Buffer.from(await readFile(processingPath));

        // Detect MIME type from extension
        const ext = filename.toLowerCase().match(/\.[^.]+$/)?.[0] ?? ".pdf";
        const mimeType = EXT_TO_MIME[ext] ?? "application/pdf";

        // Save original
        const { path, checksum, fileSize } = await saveOriginal(
          buffer,
          filename
        );

        // Check for duplicate by checksum
        const existing = await prisma.document.findFirst({
          where: { checksum },
        });

        if (existing) {
          console.log(
            `[consume] Duplicate skipped: ${filename} (matches ${existing.title})`
          );
          await unlink(processingPath);
          continue;
        }

        // Create document record
        const document = await prisma.document.create({
          data: {
            title: filename.replace(/\.[^/.]+$/, ""),
            originalFile: path,
            fileSize,
            checksum,
            mimeType,
          },
        });

        // Process (OCR + Classification) - await to process sequentially
        await processDocument(document.id, buffer);

        // Remove from consume
        await unlink(processingPath);
        console.log(`[consume] Done: ${filename} → ${document.id}`);
      } catch (error) {
        console.error(`[consume] Error processing ${filename}:`, error);
        // Move back so it can be retried next cycle
        try {
          await rename(processingPath, filePath);
        } catch {
          // If rename back fails, leave .processing file
        }
      }
    }
  } catch (error) {
    console.error("[consume] Scan error:", error);
  } finally {
    g.__consumeRunning = false;
  }
}

export function startConsumeWatcher() {
  console.log(
    `[consume] Watcher started, scanning every ${SCAN_INTERVAL_MS / 1000}s: ${getConsumeDir()}`
  );

  // Initial scan after short delay
  setTimeout(scanConsumeDir, 5_000);

  // Periodic scan
  setInterval(scanConsumeDir, SCAN_INTERVAL_MS);
}
