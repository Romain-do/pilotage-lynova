-- CreateEnum
CREATE TYPE "RevolutAccountKind" AS ENUM ('FIAT', 'CRYPTO');

-- CreateTable
CREATE TABLE "revolut_account" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "currency" TEXT NOT NULL,
    "kind" "RevolutAccountKind" NOT NULL,
    "balance" DECIMAL(28,10) NOT NULL,
    "rateToEur" DECIMAL(28,10),
    "valoEur" DECIMAL(14,2),
    "state" TEXT,
    "syncedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "revolut_account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revolut_tx" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "reference" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "revolut_tx_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "revolut_leg" (
    "id" TEXT NOT NULL,
    "txId" TEXT NOT NULL,
    "accountId" TEXT,
    "currency" TEXT NOT NULL,
    "amount" DECIMAL(28,10) NOT NULL,
    "balanceAfter" DECIMAL(28,10),
    "description" TEXT,
    "counterpartyAccountId" TEXT,
    "internal" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "revolut_leg_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "revolut_tx_completedAt_idx" ON "revolut_tx"("completedAt");

-- CreateIndex
CREATE INDEX "revolut_leg_txId_idx" ON "revolut_leg"("txId");

-- CreateIndex
CREATE INDEX "revolut_leg_accountId_idx" ON "revolut_leg"("accountId");

-- AddForeignKey
ALTER TABLE "revolut_leg" ADD CONSTRAINT "revolut_leg_txId_fkey" FOREIGN KEY ("txId") REFERENCES "revolut_tx"("id") ON DELETE CASCADE ON UPDATE CASCADE;
