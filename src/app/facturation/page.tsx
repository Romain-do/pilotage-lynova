import { requireDirigeant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTresorerie } from "@/lib/tresorerie-data";
import { getEvolizInvoices, getEvolizBuys } from "@/lib/facturation-data";
import { lastSyncAll } from "@/lib/sync-state";
import { AppNav } from "@/components/AppNav";
import { Facturation } from "./Facturation";

// Vue Facturation (§5) — réservée au DIRIGEANT (donnée financière, §3).
export const dynamic = "force-dynamic";
// La synchro manuelle (refreshAll) s'exécute dans cette route → marge anti-timeout.
export const maxDuration = 60;

export default async function FacturationPage() {
  await requireDirigeant();

  // Données Evoliz + Revolut mises en cache (loaders globaux, invalidés à la synchro).
  // « Dernière synchro » non cachée (lastSyncAll) → reflète toujours l'état réel.
  const [factDocs, buysData, treso, lastSync] = await Promise.all([
    getEvolizInvoices(),
    getEvolizBuys(),
    getTresorerie(),
    lastSyncAll(prisma),
  ]);

  const buys = buysData.buys;
  const buyItems = buysData.items;

  const todayISO = new Date().toISOString().slice(0, 10);

  return (
    <main className="flex flex-1 flex-col bg-cloud">
      <AppNav role="DIRIGEANT" />

      {factDocs.length === 0 ? (
        <section className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          <h1 className="text-2xl font-semibold text-navy">Aucune donnée de facturation</h1>
          <p className="mt-2 text-navy/60">
            Lancez la synchronisation Evoliz (<code>npm run sync:evoliz</code>) pour alimenter le cache.
          </p>
        </section>
      ) : (
        <Facturation
          docs={factDocs}
          buys={buys}
          buyItems={buyItems}
          outflows={treso.outflows}
          todayISO={todayISO}
          lastSync={lastSync}
        />
      )}
    </main>
  );
}
