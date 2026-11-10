import { simpleParser } from "mailparser";
import {
  defaultExtensionFor,
  isLikelyDecorativeImage,
  resolveAttachmentMime,
} from "./attachments";

export interface ImportableAttachment {
  filename: string;
  mimeType: string;
  buffer: Buffer;
}

export interface ParsedMail {
  subject: string;
  attachments: ImportableAttachment[];
  /** Images left out because they look like logos, icons or signature graphics. */
  ignoredImages: number;
}

async function imageDimensions(
  buffer: Buffer
): Promise<{ width?: number; height?: number }> {
  try {
    const sharp = (await import("sharp")).default;
    const meta = await sharp(buffer).metadata();
    return { width: meta.width, height: meta.height };
  } catch {
    // Unknown format: let the size rules decide.
    return {};
  }
}

/** Parses a raw message and returns the attachments worth importing as documents. */
export async function extractAttachments(
  source: Buffer,
  fallbackSubject = ""
): Promise<ParsedMail> {
  const parsed = await simpleParser(source);
  const subject = parsed.subject || fallbackSubject || "E-Mail Import";

  const attachments: ImportableAttachment[] = [];
  let ignoredImages = 0;

  for (const attachment of parsed.attachments || []) {
    const mimeType = resolveAttachmentMime(attachment.contentType, attachment.filename);
    if (!mimeType) continue;

    const buffer = Buffer.from(attachment.content);

    if (mimeType !== "application/pdf") {
      const { width, height } = await imageDimensions(buffer);
      const embedded = attachment.related === true || Boolean(attachment.cid);
      if (isLikelyDecorativeImage({ size: buffer.length, width, height, embedded })) {
        ignoredImages++;
        continue;
      }
    }

    const filename =
      attachment.filename ||
      `${subject.replace(/[^a-zA-Z0-9äöüÄÖÜß\s-]/g, "_")}${defaultExtensionFor(mimeType)}`;

    attachments.push({ filename, mimeType, buffer });
  }

  return { subject, attachments, ignoredImages };
}
