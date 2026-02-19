import { readdir, readFile, unlink, rename } from "fs/promises";
import { join } from "path";
import { existsSync } from "fs";
import { getConsumeDir } from "@/lib/files/storage";
import { saveOriginal } from "@/lib/files/storage";
import { processDocument } from "@/lib/ai/process-document";
import { prisma } from "@/lib/db/prisma";

const SCAN_INTERVAL_MS = 30_000;
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
const g = globalThis as unknown as { __consumeRunning?: boolean };

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
