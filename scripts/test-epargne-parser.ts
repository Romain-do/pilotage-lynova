// Test manuel du parseur CSV Revolut perso, sur les fixtures (aucune donnée bancaire réelle).
// Usage : npx tsx scripts/test-epargne-parser.ts
// N'écrit rien en base : vérifie juste que le parsing/décodage/dédoublonnage se comporte comme attendu.

import { readFileSync } from "fs";
import { join } from "path";
import { parseRevolutCsv } from "../src/lib/epargne/csv";
import { categorizeExpense, merchantKeyOf, isSavingsTransfer, mentionsHouseholdMember, isHouseholdRefundCredit, isExpenseRow } from "../src/lib/epargne/categorize";

const csv = readFileSync(join(__dirname, "..", "fixtures", "epargne-revolut-sample.csv"), "utf8");
const res = parseRevolutCsv(csv);

console.log("Lignes valides :", res.rows.length);
console.log("Exclues — RENVOYÉ :", res.excludedReverted);
console.log("Exclues — devise ≠ EUR :", res.excludedOtherCurrency);
console.log("Exclues — produit inconnu :", res.excludedUnknownProduct);
console.log("Exclues — illisibles :", res.malformed);
console.log("Avertissements :", res.warnings);
console.log("\nTransactions :");
for (const r of res.rows) {
  console.log(
    `  [${r.account}] ${r.startedAt.toISOString()} ${r.amount.padStart(9)} EUR — "${r.description}" — hash ${r.dedupeHash.slice(0, 12)}…`,
  );
}

// Assertions minimales attendues sur les fixtures.
const expect = (label: string, actual: unknown, wanted: unknown) => {
  const ok = actual === wanted;
  console.log(`${ok ? "✓" : "✗"} ${label} : ${actual}${ok ? "" : ` (attendu ${wanted})`}`);
  if (!ok) process.exitCode = 1;
};

console.log("\nContrôles :");
expect("4 lignes valides (dont doublon Bricomarché fusionné)", res.rows.length, 4);
expect("1 ligne RENVOYÉ exclue", res.excludedReverted, 1);
expect("1 ligne GBP exclue", res.excludedOtherCurrency, 1);
// Entité HTML décodée (&#39; → ')
const interets = res.rows.find((r) => r.description.startsWith("Intérêts nets"));
expect("entité HTML décodée + virgule dans les guillemets préservée", interets?.description, "Intérêts nets versés pour Compte d'épargne le Nov 3, 2025");
const cafe = res.rows.find((r) => r.description.startsWith("Café"));
expect("entités &#39; et &amp; décodées", cafe?.description, "Café, croissant & jus d'orange");

console.log("\nCatégorisation (règles génériques) :");
const cat = (type: string, desc: string) => categorizeExpense(type, desc);
expect("Bricomarché → Maison & bricolage", cat("Paiement par carte", "Bricomarché"), "Maison & bricolage");
expect("Carrefour → Alimentation", cat("Paiement par carte", "CARREFOUR MARKET"), "Alimentation");
expect("Café → Restaurants & bars", cat("Paiement par carte", "Café, croissant & jus d'orange"), "Restaurants & bars");
expect("Uber → Transport & carburant", cat("Paiement par carte", "Uber BV"), "Transport & carburant");
expect("Uber Eats → Restaurants & bars", cat("Paiement par carte", "Uber Eats"), "Restaurants & bars");
expect("SNCF → Transport & carburant", cat("Paiement par carte", "SNCF INTERNET"), "Transport & carburant");
expect("Netflix → Abonnements", cat("Prélèvement", "NETFLIX.COM"), "Abonnements");
expect("Pharmacie → Santé & pharmacie", cat("Paiement par carte", "PHARMACIE DU CENTRE"), "Santé & pharmacie");
expect("Vétérinaire → Animaux", cat("Paiement par carte", "CLINIQUE VETERINAIRE"), "Animaux");
expect("Leroy Merlin → Maison & bricolage", cat("Paiement par carte", "LEROY MERLIN"), "Maison & bricolage");
expect("Retrait → Retraits", cat("Retrait", "Distributeur BNP"), "Retraits");
expect("Inconnu → Autres", cat("Paiement par carte", "XYZ 4213 QUELQUE CHOSE"), "Autres");

