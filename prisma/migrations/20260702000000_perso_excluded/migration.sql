-- Neutralisation des avances remboursées (Lot 2b) : drapeau d'exclusion du budget.
-- Une transaction `excluded = true` reste visible (grisée) mais ne compte plus dans le rapport
-- de dépenses (total, catégories, variation). Non destructif (ajout de colonne avec défaut).
-- Appliquer via `prisma migrate deploy` (PAS `migrate dev` : la shadow DB Supabase casse).

ALTER TABLE "perso_transaction" ADD COLUMN "excluded" BOOLEAN NOT NULL DEFAULT false;
