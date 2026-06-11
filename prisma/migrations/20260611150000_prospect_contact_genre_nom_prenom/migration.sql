-- Contact prospect détaillé : genre (civilité), nom, prénom — en remplacement de `name`.
-- `name` (ex-champ « contact » unique) était vide sur les 137 prospects → drop sans perte.
-- Les nouveaux champs sont nullables (contact optionnel ; la société reste le titre).

-- AlterTable
ALTER TABLE "prospect" ADD COLUMN "genre" TEXT;
ALTER TABLE "prospect" ADD COLUMN "nom" TEXT;
ALTER TABLE "prospect" ADD COLUMN "prenom" TEXT;
ALTER TABLE "prospect" DROP COLUMN "name";
