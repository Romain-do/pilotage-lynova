// Backfill des catégories de dépenses du compte COURANT (Lot 2).
// Applique mapping mémorisé → règles → « Autres » à toutes les transactions déjà importées.
// Usage : `npm run backfill:epargne-cats` (charge .env.local via dotenv-cli avant tsx).
// Idempotent : ré-exécutable sans effet de bord (n'écrit que les catégories qui changent).
import { recategorizeAllCourant } from "@/lib/epargne/report";
import { prisma } from "@/lib/prisma";

async function main() {
  const { scanned, updated } = await recategorizeAllCourant();
  console.log(`Backfill catégories COURANT — ${scanned} ligne(s) examinée(s), ${updated} mise(s) à jour.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
