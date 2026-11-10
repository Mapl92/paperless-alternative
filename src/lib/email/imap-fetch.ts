import { ImapFlow, type FetchMessageObject } from "imapflow";
import type { ConnectionOptions } from "tls";
import { hasCandidateAttachment, toSequenceSet } from "./attachments";

export interface ImapConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  folder: string;
  /** Defaults to true (implicit TLS). */
  secure?: boolean;
  tls?: ConnectionOptions;
}

/**
 * Where the import stands in one mailbox. IMAP gives every message in a folder
 * an ascending UID, so "everything above lastUid" is exactly the mail that
 * arrived since the previous poll.
 */
export interface ImportCursor {
  /** host|user|folder this cursor belongs to. */
  key: string;
  /** Changes when the server renumbers the folder; the cursor is void then. */
  uidValidity: string;
  /** False until one complete pass over the unread mail has succeeded. */
  caughtUp: boolean;
  /** Highest UID already looked at. Only meaningful once caughtUp is true. */
  lastUid: number;
  /** UID → failed attempts so far, for mails that must be tried again. */
  pending: Record<string, number>;
}

export interface FetchedMail {
  uid: number;
  messageId: string | null;
  subject: string;
  source: Buffer;
}

export interface FailedMail {
  uid: number;
  messageId: string | null;
}

export interface FetchLimits {
  /** Stop downloading after this many mails; the rest waits for the next poll. */
  maxMails: number;
  /** Stop downloading once this many bytes are buffered. */
  maxTotalBytes: number;
  /** Mails larger than this are skipped for good. */
  maxMessageBytes: number;
}

export interface FetchResult {
  cursor: ImportCursor;
  /** Mails with a possible attachment, downloaded and ready to import. */
  mails: FetchedMail[];
  /** Mails whose download failed. */
  failed: FailedMail[];
  /** Mails skipped because they exceed maxMessageBytes. */
  oversized: Array<{ uid: number; subject: string; size: number }>;
  /** Number of mails looked at in this poll. */
  examined: number;
  /** True when this poll ran as the initial pass over all unread mail. */
  initialScan: boolean;
  /** Set when the connection broke; the remaining mail waits for the next poll. */
  connectionError: string | null;
}

export function cursorKey(config: Pick<ImapConfig, "host" | "user" | "folder">): string {
  return `${config.host}|${config.user}|${config.folder}`;
}

/** The mail with this UID is finished; it needs no further attempt. */
export function recordSuccess(cursor: ImportCursor, uid: number): void {
  delete cursor.pending[String(uid)];
}

/**
 * The mail with this UID failed. It is tried again on the next poll until
 * maxAttempts is reached; then it is dropped so one broken message cannot hold
 * up the import forever.
 */
export function recordFailure(
  cursor: ImportCursor,
  uid: number,
  maxAttempts: number
): "retry" | "given-up" {
  const attempts = (cursor.pending[String(uid)] ?? 0) + 1;
  if (attempts >= maxAttempts) {
    delete cursor.pending[String(uid)];
    return "given-up";
  }
  cursor.pending[String(uid)] = attempts;
  return "retry";
}

const METADATA_CHUNK = 500;

/**
 * Connects, finds the mail that has not been looked at yet, downloads the
 * messages that might carry an attachment, and disconnects. Nothing is imported
 * here: the connection must not stay open while documents go through OCR,
 * because an idle IMAP socket times out long before that finishes.
 */
