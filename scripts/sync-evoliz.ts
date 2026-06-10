/**
 * Synchronise le cache Evoliz (factures + avoirs) et affiche un résumé.
 *
 *   npm run sync:evoliz
 *
 * Variables requises (.env.local) : EVOLIZ_PUBLIC_KEY, EVOLIZ_SECRET_KEY
 * Optionnelle : EVOLIZ_COMPANY_ID
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { syncEvoliz } from "../src/lib/evoliz/sync";

const prisma = new PrismaClient();

const fmt = (n: number) =>
  new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(n);

async function main() {
  if (!process.env.EVOLIZ_PUBLIC_KEY || !process.env.EVOLIZ_SECRET_KEY) {
    console.error("ERREUR : EVOLIZ_PUBLIC_KEY et EVOLIZ_SECRET_KEY requis dans .env.local.");
    process.exit(1);
  }

  console.log("Synchronisation Evoliz en cours…");
  const s = await syncEvoliz(prisma);

  console.log("\n=== Résumé synchro Evoliz ===");
  console.log(`  Factures            : ${s.invoices}  (comptées ${s.invoicesCounted} · exclues ${s.invoicesExcluded})`);
  console.log(`  Avoirs              : ${s.credits}  (comptés ${s.creditsCounted} · exclus ${s.creditsExcluded}) — ressource ${s.creditResource ?? "—"}`);
  console.log(`  Total HT factures   : ${fmt(s.totalHtInvoices)}`);
  console.log(`  Total HT avoirs     : ${fmt(s.totalHtCredits)}`);
  console.log(`  >>> CA HT NET       : ${fmt(s.caHtNet)}`);
  console.log(`  Période couverte    : ${s.minDate ?? "—"} → ${s.maxDate ?? "—"}`);

  const inDb = await prisma.evolizDocument.count();
  console.log(`  Documents en cache  : ${inDb}`);

  if (s.excluded.length) {
    const totalExclHt = s.excluded
      .filter((e) => e.kind === "INVOICE")
      .reduce((sum, e) => sum + e.ht, 0);
    console.log(`\n── Documents EXCLUS du CA (${s.excluded.length}) — total HT factures exclues : ${fmt(totalExclHt)} ──`);
    for (const e of s.excluded) {
      console.log(
        `   • [${e.kind === "INVOICE" ? "Facture" : "Avoir"}] ${e.documentNumber ?? "(sans n°)"}  ${fmt(e.ht)} HT  → ${e.reason} (status=${e.status ?? "?"})`
      );
    }
  }
}

main()
  .catch((e) => {
    console.error("Échec synchro Evoliz :", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
