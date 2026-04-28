-- CreateTable
CREATE TABLE "Contract" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "providerName" TEXT,
    "correspondentId" TEXT,
    "contractNumber" TEXT,
    "customerNumber" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "cancellationDeadline" TIMESTAMP(3),
    "cancellationPeriod" TEXT,
    "renewalInterval" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Contract_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractCost" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "billingInterval" TEXT NOT NULL DEFAULT 'monthly',
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "sourceDocumentId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractCost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractDocument" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'source',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ContractDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContractCandidate" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "contractId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "contractName" TEXT,
    "category" TEXT,
    "providerName" TEXT,
    "contractNumber" TEXT,
    "customerNumber" TEXT,
    "startDate" TIMESTAMP(3),
    "endDate" TIMESTAMP(3),
    "cancellationDeadline" TIMESTAMP(3),
    "cancellationPeriod" TEXT,
    "renewalInterval" TEXT,
    "amount" DECIMAL(12,2),
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "billingInterval" TEXT,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "evidence" JSONB NOT NULL DEFAULT '[]',
    "extractedData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ContractCandidate_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "Reminder" ADD COLUMN "contractId" TEXT;

-- CreateIndex
CREATE INDEX "Contract_status_idx" ON "Contract"("status");
CREATE INDEX "Contract_category_idx" ON "Contract"("category");
CREATE INDEX "Contract_correspondentId_idx" ON "Contract"("correspondentId");
CREATE INDEX "Contract_cancellationDeadline_idx" ON "Contract"("cancellationDeadline");
CREATE INDEX "Contract_endDate_idx" ON "Contract"("endDate");

CREATE INDEX "ContractCost_contractId_idx" ON "ContractCost"("contractId");
CREATE INDEX "ContractCost_sourceDocumentId_idx" ON "ContractCost"("sourceDocumentId");
CREATE INDEX "ContractCost_validFrom_idx" ON "ContractCost"("validFrom");

CREATE UNIQUE INDEX "ContractDocument_contractId_documentId_key" ON "ContractDocument"("contractId", "documentId");
CREATE INDEX "ContractDocument_contractId_idx" ON "ContractDocument"("contractId");
CREATE INDEX "ContractDocument_documentId_idx" ON "ContractDocument"("documentId");

CREATE UNIQUE INDEX "ContractCandidate_documentId_key" ON "ContractCandidate"("documentId");
CREATE INDEX "ContractCandidate_status_idx" ON "ContractCandidate"("status");
CREATE INDEX "ContractCandidate_contractId_idx" ON "ContractCandidate"("contractId");
CREATE INDEX "ContractCandidate_createdAt_idx" ON "ContractCandidate"("createdAt");

CREATE INDEX "Reminder_contractId_idx" ON "Reminder"("contractId");

-- AddForeignKey
ALTER TABLE "Contract" ADD CONSTRAINT "Contract_correspondentId_fkey"
    FOREIGN KEY ("correspondentId") REFERENCES "Correspondent"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContractCost" ADD CONSTRAINT "ContractCost_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContractCost" ADD CONSTRAINT "ContractCost_sourceDocumentId_fkey"
    FOREIGN KEY ("sourceDocumentId") REFERENCES "Document"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContractDocument" ADD CONSTRAINT "ContractDocument_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContractCandidate" ADD CONSTRAINT "ContractCandidate_documentId_fkey"
    FOREIGN KEY ("documentId") REFERENCES "Document"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ContractCandidate" ADD CONSTRAINT "ContractCandidate_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id")
    ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Reminder" ADD CONSTRAINT "Reminder_contractId_fkey"
    FOREIGN KEY ("contractId") REFERENCES "Contract"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
