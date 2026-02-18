-- CreateTable
CREATE TABLE "MatchingRule" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "matchField" TEXT NOT NULL,
    "matchOperator" TEXT NOT NULL,
    "matchValue" TEXT NOT NULL,
    "setCorrespondentId" TEXT,
    "setDocumentTypeId" TEXT,
    "addTagIds" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MatchingRule_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MatchingRule_active_order_idx" ON "MatchingRule"("active", "order");

-- AddForeignKey
ALTER TABLE "MatchingRule" ADD CONSTRAINT "MatchingRule_setCorrespondentId_fkey"
    FOREIGN KEY ("setCorrespondentId") REFERENCES "Correspondent"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MatchingRule" ADD CONSTRAINT "MatchingRule_setDocumentTypeId_fkey"
    FOREIGN KEY ("setDocumentTypeId") REFERENCES "DocumentType"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;
