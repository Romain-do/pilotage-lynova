import { requireDirigeant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getTresorerie } from "@/lib/tresorerie-data";
import { lastSyncAll } from "@/lib/sync-state";
import { AppNav } from "@/components/AppNav";
import { Tresorerie } from "./Tresorerie";

// Vue Trésorerie (§5.4-5.7) — DIRIGEANT seul, lecture seule (cache Revolut).
export const dynamic = "force-dynamic";
// La synchro manuelle (refreshAll) s'exécute dans cette route → marge anti-timeout.
export const maxDuration = 60;

export default async function TresoreriePage() {
  await requireDirigeant();
  const [data, lastSync] = await Promise.all([getTresorerie(), lastSyncAll(prisma)]);
  data.lastSync = lastSync; // « maj » globale (Evoliz + Revolut), cohérente avec le bouton unifié
  const todayISO = new Date().toISOString().slice(0, 10);

  return (
    <main className="flex flex-1 flex-col bg-cloud">
      <AppNav role="DIRIGEANT" />

      {data.accounts.length === 0 ? (
        <section className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
          <h1 className="text-2xl font-semibold text-navy">Aucune donnée de trésorerie</h1>
          <p className="mt-2 text-navy/60">
            Lancez la synchronisation Revolut (<code>npm run sync:revolut</code>) pour alimenter le cache.
          </p>
        </section>
      ) : (
        <Tresorerie data={data} todayISO={todayISO} />
      )}
    </main>
  );
}
