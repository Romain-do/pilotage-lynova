-- Épargne perso (Revolut personnel, import CSV) — Lot 1 : modèle de données.
-- Deux tables : perso_transaction (lignes importées, dédoublonnées par dedupeHash UNIQUE)
-- et merchant_category (corrections marchand → catégorie, pour le Lot 2).
-- Appliquer via `prisma migrate deploy` (PAS `migrate dev` : la shadow DB Supabase casse).
-- RLS deny-by-default comme toutes les tables applicatives (cf. 20260610153359_enable_rls) :
-- l'app y accède UNIQUEMENT via Prisma (rôle propriétaire) ; l'API PostgREST publique est refusée.

-- CreateEnum
CREATE TYPE "PersoAccount" AS ENUM ('COURANT', 'EPARGNE');

-- CreateTable
CREATE TABLE "perso_transaction" (
    "id" UUID NOT NULL,
    "account" "PersoAccount" NOT NULL,
    "type" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "fee" DECIMAL(14,2) NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL,
    "completedAt" TIMESTAMP(3),
    "balance" DECIMAL(14,2) NOT NULL,
    "state" TEXT NOT NULL,
    "category" TEXT,
    "dedupeHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "perso_transaction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "merchant_category" (
    "id" UUID NOT NULL,
    "merchantKey" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchant_category_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "perso_transaction_dedupeHash_key" ON "perso_transaction"("dedupeHash");

-- CreateIndex
CREATE INDEX "perso_transaction_account_startedAt_idx" ON "perso_transaction"("account", "startedAt");

-- CreateIndex
CREATE UNIQUE INDEX "merchant_category_merchantKey_key" ON "merchant_category"("merchantKey");

-- Sécurité (§3) : RLS deny-by-default — réversible via ALTER TABLE "<table>" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "perso_transaction" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "merchant_category" ENABLE ROW LEVEL SECURITY;
