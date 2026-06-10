-- CreateTable
CREATE TABLE "evoliz_buy" (
    "id" UUID NOT NULL,
    "evolizId" INTEGER NOT NULL,
    "documentNumber" TEXT,
    "documentDate" TIMESTAMP(3) NOT NULL,
    "supplierId" INTEGER,
    "supplierName" TEXT,
    "totalHt" DECIMAL(12,2) NOT NULL,
    "status" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "included" BOOLEAN NOT NULL DEFAULT true,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evoliz_buy_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evoliz_buy_item" (
    "id" UUID NOT NULL,
    "buyId" UUID NOT NULL,
    "categoryCode" TEXT,
    "categoryLabel" TEXT,
    "ht" DECIMAL(12,2) NOT NULL,
    "fallback" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "evoliz_buy_item_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "evoliz_buy_evolizId_key" ON "evoliz_buy"("evolizId");

-- CreateIndex
CREATE INDEX "evoliz_buy_documentDate_idx" ON "evoliz_buy"("documentDate");

-- CreateIndex
CREATE INDEX "evoliz_buy_item_buyId_idx" ON "evoliz_buy_item"("buyId");

-- AddForeignKey
ALTER TABLE "evoliz_buy_item" ADD CONSTRAINT "evoliz_buy_item_buyId_fkey" FOREIGN KEY ("buyId") REFERENCES "evoliz_buy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
