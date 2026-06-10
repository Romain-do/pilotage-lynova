-- CreateEnum
CREATE TYPE "EvolizDocKind" AS ENUM ('INVOICE', 'CREDIT');

-- CreateTable
CREATE TABLE "evoliz_document" (
    "id" UUID NOT NULL,
    "kind" "EvolizDocKind" NOT NULL,
    "evolizId" INTEGER NOT NULL,
    "documentNumber" TEXT,
    "documentDate" TIMESTAMP(3) NOT NULL,
    "clientId" INTEGER,
    "clientName" TEXT,
    "totalHt" DECIMAL(12,2) NOT NULL,
    "totalTtc" DECIMAL(12,2) NOT NULL,
    "paid" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "netToPay" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "status" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evoliz_document_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sync_state" (
    "source" TEXT NOT NULL,
    "lastSyncAt" TIMESTAMP(3),
    "detail" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "sync_state_pkey" PRIMARY KEY ("source")
);

-- CreateIndex
CREATE INDEX "evoliz_document_documentDate_idx" ON "evoliz_document"("documentDate");

-- CreateIndex
CREATE UNIQUE INDEX "evoliz_document_kind_evolizId_key" ON "evoliz_document"("kind", "evolizId");
