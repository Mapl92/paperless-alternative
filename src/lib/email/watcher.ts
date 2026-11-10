import { createHash } from "crypto";
import { ImapFlow } from "imapflow";
import { getEmailSettings } from "./settings";
import { extractAttachments } from "./parse-mail";
import {
  fetchNewMessages,
  recordFailure,
  recordSuccess,
  type FetchedMail,
  type ImportCursor,
} from "./imap-fetch";
import { saveOriginal } from "@/lib/files/storage";
import { processDocument } from "@/lib/ai/process-document";
import { logAuditEvent } from "@/lib/audit";
import { prisma } from "@/lib/db/prisma";

// Use globalThis to share state across Next.js route bundles
const g = globalThis as unknown as {
  __emailWatcherRunning?: boolean;
  __emailWatcherInterval?: ReturnType<typeof setInterval> | null;
};

const PROCESSED_IDS_KEY = "processed_email_ids";
const CURSOR_KEY = "email_import_cursor";
const CLEANUP_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

// A mail whose import keeps failing is given up after this many polls, so one
// broken message cannot hold up the import forever.
const MAX_ATTEMPTS = 3;

// Per poll. Whatever does not fit waits for the next one.
const FETCH_LIMITS = {
  maxMails: 20,
  maxTotalBytes: 80 * 1024 * 1024,
  maxMessageBytes: 60 * 1024 * 1024,
};

interface ProcessedIds {
  ids: Record<string, number>; // messageId → timestamp
}

async function loadProcessedIds(): Promise<ProcessedIds> {
  const setting = await prisma.settings.findUnique({
    where: { key: PROCESSED_IDS_KEY },
  });
  const data = setting?.value as unknown as ProcessedIds | undefined;
  return { ids: { ...(data?.ids ?? {}) } };
}

async function saveProcessedIds(data: ProcessedIds): Promise<void> {
  const value = JSON.parse(JSON.stringify(data));
  await prisma.settings.upsert({
    where: { key: PROCESSED_IDS_KEY },
    create: { key: PROCESSED_IDS_KEY, value },
    update: { value },
  });
}

async function loadCursor(): Promise<ImportCursor | null> {
  const setting = await prisma.settings.findUnique({ where: { key: CURSOR_KEY } });
  const data = setting?.value as unknown as Partial<ImportCursor> | undefined;
  if (!data || typeof data.key !== "string" || typeof data.uidValidity !== "string") {
    return null;
  }
  return {
    key: data.key,
    uidValidity: data.uidValidity,
    caughtUp: Boolean(data.caughtUp),
    lastUid: Number(data.lastUid) || 0,
    pending: { ...(data.pending ?? {}) },
  };
}

async function saveCursor(cursor: ImportCursor): Promise<void> {
  const value = JSON.parse(JSON.stringify(cursor));
  await prisma.settings.upsert({
    where: { key: CURSOR_KEY },
    create: { key: CURSOR_KEY, value },
    update: { value },
  });
}

interface ImportStats {
  imported: number;
  duplicates: number;
  ignoredImages: number;
}

/**
 * Turns the attachments of one mail into documents. Throws if an attachment
 * could not be stored, so the caller retries the mail; attachments that were
 * stored before are recognised by their checksum on the retry.
 */
async function importMail(mail: FetchedMail, stats: ImportStats): Promise<void> {
  const { subject, attachments: accepted, ignoredImages } = await extractAttachments(
    mail.source,
    mail.subject
  );
  stats.ignoredImages += ignoredImages;

  let firstError: unknown = null;

  for (const { filename, mimeType, buffer } of accepted) {
    let documentId: string;

    try {
      const checksum = createHash("sha256").update(buffer).digest("hex");
      const existing = await prisma.document.findFirst({
        where: { checksum },
        select: { id: true },
      });
      if (existing) {
        stats.duplicates++;
        continue;
      }

      const { path, fileSize } = await saveOriginal(buffer, filename);

      // Subject as title; with several documents in one mail, add the filename.
      const title =
        accepted.length > 1 ? `${subject} - ${filename.replace(/\.[^.]+$/, "")}` : subject;

      const document = await prisma.document.create({
        data: { title, originalFile: path, fileSize, checksum, mimeType },
      });
      documentId = document.id;
      stats.imported++;

      logAuditEvent({
        entityType: "document",
        entityId: document.id,
        entityTitle: title,
        action: "upload",
        newValues: { title, fileSize, mimeType },
        source: "email",
      });
    } catch (error) {
      firstError = firstError ?? error;
      console.error(
        `[email] Could not store attachment "${filename}":`,
        error instanceof Error ? error.message : error
      );
      continue;
    }

    // The document exists from here on. A failure in the AI pipeline is
    // recorded on the document itself and must not re-import the mail.
    try {
      await processDocument(documentId, buffer);
    } catch (error) {
      console.error(
        `[email] Processing failed for document ${documentId}:`,
        error instanceof Error ? error.message : error
      );
    }
  }

  if (firstError) throw firstError;
}

