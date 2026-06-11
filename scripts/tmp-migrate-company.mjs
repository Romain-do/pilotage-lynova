// Bascule name → company pour les prospects issus de Trello (company vide).
//   Dry-run par défaut (aucune écriture). Ajouter --apply pour écrire.
// Règle : si company est vide/null → company = name, name = null. Ne touche JAMAIS
// les prospects dont company est déjà rempli.
import { PrismaClient } from "@prisma/client";
const p = new PrismaClient();
const APPLY = process.argv.includes("--apply");
const empty = (v) => v === null || v.trim() === "";

const all = await p.prospect.findMany({
  select: { id: true, name: true, company: true },
});
const concerned = all.filter((x) => empty(x.company));
const skipped = all.filter((x) => !empty(x.company));

console.log(APPLY ? "=== APPLICATION ===" : "=== DRY-RUN (aucune écriture) ===");
console.log(`Total          : ${all.length}`);
console.log(`Concernés      : ${concerned.length}  (company vide → company = name, name vidé)`);
console.log(`Intouchés      : ${skipped.length}  (company déjà rempli)`);

console.log("\n3 exemples AVANT → APRÈS :");
for (const x of concerned.slice(0, 3)) {
  console.log(`  AVANT  name=${JSON.stringify(x.name)}  company=${JSON.stringify(x.company)}`);
  console.log(`  APRÈS  name=${JSON.stringify(null)}  company=${JSON.stringify(x.name)}`);
  console.log("");
}

if (APPLY) {
  let n = 0;
  for (const x of concerned) {
    await p.prospect.update({
      where: { id: x.id },
      data: { company: x.name, name: null },
    });
    n++;
  }
  console.log(`✓ ${n} prospects mis à jour.`);
} else {
  console.log("(dry-run — relancer avec --apply pour écrire)");
}

await p.$disconnect();
