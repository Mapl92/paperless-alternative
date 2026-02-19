-- CreateTable
CREATE TABLE "DocumentRelation" (
    "id" TEXT NOT NULL,
    "sourceDocumentId" TEXT NOT NULL,
    "targetDocumentId" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'related',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DocumentRelation_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DocumentRelation_sourceDocumentId_idx" ON "DocumentRelation"("sourceDocumentId");

-- CreateIndex
CREATE INDEX "DocumentRelation_targetDocumentId_idx" ON "DocumentRelation"("targetDocumentId");

-- CreateIndex
CREATE UNIQUE INDEX "DocumentRelation_sourceDocumentId_targetDocumentId_key" ON "DocumentRelation"("sourceDocumentId", "targetDocumentId");

-- AddForeignKey
ALTER TABLE "DocumentRelation" ADD CONSTRAINT "DocumentRelation_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DocumentRelation" ADD CONSTRAINT "DocumentRelation_targetDocumentId_fkey" FOREIGN KEY ("targetDocumentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
