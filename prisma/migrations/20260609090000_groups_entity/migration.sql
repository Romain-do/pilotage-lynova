-- Entité Group + reprise des valeurs texte `groupName` existantes.

-- CreateTable
CREATE TABLE "prospect_group" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "prospect_group_pkey" PRIMARY KEY ("id")
);

-- AlterTable : nouvelle clé étrangère
ALTER TABLE "prospect" ADD COLUMN "groupId" UUID;

-- Reprise des données : un groupe par `groupName` distinct, puis liaison des prospects.
INSERT INTO "prospect_group" ("id", "name", "color", "createdAt", "updatedAt")
SELECT gen_random_uuid(), s.gn, NULL, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM (SELECT DISTINCT "groupName" AS gn FROM "prospect" WHERE "groupName" IS NOT NULL) s;

UPDATE "prospect" p
SET "groupId" = g."id"
FROM "prospect_group" g
WHERE p."groupName" = g."name";

-- Suppression de l'ancienne colonne texte
ALTER TABLE "prospect" DROP COLUMN "groupName";

-- Index + contrainte
CREATE INDEX "prospect_groupId_idx" ON "prospect"("groupId");
ALTER TABLE "prospect" ADD CONSTRAINT "prospect_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "prospect_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;
