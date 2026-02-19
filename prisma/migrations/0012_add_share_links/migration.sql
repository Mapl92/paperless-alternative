CREATE TABLE "ShareLink" (
  "id"         TEXT NOT NULL,
  "token"      TEXT NOT NULL,
  "documentId" TEXT NOT NULL,
  "r2Key"      TEXT NOT NULL,
  "fileName"   TEXT NOT NULL,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "downloads"  INTEGER NOT NULL DEFAULT 0,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ShareLink_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ShareLink_token_key" ON "ShareLink"("token");
CREATE INDEX "ShareLink_documentId_idx" ON "ShareLink"("documentId");
CREATE INDEX "ShareLink_expiresAt_idx" ON "ShareLink"("expiresAt");

ALTER TABLE "ShareLink" ADD CONSTRAINT "ShareLink_documentId_fkey"
  FOREIGN KEY ("documentId") REFERENCES "Document"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;
