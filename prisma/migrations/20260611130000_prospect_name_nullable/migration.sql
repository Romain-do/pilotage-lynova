-- Bascule société/contact (correction de l'import Trello).
-- `name` contenait en réalité la société : elle migre vers `company` (titre des cartes) et
-- `name` redevient le champ « contact » (personne), désormais optionnel.
-- Cette migration ne touche QUE le schéma (colonne nullable). La bascule des données
-- associée — pour chaque prospect dont `company` est vide : company = name, puis name
-- vidé (ceux qui ont déjà une `company` ne sont jamais modifiés) — a été appliquée une
-- fois la colonne devenue nullable, sur les données historiques de l'import Trello.

-- AlterTable
ALTER TABLE "prospect" ALTER COLUMN "name" DROP NOT NULL;
