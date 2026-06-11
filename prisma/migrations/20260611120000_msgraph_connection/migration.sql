-- Microsoft 365 / Graph : table de connexion OAuth (RDV Outlook + Teams).
--
-- Stocke le refresh token (secret long terme) CÔTÉ SERVEUR. Table singleton : une seule
-- ligne d'id "default". L'app y accède uniquement via Prisma (DATABASE_URL, rôle
-- propriétaire) ; la RLS est activée « deny by default » comme sur toutes les autres
-- tables applicatives (cf. migration 20260610153359_enable_rls), pour qu'aucune clé anon
-- publique ne puisse lire ce secret via l'API PostgREST de Supabase.

-- CreateTable
CREATE TABLE "msgraph_connection" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "refreshToken" TEXT NOT NULL,
    "accountEmail" TEXT,
    "accountName" TEXT,
    "scope" TEXT,
    "connectedById" UUID,
    "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "msgraph_connection_pkey" PRIMARY KEY ("id")
);

-- Sécurité (§3) : RLS « deny by default » (aucune policy permissive) — réversible via
-- ALTER TABLE "msgraph_connection" DISABLE ROW LEVEL SECURITY;
ALTER TABLE "msgraph_connection" ENABLE ROW LEVEL SECURITY;
