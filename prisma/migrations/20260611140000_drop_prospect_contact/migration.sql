-- Suppression de la colonne `contact` de `prospect`.
-- Devenue inutilisée après la bascule société/contact (le contact vit désormais dans
-- `name`). La colonne était vide en base (0 valeur renseignée) → aucune perte de donnée.

-- AlterTable
ALTER TABLE "prospect" DROP COLUMN "contact";
