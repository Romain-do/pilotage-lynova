/**
 * Synchronise le cache Revolut (comptes + transactions, lecture seule) et affiche un résumé.
 *   npm run sync:revolut
 * Variables requises (.env.local) : REVOLUT_CLIENT_ID, REVOLUT_ISS, REVOLUT_PRIVATE_KEY, REVOLUT_REFRESH_TOKEN.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";
import { syncRevolut } from "../src/lib/revolut/sync";

const prisma = new PrismaClient();
const f = (n: number) => new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2 }).format(n);

async function main() {
  for (const v of ["REVOLUT_CLIENT_ID", "REVOLUT_ISS", "REVOLUT_PRIVATE_KEY", "REVOLUT_REFRESH_TOKEN"]) {
    if (!process.env[v]) { console.error(`ERREUR : ${v} manquant dans .env.local.`); process.exit(1); }
  }
  console.log("Synchronisation Revolut (lecture seule)…");
  const s = await syncRevolut(prisma);

  console.log("\n=== Comptes & liquidités ===");
  const accts = await prisma.revolutAccount.findMany({ orderBy: { valoEur: "desc" } });
  for (const a of accts) {
    console.log(
      `  [${a.kind}] ${a.currency.padEnd(5)} ${f(Number(a.balance)).padStart(16)}  ${a.valoEur != null ? f(Number(a.valoEur)) + " EUR" : "—"}  ${a.rateToEur != null ? "@" + Number(a.rateToEur) : ""}  « ${a.name ?? ""} »`
    );
  }
  console.log(`\n  Fiat   ≈ ${f(s.fiatEur)} EUR`);
  console.log(`  Crypto ≈ ${f(s.cryptoEur)} EUR`);
  console.log(`  TOTAL  ≈ ${f(s.totalEur)} EUR`);

  console.log(`\n=== Transactions : ${s.txCount} (${s.minDate} → ${s.maxDate}) ===`);
  console.log(`  Jambes internes neutralisées : ${s.internalLegs} · exchanges exclus : ${s.exchangeTx}`);
  console.log("\n  Flux EXTERNES EUR par mois (hors internes & exchanges) :");
  console.log("  Mois     Entrées        Sorties        Net");
  for (const m of s.monthly) {
    console.log(`  ${m.month}  ${f(m.in).padStart(12)}  ${f(m.out).padStart(12)}  ${f(m.in + m.out).padStart(12)}`);
  }
}

main()
  .catch((e) => { console.error("Échec synchro Revolut :", e instanceof Error ? e.message : e); process.exit(1); })
  .finally(() => prisma.$disconnect());
