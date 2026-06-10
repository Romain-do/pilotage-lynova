/**
 * Synchronise le cache des achats Evoliz (GET /buys) et affiche un résumé.
 *   npm run sync:buys
 * Variables requises (.env.local) : EVOLIZ_PUBLIC_KEY, EVOLIZ_SECRET_KEY.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { syncEvolizBuys } from "../src/lib/evoliz/sync";

const prisma = new PrismaClient();
const fmt = (n: number) => new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

async function main() {
  if (!process.env.EVOLIZ_PUBLIC_KEY || !process.env.EVOLIZ_SECRET_KEY) {
    console.error("ERREUR : EVOLIZ_PUBLIC_KEY et EVOLIZ_SECRET_KEY requis dans .env.local.");
    process.exit(1);
  }
  console.log("Synchronisation des achats Evoliz…");
  const s = await syncEvolizBuys(prisma);
  console.log("\n=== Résumé achats ===");
  console.log(`  Achats récupérés       : ${s.buys}`);
  console.log(`  Achats comptés (inclus): ${s.buysIncluded}`);
  console.log(`  Total HT achats        : ${fmt(s.totalHt)}`);
  console.log(`  Achats rabattus (repli): ${s.itemsFallback}`);
  console.log(`  Période                : ${s.minDate ?? "—"} → ${s.maxDate ?? "—"}`);

  const items = await prisma.evolizBuyItem.count();
  console.log(`  Lignes en cache        : ${items}`);
}

main()
  .catch((e) => {
    console.error("Échec synchro achats :", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
