import { prisma } from "@/lib/db/prisma";
import { pool } from "@/lib/db/prisma";
import { deleteFile } from "@/lib/files/storage";
import { logAuditEvent } from "@/lib/audit";

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RETENTION_DAYS = 30;
let timer: ReturnType<typeof setInterval> | null = null;

/** Hard-delete documents whose deletedAt is older than 30 days */
async function cleanupTrash() {
  try {
    const cutoff = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const expired = await prisma.document.findMany({
      where: { deletedAt: { lt: cutoff } },
      select: {
        id: true,
        title: true,
        originalFile: true,
        archiveFile: true,
        thumbnailFile: true,
      },
    });

    if (expired.length === 0) return;

    console.log(`[trash-cleanup] Found ${expired.length} document(s) past ${RETENTION_DAYS}-day retention`);

    for (const doc of expired) {
      try {
        // 1. Delete embedding from pgvector
        await pool.query(
          `UPDATE "Document" SET "embedding" = NULL WHERE "id" = $1`,
          [doc.id]
        );

        // 2. Delete associated files from disk
        if (doc.originalFile) {
          await deleteFile(doc.originalFile).catch((e) =>
            console.warn(`[trash-cleanup] Failed to delete original ${doc.originalFile}:`, e)
          );
        }
        if (doc.archiveFile) {
          await deleteFile(doc.archiveFile).catch((e) =>
            console.warn(`[trash-cleanup] Failed to delete archive ${doc.archiveFile}:`, e)
          );
        }
        if (doc.thumbnailFile) {
          await deleteFile(doc.thumbnailFile).catch((e) =>
            console.warn(`[trash-cleanup] Failed to delete thumbnail ${doc.thumbnailFile}:`, e)
          );
        }

        // 3. Hard-delete the document (cascades to notes, todos, relations, etc.)
        await prisma.document.delete({ where: { id: doc.id } });

        logAuditEvent({
          entityType: "document",
          entityId: doc.id,
          entityTitle: doc.title,
          action: "delete",
          changesSummary: `Automatisch gelöscht nach ${RETENTION_DAYS} Tagen im Papierkorb`,
          source: "consume",
        });
      } catch (err) {
        console.error(`[trash-cleanup] Failed to delete document ${doc.id}:`, err);
      }
    }

    console.log(`[trash-cleanup] Permanently deleted ${expired.length} document(s)`);
  } catch (err) {
    console.error("[trash-cleanup] Error:", err);
  }
}

export function startTrashCleanup() {
  if (timer) return;

  // Run once on startup (delayed 60s to let the app boot)
  setTimeout(() => {
    cleanupTrash();
  }, 60_000);

  // Then every 24 hours
  timer = setInterval(cleanupTrash, INTERVAL_MS);
  console.log("[trash-cleanup] Scheduler started (every 24h)");
}
