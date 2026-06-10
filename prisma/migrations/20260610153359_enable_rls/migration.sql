-- Sécurité (§3) : active la Row Level Security sur TOUTES les tables applicatives.
--
-- Pourquoi : la clé anon Supabase est publique (NEXT_PUBLIC_SUPABASE_ANON_KEY, livrée au
-- navigateur). Sans RLS, l'API PostgREST de Supabase (https://<projet>.supabase.co/rest/v1/…)
-- exposerait en lecture toutes ces tables à quiconque détient cette clé, contournant le
-- RBAC serveur (requireDirigeant). On active donc la RLS en mode « deny by default ».
--
-- AUCUNE policy permissive n'est créée : par défaut, RLS activée + 0 policy = tout est
-- refusé pour les rôles soumis à la RLS (anon, authenticated). L'application n'est PAS
-- impactée car elle accède aux données UNIQUEMENT via Prisma (DATABASE_URL), qui se
-- connecte avec le rôle PROPRIÉTAIRE des tables ; un propriétaire de table BYPASSE la RLS
-- tant qu'on n'utilise pas FORCE ROW LEVEL SECURITY (volontairement non utilisé ici).
--
-- Réversible : ALTER TABLE "<table>" DISABLE ROW LEVEL SECURITY;

ALTER TABLE "app_user"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "magic_link_request"  ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pipeline"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "pipeline_stage"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prospect"            ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prospect_group"      ENABLE ROW LEVEL SECURITY;
ALTER TABLE "prospect_comment"    ENABLE ROW LEVEL SECURITY;
ALTER TABLE "evoliz_document"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "evoliz_buy"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "evoliz_buy_item"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "revolut_account"     ENABLE ROW LEVEL SECURITY;
ALTER TABLE "revolut_tx"          ENABLE ROW LEVEL SECURITY;
ALTER TABLE "revolut_leg"         ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sync_state"          ENABLE ROW LEVEL SECURITY;

-- Table interne de Prisma (présente dans public, donc exposée par PostgREST elle aussi).
ALTER TABLE "_prisma_migrations"  ENABLE ROW LEVEL SECURITY;
