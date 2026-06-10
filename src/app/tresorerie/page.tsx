import Link from "next/link";
import { Logo } from "@/components/Logo";
import { requireDirigeant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { buildTresorerie } from "@/lib/tresorerie-data";
import { lastSyncAll } from "@/lib/sync-state";
import { Tresorerie } from "./Tresorerie";

// Vue Trésorerie (§5.4-5.7) — DIRIGEANT seul, lecture seule (cache Revolut).
export const dynamic = "force-dynamic";
// La synchro manuelle (refreshAll) s'exécute dans cette route → marge anti-timeout.
export const maxDuration = 60;

export default async function TresoreriePage() {
  await requireDirigeant();
  const [data, lastSync] = await Promise.all([buildTresorerie(prisma), lastSyncAll(prisma)]);
  data.lastSync = lastSync; // « maj » globale (Evoliz + Revolut), cohérente avec le bouton unifié
  const todayISO = new Date().toISOString().slice(0, 10);

  return (
    <main className="flex flex-1 flex-col bg-cloud">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Logo className="text-lg text-white" />
            </Link>
            <span className="text-sm text-white/50">/ Trésorerie</span>
          </div>
          <Link href="/" className="rounded-md border border-white/20 px-3 py-1.5 text-sm text-white/90 hover:bg-white/10">
            ← Cockpit
          </Link>
        </div>
      </header>

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
