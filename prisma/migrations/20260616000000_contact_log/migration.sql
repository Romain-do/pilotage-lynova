-- Anti-double-envoi : trace des envois sortants vers un prospect (présentation, synthèse RDV, RDV).
-- Une ligne par envoi RÉUSSI. `live` = envoi réel (prod) vs test (redirigé vers romain@lynova.net).
-- RLS « deny by default » comme toutes les tables applicatives (cf. 20260610153359_enable_rls) :
-- l'app y accède UNIQUEMENT via Prisma (rôle propriétaire) ; l'API PostgREST publique est refusée.

-- CreateEnum
CREATE TYPE "ContactType" AS ENUM ('PRESENTATION', 'RDV_SYNTHESIS', 'MEETING');

-- CreateTable
CREATE TABLE "contact_log" (
    "id" UUID NOT NULL,
    "prospectId" UUID NOT NULL,
    "type" "ContactType" NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "sentById" UUID,
    "sentByName" TEXT,
    "recipient" TEXT NOT NULL,
    "live" BOOLEAN NOT NULL,

    CONSTRAINT "contact_log_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contact_log_prospectId_type_sentAt_idx" ON "contact_log"("prospectId", "type", "sentAt");

-- AddForeignKey
ALTER TABLE "contact_log" ADD CONSTRAINT "contact_log_prospectId_fkey" FOREIGN KEY ("prospectId") REFERENCES "prospect"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Sécurité (§3) : RLS deny-by-default — réversible via ALTER TABLE "contact_log" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "contact_log" ENABLE ROW LEVEL SECURITY;
