CREATE TABLE "AuditLog" (
  "id"             TEXT NOT NULL,
  "timestamp"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "entityType"     TEXT NOT NULL,
  "entityId"       TEXT NOT NULL,
  "entityTitle"    TEXT,
  "action"         TEXT NOT NULL,
  "changesSummary" TEXT,
  "oldValues"      JSONB,
  "newValues"      JSONB,
  "source"         TEXT NOT NULL DEFAULT 'ui',
  "bulkId"         TEXT,
  CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "AuditLog_timestamp_idx" ON "AuditLog"("timestamp" DESC);
CREATE INDEX "AuditLog_entityType_entityId_idx" ON "AuditLog"("entityType", "entityId");
CREATE INDEX "AuditLog_action_idx" ON "AuditLog"("action");
