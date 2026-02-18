import { prisma } from "@/lib/db/prisma";

export interface LogAuditEventParams {
  entityType: "document" | "tag" | "correspondent" | "documentType" | "rule";
  entityId: string;
  entityTitle?: string;
  action: "upload" | "update" | "trash" | "restore" | "delete" | "process" | "bulk";
  changesSummary?: string;
  oldValues?: Record<string, unknown>;
  newValues?: Record<string, unknown>;
  source?: "ui" | "email" | "consume" | "ai" | "rules";
  bulkId?: string;
}

// Field labels for human-readable diff summaries
const FIELD_LABELS: Record<string, string> = {
  title: "Titel",
  correspondentId: "Korrespondent",
  documentTypeId: "Dokumenttyp",
  documentDate: "Dokumentdatum",
  expiresAt: "Ablaufdatum",
  tags: "Tags",
};

// Fields to skip when building a diff
const IGNORED_FIELDS = new Set(["id", "updatedAt", "createdAt", "addedAt", "content", "originalFile", "archiveFile", "thumbnailFile", "checksum", "aiExtractedData"]);

/**
 * Build a human-readable summary of the changes between oldValues and newValues.
 * nameMap can provide resolved names for ID fields (e.g. correspondentId → "Telekom").
 */
export function buildChangesSummary(
  oldValues: Record<string, unknown>,
  newValues: Record<string, unknown>,
  nameMap?: Record<string, string>
): string {
  const parts: string[] = [];

  const allKeys = new Set([...Object.keys(oldValues), ...Object.keys(newValues)]);
  for (const key of allKeys) {
    if (IGNORED_FIELDS.has(key)) continue;

    const oldVal = oldValues[key];
    const newVal = newValues[key];

    // Skip if unchanged
    if (JSON.stringify(oldVal) === JSON.stringify(newVal)) continue;

    const label = FIELD_LABELS[key] ?? key;

    // Resolve IDs to names if provided
    const resolveVal = (v: unknown): string => {
      if (v === null || v === undefined) return "—";
      if (typeof v === "string" && nameMap?.[v]) return nameMap[v];
      if (typeof v === "object") return JSON.stringify(v);
      return String(v);
    };

    parts.push(`${label}: '${resolveVal(oldVal)}' → '${resolveVal(newVal)}'`);
  }

  return parts.join(", ");
}

/**
 * Fire-and-forget audit event logger. Silently catches its own errors.
 */
export function logAuditEvent(params: LogAuditEventParams): void {
  prisma.auditLog
    .create({
      data: {
        entityType: params.entityType,
        entityId: params.entityId,
        entityTitle: params.entityTitle,
        action: params.action,
        changesSummary: params.changesSummary,
        oldValues: params.oldValues ? JSON.parse(JSON.stringify(params.oldValues)) : undefined,
        newValues: params.newValues ? JSON.parse(JSON.stringify(params.newValues)) : undefined,
        source: params.source ?? "ui",
        bulkId: params.bulkId,
      },
    })
    .catch(() => {
      // silently ignore logging errors
    });
}
