import { prisma } from "@/lib/db/prisma";
import { DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getR2Client, getR2Bucket, isR2Configured } from "./client";

const INTERVAL_MS = 4 * 60 * 60 * 1000; // 4 hours
let timer: ReturnType<typeof setInterval> | null = null;

/** Delete expired share links from R2 and database */
async function cleanupExpiredLinks() {
  if (!isR2Configured()) return;

  try {
    const expired = await prisma.shareLink.findMany({
      where: { expiresAt: { lt: new Date() } },
    });

    if (expired.length === 0) return;

    const r2 = getR2Client();
    const bucket = getR2Bucket();

    let deleted = 0;
    for (const link of expired) {
      try {
        await r2.send(new DeleteObjectCommand({ Bucket: bucket, Key: link.r2Key }));
      } catch (err) {
        console.error(`[share-cleanup] R2 delete failed for ${link.r2Key}:`, err);
      }

      await prisma.shareLink.delete({ where: { id: link.id } });
      deleted++;
    }

    if (deleted > 0) {
      console.log(`[share-cleanup] Removed ${deleted} expired share link(s)`);
    }
  } catch (err) {
    console.error("[share-cleanup] Error:", err);
  }
}

export function startShareCleanup() {
  if (timer) return;

  // Run once on startup (delayed 30s to let the app boot)
  setTimeout(() => {
    cleanupExpiredLinks();
  }, 30_000);

  // Then every 4 hours
  timer = setInterval(cleanupExpiredLinks, INTERVAL_MS);
  console.log("[share-cleanup] Scheduler started (every 4h)");
}