async function pollEmails() {
  if (g.__emailWatcherRunning) return;
  g.__emailWatcherRunning = true;

  try {
    const settings = await getEmailSettings();
    if (!settings.enabled || !settings.imapHost || !settings.imapUser) {
      return;
    }

    const processed = await loadProcessedIds();
    const previousCursor = await loadCursor();
    let processedChanged = false;

    // Forget message IDs older than 90 days.
    const cutoff = Date.now() - CLEANUP_MAX_AGE_MS;
    for (const [id, ts] of Object.entries(processed.ids)) {
      if (ts < cutoff) {
        delete processed.ids[id];
        processedChanged = true;
      }
    }

    const result = await fetchNewMessages(
      {
        host: settings.imapHost,
        port: settings.imapPort,
        user: settings.imapUser,
        pass: settings.imapPassword,
        folder: settings.folder,
      },
      previousCursor,
      new Set(Object.keys(processed.ids)),
      FETCH_LIMITS
    );

    // The mail connection is closed from here on.
    const cursor = result.cursor;
    const stats: ImportStats = { imported: 0, duplicates: 0, ignoredImages: 0 };
    let failures = 0;
    let givenUp = 0;

    const remember = (messageId: string | null) => {
      if (messageId) {
        processed.ids[messageId] = Date.now();
        processedChanged = true;
      }
    };

    const markDone = (uid: number, messageId: string | null) => {
      recordSuccess(cursor, uid);
      remember(messageId);
    };

    const markFailed = (uid: number, messageId: string | null) => {
      failures++;
      if (recordFailure(cursor, uid, MAX_ATTEMPTS) === "given-up") {
        givenUp++;
        console.warn(`[email] Giving up on message ${uid} after ${MAX_ATTEMPTS} attempts`);
        remember(messageId);
      }
    };

    for (const { uid, messageId } of result.failed) markFailed(uid, messageId);

    for (const { subject, size } of result.oversized) {
      console.warn(
        `[email] Skipping "${subject}" (${Math.round(size / 1024 / 1024)} MB): larger than the import limit`
      );
    }

    for (const mail of result.mails) {
      const before = stats.imported;
      try {
        await importMail(mail, stats);
        markDone(mail.uid, mail.messageId);
      } catch (error) {
        console.error(
          `[email] Import of message ${mail.uid} failed:`,
          error instanceof Error ? error.message : error
        );
        markFailed(mail.uid, mail.messageId);
      }
      // Release the raw message; up to 80 MB are buffered per poll.
      mail.source = Buffer.alloc(0);
      if (stats.imported > before) {
        console.log(
          `[email] Imported ${stats.imported - before} document(s) from "${mail.subject || "E-Mail Import"}"`
        );
      }
    }

    if (JSON.stringify(cursor) !== JSON.stringify(previousCursor)) {
      await saveCursor(cursor);
    }
    if (processedChanged) {
      await saveProcessedIds(processed);
    }

    const notes: string[] = [];
    if (result.initialScan) notes.push("initial scan of unread mail");
    if (givenUp > 0) notes.push(`${givenUp} given up`);
    if (result.connectionError) notes.push(`connection: ${result.connectionError}`);

    console.log(
      `[email] Poll done: ${result.examined} checked, ${result.mails.length} downloaded, ` +
        `${stats.imported} imported, ${stats.duplicates} duplicate(s), ` +
        `${stats.ignoredImages} image(s) ignored, ${failures} failed` +
        (notes.length > 0 ? ` (${notes.join("; ")})` : "")
    );
  } catch (error) {
    console.error("[email] Poll error:", error instanceof Error ? error.message : error);
  } finally {
    g.__emailWatcherRunning = false;
  }
}

export function startEmailWatcher() {
  console.log("[email] Watcher initialized");

  // Initial poll after short delay
  setTimeout(async () => {
    const settings = await getEmailSettings();
    if (settings.enabled) {
      const intervalMs = settings.pollIntervalMinutes * 60_000;
      console.log(
        `[email] Polling every ${settings.pollIntervalMinutes}min`
      );
      pollEmails();
      g.__emailWatcherInterval = setInterval(pollEmails, intervalMs);
    } else {
      console.log("[email] Watcher disabled (not configured)");
    }
  }, 10_000);
}

export async function restartEmailWatcher() {
  // Clear existing interval
  if (g.__emailWatcherInterval) {
    clearInterval(g.__emailWatcherInterval);
    g.__emailWatcherInterval = null;
  }

  const settings = await getEmailSettings();

  if (!settings.enabled) {
    console.log("[email] Watcher disabled");
    return;
  }

  const intervalMs = settings.pollIntervalMinutes * 60_000;
  console.log(`[email] Watcher restarted, polling every ${settings.pollIntervalMinutes}min`);

  // Poll immediately, then on interval
  pollEmails();
  g.__emailWatcherInterval = setInterval(pollEmails, intervalMs);
}

export async function testImapConnection(config: {
  imapHost: string;
  imapPort: number;
  imapUser: string;
  imapPassword: string;
  folder: string;
}): Promise<{ success: boolean; message: string; messageCount?: number }> {
  let client: ImapFlow | null = null;

  try {
    client = new ImapFlow({
      host: config.imapHost,
      port: config.imapPort,
      secure: true,
      auth: {
        user: config.imapUser,
        pass: config.imapPassword,
      },
      logger: false,
      connectionTimeout: 15_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });
    // Keep connection errors from surfacing as uncaught exceptions.
    client.on("error", () => {});

    await client.connect();
    const mailbox = await client.mailboxOpen(config.folder);

    const result = {
      success: true,
      message: `Verbindung erfolgreich! Ordner "${config.folder}" enthält ${mailbox.exists} E-Mail(s).`,
      messageCount: mailbox.exists,
    };

    await client.logout();
    return result;
  } catch (error) {
    let msg = error instanceof Error ? error.message : "Unbekannter Fehler";
    // #19: Remove password from IMAP error messages before returning to client
    if (config.imapPassword) {
      msg = msg.replaceAll(config.imapPassword, "***");
    }
    return {
      success: false,
      message: `Verbindung fehlgeschlagen: ${msg}`,
    };
  } finally {
    if (client) {
      try {
        await client.logout();
      } catch {
        // Ignore
      }
    }
  }
}
