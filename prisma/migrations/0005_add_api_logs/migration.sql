-- CreateTable
CREATE TABLE "ApiLog" (
    "id" TEXT NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "type" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "model" TEXT,
    "durationMs" INTEGER NOT NULL,
    "inputTokens" INTEGER,
    "outputTokens" INTEGER,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "metadata" JSONB,

    CONSTRAINT "ApiLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ApiLog_timestamp_idx" ON "ApiLog"("timestamp" DESC);

-- CreateIndex
CREATE INDEX "ApiLog_type_idx" ON "ApiLog"("type");
