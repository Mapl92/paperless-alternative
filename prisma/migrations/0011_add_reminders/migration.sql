CREATE TABLE "Reminder" (
  "id"         TEXT NOT NULL,
  "title"      TEXT NOT NULL,
  "note"       TEXT,
  "remindAt"   TIMESTAMP(3) NOT NULL,
  "dismissed"  BOOLEAN NOT NULL DEFAULT false,
  "documentId" TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "Reminder_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Reminder_dismissed_remindAt_idx" ON "Reminder"("dismissed", "remindAt");
CREATE INDEX "Reminder_documentId_idx" ON "Reminder"("documentId");

ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
