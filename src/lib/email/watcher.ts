import { ImapFlow } from "imapflow";
import { simpleParser } from "mailparser";
import { getEmailSettings } from "./settings";
import { saveOriginal } from "@/lib/files/storage";
import { processDocument } from "@/lib/ai/process-document";
import { prisma } from "@/lib/db/prisma";

// Use globalThis to share state across Next.js route bundles
const g = globalThis as unknown as {
  __emailWatcherRunning?: boolean;
  __emailWatcherInterval?: ReturnType<typeof setInterval> | null;
};

const SETTINGS_KEY = "processed_email_ids";
const CLEANUP_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000; // 90 days

interface ProcessedIds {
  ids: Record<string, number>; // messageId → timestamp
}

async function getProcessedEmailIds(): Promise<Set<string>> {
  const setting = await prisma.settings.findUnique({
    where: { key: SETTINGS_KEY },
  });
  if (!setting) return new Set();
  const data = setting.value as unknown as ProcessedIds;
  return new Set(Object.keys(data.ids || {}));
}

async function addProcessedEmailId(messageId: string): Promise<void> {
  const setting = await prisma.settings.findUnique({
    where: { key: SETTINGS_KEY },
  });
  const data: ProcessedIds = setting
    ? (setting.value as unknown as ProcessedIds)
    : { ids: {} };

  data.ids[messageId] = Date.now();

  await prisma.settings.upsert({
    where: { key: SETTINGS_KEY },
    create: { key: SETTINGS_KEY, value: JSON.parse(JSON.stringify(data)) },
    update: { value: JSON.parse(JSON.stringify(data)) },
  });
}

async function cleanupOldProcessedIds(): Promise<void> {
  const setting = await prisma.settings.findUnique({
    where: { key: SETTINGS_KEY },
  });
  if (!setting) return;

  const data = setting.value as unknown as ProcessedIds;
  const cutoff = Date.now() - CLEANUP_MAX_AGE_MS;
  let removed = 0;

  for (const [id, ts] of Object.entries(data.ids)) {
    if (ts < cutoff) {
      delete data.ids[id];
      removed++;
    }
  }

  if (removed > 0) {
    await prisma.settings.update({
      where: { key: SETTINGS_KEY },
      data: { value: JSON.parse(JSON.stringify(data)) },
    });
    console.log(`[email] Cleaned up ${removed} old processed email ID(s)`);
  }
}

async function pollEmails() {
  if (g.__emailWatcherRunning) return;
  g.__emailWatcherRunning = true;

  let client: ImapFlow | null = null;

  try {
    const settings = await getEmailSettings();
    if (!settings.enabled || !settings.imapHost || !settings.imapUser) {
      return;
    }

    console.log("[email] Polling for new emails...");

    // Cleanup old processed IDs periodically
    await cleanupOldProcessedIds();

    const processedIds = await getProcessedEmailIds();

    client = new ImapFlow({
      host: settings.imapHost,
      port: settings.imapPort,
      secure: true,
      auth: {
        user: settings.imapUser,
        pass: settings.imapPassword,
      },
      logger: false,
    });

    await client.connect();

    const lock = await client.getMailboxLock(settings.folder);

    try {
      // Search for unseen messages
      const searchResult = await client.search({ seen: false });

      if (!searchResult || searchResult.length === 0) {
        console.log("[email] No unread emails found");
        return;
      }

      const messages = searchResult as number[];
      console.log(`[email] Found ${messages.length} unread email(s)`);

      for (const uid of messages) {
        try {
          // Fetch only envelope first (lightweight)
          const envelopeResult = await client.fetchOne(String(uid), {
            envelope: true,
          }, { uid: true });

          if (!envelopeResult || !envelopeResult.envelope?.messageId) continue;

          const messageId = envelopeResult.envelope.messageId;

          // Skip already processed emails
          if (processedIds.has(messageId)) {
            console.log(`[email] Already processed, skipping: ${messageId}`);
            continue;
          }

          // Fetch full source for processing
          const message = await client.fetchOne(String(uid), {
            source: true,
          }, { uid: true });

          if (!message || !("source" in message) || !message.source) continue;

          const parsed = await simpleParser(message.source);
          const subject = parsed.subject || "E-Mail Import";

          // Extract PDF attachments
          const pdfAttachments = (parsed.attachments || []).filter(
            (att) =>
              att.contentType === "application/pdf" ||
              att.filename?.toLowerCase().endsWith(".pdf")
          );

          if (pdfAttachments.length === 0) {
            // Track as processed even if no PDFs (avoid re-checking)
            await addProcessedEmailId(messageId);
            continue;
          }

          console.log(
            `[email] Processing "${subject}" - ${pdfAttachments.length} PDF(s)`
          );

          for (const attachment of pdfAttachments) {
            try {
              const buffer = Buffer.from(attachment.content);
              const filename =
                attachment.filename || `${subject.replace(/[^a-zA-Z0-9äöüÄÖÜß\s-]/g, "_")}.pdf`;

              // Save original file
              const { path, checksum, fileSize } = await saveOriginal(
                buffer,
                filename
              );

              // Duplicate check
              const existing = await prisma.document.findFirst({
                where: { checksum },
              });

              if (existing) {
                console.log(
                  `[email] Duplicate skipped: ${filename} (matches ${existing.title})`
                );
                continue;
              }

              // Build title from subject + filename (if multiple attachments)
              const title =
                pdfAttachments.length > 1
                  ? `${subject} - ${filename.replace(/\.pdf$/i, "")}`
                  : subject;

              // Create document
              const document = await prisma.document.create({
                data: {
                  title,
                  originalFile: path,
                  fileSize,
                  checksum,
                  mimeType: "application/pdf",
                },
              });

              // Process through AI pipeline
              await processDocument(document.id, buffer);

              console.log(
                `[email] Done: ${filename} → ${document.id}`
              );
            } catch (error) {
              console.error(
                `[email] Error processing attachment "${attachment.filename}":`,
                error
              );
            }
          }

          // Track email as processed (no \Seen flag)
          await addProcessedEmailId(messageId);
        } catch (error) {
          console.error(`[email] Error processing message ${uid}:`, error);
        }
      }
    } finally {
      lock.release();
    }
  } catch (error) {
    console.error("[email] Poll error:", error);
  } finally {
    if (client) {
      try {
        await client.logout();
      } catch {
        // Ignore logout errors
      }
    }
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
    });

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
    const msg =
      error instanceof Error ? error.message : "Unbekannter Fehler";
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