console.log("\nCatégorisation (nouvelles catégories) :");
expect("URSSAF → Impôts / URSSAF", cat("Virement", "Urssaf Rhone Alpes"), "Impôts / URSSAF");
expect("DDFIP → Impôts / URSSAF", cat("Virement", "Ddfip Des Yvelines"), "Impôts / URSSAF");
expect("taxe (pas taxi) → Impôts / URSSAF", cat("Prélèvement", "TRESOR PUBLIC TAXE FONCIERE"), "Impôts / URSSAF");
expect("taxi reste Transport (pas Impôts)", cat("Paiement par carte", "TAXI G7 PARIS"), "Transport & carburant");
expect("Virement Romain → Virements Romain", cat("Virement", "Virement à : ROMAIN IOLI"), "Virements Romain");
expect("Virement Meg → Virements Meg", cat("Virement", "Virement à : MEGANNE QUIGNARD"), "Virements Meg");
expect("To QUIGNARD → Virements Meg", cat("Virement", "To QUIGNARD"), "Virements Meg");
expect("Jean Dupont ≠ Meg → Virements divers", cat("Virement", "To Jean Dupont"), "Virements divers");
expect("salade romaine ≠ Romain", cat("Paiement par carte", "PRIMEUR SALADE ROMAINE"), "Alimentation");
expect("Virement quelconque → Virements divers", cat("Virement", "To Luc Bernard"), "Virements divers");
expect("Jouéclub → Jouets / Cadeaux", cat("Paiement par carte", "JOUECLUB"), "Jouets / Cadeaux");
expect("King Jouet → Jouets / Cadeaux", cat("Paiement par carte", "King Jouet"), "Jouets / Cadeaux");
expect("Sephora → Beauté / Coiffure (avant Shopping)", cat("Paiement par carte", "SEPHORA"), "Beauté / Coiffure");
expect("Salon de coiffure → Beauté / Coiffure", cat("Paiement par carte", "SALON DE COIFFURE LILI"), "Beauté / Coiffure");
expect("Clopinette → Cigarette électronique", cat("Paiement par carte", "CLOPINETTE"), "Cigarette électronique");
expect("Vape → Cigarette électronique", cat("Paiement par carte", "MA VAPE SHOP"), "Cigarette électronique");
expect("Amazon → Amazon", cat("Paiement par carte", "Amazon.fr*AB12CD"), "Amazon");
expect("AMZN Mktp → Amazon", cat("Paiement par carte", "AMZN Mktp DE"), "Amazon");
expect("Amazon Prime → Abonnements (pas Amazon)", cat("Prélèvement", "Amazon Prime*XYZ"), "Abonnements");

console.log("\nDivers :");
expect("mapping mémorisé prioritaire sur les règles",
  categorizeExpense("Paiement par carte", "Bricomarché", new Map([[merchantKeyOf("Bricomarché"), "Alimentation"]])),
  "Alimentation");
expect("virement épargne détecté", isSavingsTransfer("À EUR Compte d'épargne"), true);
expect("dépense normale non détectée comme épargne", isSavingsTransfer("Bricomarché"), false);

console.log("\nDétection foyer (remboursements Meg/Romain, entrants + sortants) :");
expect("crédit entrant Romain reconnu", mentionsHouseholdMember("Virement de : ROMAIN IOLI"), true);
expect("crédit entrant Meg reconnu", mentionsHouseholdMember("Virement de : MEGANNE QUIGNARD"), true);
expect("débit sortant Meg reconnu", mentionsHouseholdMember("To QUIGNARD"), true);
expect("tiers (Jean Dupont) NON reconnu", mentionsHouseholdMember("To Jean Dupont"), false);
expect("marchand quelconque NON reconnu", mentionsHouseholdMember("Urssaf Rhone Alpes"), false);

console.log("\nCandidats remboursement (crédits retenus) :");
expect("crédit Virement de Romain retenu", isHouseholdRefundCredit("Virement", "Virement de : ROMAIN IOLI"), true);
expect("crédit Virement de Meg retenu", isHouseholdRefundCredit("Virement", "Virement de : MEGANNE QUIGNARD"), true);
expect("transfert entrant depuis l'épargne EXCLU", isHouseholdRefundCredit("Virement", "À partir de EUR Compte d'épargne"), false);
expect("transfert épargne mentionnant un nom resterait EXCLU", isHouseholdRefundCredit("Virement", "Virement Romain vers Compte d'épargne"), false);
expect("crédit d'un tiers NON retenu", isHouseholdRefundCredit("Virement", "Virement de : JEAN DUPONT"), false);
expect("crédit non-virement (intérêts) NON retenu", isHouseholdRefundCredit("Intérêts", "Intérêts nets Romain"), false);

console.log("\nPérimètre « dépenses » (isExpenseRow) — hors virements foyer & épargne :");
const dep = (amount: number, description: string) => isExpenseRow({ amount, description });
expect("dépense carte normale = dépense", dep(-40.24, "Bricomarché"), true);
expect("virement à Romain EXCLU des dépenses", dep(-500, "Virement à : ROMAIN IOLI"), false);
expect("virement à Meg EXCLU des dépenses", dep(-500, "Virement à : MEGANNE QUIGNARD"), false);
expect("To QUIGNARD EXCLU des dépenses", dep(-60, "To QUIGNARD"), false);
expect("transfert épargne EXCLU des dépenses", dep(-12000, "À EUR Compte d'épargne"), false);
expect("virement à un tiers RESTE une dépense", dep(-250, "To Luc Bernard"), true);
expect("impôt/URSSAF RESTE une dépense", dep(-320, "Urssaf Rhone Alpes"), true);
expect("crédit (montant positif) n'est pas une dépense", dep(120, "Remboursement"), false);
