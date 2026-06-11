-- Bascule société/contact (correction de l'import Trello).
-- `name` contenait en réalité la société : elle migre vers `company` (titre des cartes) et
-- `name` redevient le champ « contact » (personne), désormais optionnel.
-- Cette migration ne touche QUE le schéma (colonne nullable). La bascule des données
-- (company = name, name vidé) est faite par scripts/tmp-migrate-company.mjs --apply,
-- qui ne s'exécute proprement qu'une fois la colonne devenue nullable.

-- AlterTable
ALTER TABLE "prospect" ALTER COLUMN "name" DROP NOT NULL;
