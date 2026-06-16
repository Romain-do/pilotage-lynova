// Contrôle LECTURE SEULE de la fraîcheur des synchros (table SyncState).
// Usage : `npm run check:sync` (charge .env.local → vise la DB partagée local/prod).
// Sert à vérifier que le cron horaire (/api/cron/sync, planifié `0 * * * *`) tourne bien :
// si les trois sources sont récentes (< 3 h) sans clic « Actualiser », c'est le cron.
import { PrismaClient } from "@prisma/client";

const SOURCES = ["evoliz", "evoliz_buys", "revolut"];
const STALE_AFTER_MIN = 180; // 3 h — aligné sur STALE_AFTER_MS de src/lib/sync-state.ts

const prisma = new PrismaClient();

async function main() {
  const now = new Date();
  const rows = await prisma.syncState.findMany({
    where: { source: { in: SOURCES } },
    orderBy: { source: "asc" },
  });
  const bySource = new Map(rows.map((r) => [r.source, r]));

  console.log(`Heure actuelle (UTC) : ${now.toISOString()}\n`);
  for (const source of SOURCES) {
    const r = bySource.get(source);
    if (!r || !r.lastSyncAt) {
      console.log(`source=${source.padEnd(12)} lastSyncAt=null  (jamais synchronisé)  ⚠️ PÉRIMÉ`);
      continue;
    }
    const last = r.lastSyncAt.toISOString();
    const upd = r.updatedAt ? r.updatedAt.toISOString() : "null";
    const ageMin = Math.round((now.getTime() - r.lastSyncAt.getTime()) / 60000);
    const flag = ageMin > STALE_AFTER_MIN ? "⚠️ PÉRIMÉ" : "✓ frais";
    console.log(`source=${source.padEnd(12)} lastSyncAt=${last}  updatedAt=${upd}  age=${ageMin} min  ${flag}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
