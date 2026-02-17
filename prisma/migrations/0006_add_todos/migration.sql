-- CreateTable
CREATE TABLE "Todo" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "priority" INTEGER NOT NULL DEFAULT 4,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "documentId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Todo_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Todo_documentId_idx" ON "Todo"("documentId");

-- CreateIndex
CREATE INDEX "Todo_completed_idx" ON "Todo"("completed");

-- CreateIndex
CREATE INDEX "Todo_dueDate_idx" ON "Todo"("dueDate");

-- AddForeignKey
ALTER TABLE "Todo" ADD CONSTRAINT "Todo_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
