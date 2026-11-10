// Pure helpers for the e-mail import. No I/O in here, so they can be tested
// without a mail server or database.

export const ACCEPTED_ATTACHMENT_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/jpg",
  "image/tiff",
  "image/webp",
  "image/bmp",
  "image/gif",
]);

const EXTENSION_MIME: Record<string, string> = {
  ".pdf": "application/pdf",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".tif": "image/tiff",
  ".tiff": "image/tiff",
  ".webp": "image/webp",
  ".bmp": "image/bmp",
  ".gif": "image/gif",
};

const MIME_EXTENSION: Record<string, string> = {
  "application/pdf": ".pdf",
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/jpg": ".jpg",
  "image/tiff": ".tiff",
  "image/webp": ".webp",
  "image/bmp": ".bmp",
  "image/gif": ".gif",
};

export function extensionOf(filename?: string | null): string {
  if (!filename) return "";
  return filename.toLowerCase().match(/\.[^.]+$/)?.[0] ?? "";
}

/**
 * MIME type to store for an attachment, or null if the attachment is not a
 * supported document. Mail clients often send files as
 * application/octet-stream, so the file extension decides when the declared
 * type is not one we know.
 */
export function resolveAttachmentMime(
  contentType: string | undefined | null,
  filename?: string | null
): string | null {
  const declared = (contentType ?? "").toLowerCase().split(";")[0].trim();
  if (ACCEPTED_ATTACHMENT_TYPES.has(declared)) return declared;
  return EXTENSION_MIME[extensionOf(filename)] ?? null;
}

export function defaultExtensionFor(mimeType: string): string {
  return MIME_EXTENSION[mimeType] ?? ".pdf";
}

/** The subset of an IMAP BODYSTRUCTURE node this module looks at. */
export interface StructureNode {
  type?: string;
  childNodes?: StructureNode[];
}

// Non-text parts that never contain a document worth importing.
const IGNORED_PART_TYPES = new Set([
  "application/pkcs7-signature",
  "application/x-pkcs7-signature",
  "application/pgp-signature",
  "application/pgp-encrypted",
  "application/ics",
  "message/delivery-status",
  "message/disposition-notification",
]);

/**
 * Whether a message might carry an importable attachment, judged from its
 * BODYSTRUCTURE alone. Deliberately generous: any non-text part counts, and a
 * missing structure counts too. A false "yes" only costs one download; a false
 * "no" would silently drop a document.
 */
export function hasCandidateAttachment(structure: StructureNode | undefined | null): boolean {
  if (!structure) return true;

  const walk = (node: StructureNode): boolean => {
    if (node.childNodes && node.childNodes.length > 0) {
      return node.childNodes.some(walk);
    }
    const type = (node.type ?? "").toLowerCase();
    if (!type) return true;
    if (type.startsWith("multipart/")) return false;
    if (IGNORED_PART_TYPES.has(type)) return false;
    if (type.startsWith("text/")) return false;
    return true;
  };

  return walk(structure);
}

export interface ImageInfo {
  /** Size of the decoded image in bytes. */
  size: number;
  width?: number;
  height?: number;
  /** Image is embedded in the mail body (multipart/related or referenced by Content-ID). */
  embedded: boolean;
}

const TINY_IMAGE_BYTES = 20 * 1024;
const EMBEDDED_IMAGE_BYTES = 150 * 1024;
const MIN_DOCUMENT_SIDE_PX = 500;

/**
 * Logos, signature graphics, icons and tracking pixels arrive as image
 * attachments but are not documents. A scan or a photo of a document is large
 * in both bytes and pixels; these are not.
 */
export function isLikelyDecorativeImage(info: ImageInfo): boolean {
  if (info.size < TINY_IMAGE_BYTES) return true;
  if (info.width && info.height && Math.min(info.width, info.height) < MIN_DOCUMENT_SIDE_PX) {
    return true;
  }
  if (info.embedded && info.size < EMBEDDED_IMAGE_BYTES) return true;
  return false;
}

/** Compact IMAP sequence set for a list of UIDs, e.g. [1,2,3,7] → "1:3,7". */
export function toSequenceSet(uids: number[]): string {
  const sorted = [...new Set(uids)].sort((a, b) => a - b);
  const parts: string[] = [];
  let start = sorted[0];
  let prev = sorted[0];
  for (let i = 1; i <= sorted.length; i++) {
    const current = sorted[i];
    if (current === prev + 1) {
      prev = current;
      continue;
    }
    parts.push(start === prev ? String(start) : `${start}:${prev}`);
    start = current;
    prev = current;
  }
  return parts.join(",");
}
