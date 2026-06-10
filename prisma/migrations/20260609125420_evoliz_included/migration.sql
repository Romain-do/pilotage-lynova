-- AlterTable
ALTER TABLE "evoliz_document" ADD COLUMN     "included" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "invoiceRef" TEXT;

-- CreateIndex
CREATE INDEX "evoliz_document_included_idx" ON "evoliz_document"("included");