export async function fetchNewMessages(
  config: ImapConfig,
  previous: ImportCursor | null,
  processedIds: Set<string>,
  limits: FetchLimits
): Promise<FetchResult> {
  const client = new ImapFlow({
    host: config.host,
    port: config.port,
    secure: config.secure ?? true,
    tls: config.tls,
    auth: { user: config.user, pass: config.pass },
    logger: false,
    connectionTimeout: 30_000,
    greetingTimeout: 15_000,
    socketTimeout: 60_000,
  });

  // Without a listener, a socket timeout surfaces as an uncaughtException in
  // the server process instead of failing the command that was waiting on it.
  let connectionError: string | null = null;
  client.on("error", (err) => {
    connectionError = err?.message || "IMAP connection error";
  });

  try {
    await client.connect();
    const lock = await client.getMailboxLock(config.folder);

    try {
      const mailbox = client.mailbox;
      if (!mailbox) throw new Error(`Folder "${config.folder}" could not be opened`);

      const key = cursorKey(config);
      const uidValidity = String(mailbox.uidValidity);
      const cursor: ImportCursor =
        previous && previous.key === key && previous.uidValidity === uidValidity
          ? { ...previous, pending: { ...previous.pending } }
          : { key, uidValidity, caughtUp: false, lastUid: 0, pending: {} };

      const initialScan = !cursor.caughtUp;

      // Highest UID in the folder right now. Mail arriving later gets a higher one.
      let topUid = mailbox.uidNext ? mailbox.uidNext - 1 : 0;
      if (!mailbox.uidNext && mailbox.exists > 0) {
        const top = await client.search({ uid: "*" }, { uid: true });
        topUid = top && top.length > 0 ? Math.max(...top) : 0;
      }

      let uids: number[];
      if (initialScan) {
        // First run (or folder changed): look at the unread mail once, the way
        // the import always did. Read mail from before is never imported.
        uids = (await client.search({ seen: false }, { uid: true })) || [];
      } else {
        // "n:*" always returns at least the newest message, even when its UID
        // is below n, so the result has to be filtered.
        const found = (await client.search({ uid: `${cursor.lastUid + 1}:*` }, { uid: true })) || [];
        uids = found.filter((uid) => uid > cursor.lastUid);
      }
      for (const uid of Object.keys(cursor.pending)) uids.push(Number(uid));
      uids = [...new Set(uids)].sort((a, b) => a - b);

      // One round trip for the metadata of all of them. fetch() must be drained
      // before the next command, so collect first and decide afterwards.
      const metas = new Map<number, FetchMessageObject>();
      for (let i = 0; i < uids.length; i += METADATA_CHUNK) {
        const chunk = uids.slice(i, i + METADATA_CHUNK);
        const messages = client.fetch(
          toSequenceSet(chunk),
          { uid: true, envelope: true, bodyStructure: true, size: true },
          { uid: true }
        );
        for await (const message of messages) metas.set(message.uid, message);
      }

      const mails: FetchedMail[] = [];
      const failed: FailedMail[] = [];
      const oversized: FetchResult["oversized"] = [];
      let examined = 0;
      let bufferedBytes = 0;
      let highest = cursor.lastUid;
      let complete = true;

      for (const uid of uids) {
        const meta = metas.get(uid);
        if (!meta) {
          // Deleted or moved since it was listed. Nothing to pass over.
          delete cursor.pending[String(uid)];
          continue;
        }

        const messageId = meta.envelope?.messageId || null;
        const subject = meta.envelope?.subject || "";
        const size = meta.size ?? 0;

        if (messageId && processedIds.has(messageId)) {
          delete cursor.pending[String(uid)];
          highest = Math.max(highest, uid);
          continue;
        }

        if (!hasCandidateAttachment(meta.bodyStructure)) {
          examined++;
          delete cursor.pending[String(uid)];
          highest = Math.max(highest, uid);
          continue;
        }

        if (size > limits.maxMessageBytes) {
          examined++;
          oversized.push({ uid, subject, size });
          delete cursor.pending[String(uid)];
          highest = Math.max(highest, uid);
          continue;
        }

        const budgetUsed =
          mails.length >= limits.maxMails ||
          (mails.length > 0 && bufferedBytes + size > limits.maxTotalBytes);
        if (budgetUsed) {
          complete = false;
          break;
        }

        examined++;
        try {
          const full = await client.fetchOne(String(uid), { source: true }, { uid: true });
          if (full && full.source) {
            mails.push({ uid, messageId, subject, source: full.source });
            bufferedBytes += full.source.length;
          } else {
            delete cursor.pending[String(uid)];
          }
          highest = Math.max(highest, uid);
        } catch {
          failed.push({ uid, messageId });
          highest = Math.max(highest, uid);
          if (!client.usable) {
            // Everything after this UID is picked up by the next poll.
            complete = false;
            connectionError = connectionError ?? "IMAP connection lost";
            break;
          }
        }
      }

      if (initialScan) {
        if (complete) {
          cursor.caughtUp = true;
          cursor.lastUid = Math.max(topUid, highest);
        }
      } else {
        cursor.lastUid = highest;
      }

      return { cursor, mails, failed, oversized, examined, initialScan, connectionError };
    } finally {
      try {
        lock.release();
      } catch {
        // The connection is already gone.
      }
    }
  } finally {
    try {
      if (client.usable) await client.logout();
      else client.close();
    } catch {
      // Nothing left to clean up.
    }
  }
}
