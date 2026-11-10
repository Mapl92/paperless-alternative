import { prisma } from "@/lib/db/prisma";
import { permanentlyDeleteDocuments } from "@/lib/documents/delete-document";
import { logAuditEvent } from "@/lib/audit";

const INTERVAL_MS = 24 * 60 * 60 * 1000; // 24 hours
const RETENTION_DAYS = 30;
let timer: ReturnType<typeof setInterval> | null = null;

/** Hard-delete documents whose deletedAt is older than 30 days */
export async function cleanupTrash() {
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

    let deleted = 0;

    for (const doc of expired) {
      try {
        // Hard-delete the record (cascades to notes, todos, relations, and drops the
        // embedding with the row), then remove the files — but only those no other
        // document still points to. Identical uploads share one original file.
        await permanentlyDeleteDocuments([doc]);
        deleted++;

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

    console.log(`[trash-cleanup] Permanently deleted ${deleted} of ${expired.length} document(s)`);
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
