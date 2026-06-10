import Link from "next/link";
import { Logo } from "@/components/Logo";
import { requireDirigeant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { FactDoc, BuyDoc, BuyItemDoc } from "@/lib/facturation";
import { Facturation } from "./Facturation";

// Vue Facturation (§5) — réservée au DIRIGEANT (donnée financière, §3).
export const dynamic = "force-dynamic";

export default async function FacturationPage() {
  await requireDirigeant();

  const [docs, sync, buyRows] = await Promise.all([
    // CA brut (aligné Evoliz) : on ne lit que les factures validées ; les avoirs ne sont
    // jamais déduits du CA (kind = CREDIT ignoré).
    prisma.evolizDocument.findMany({
      where: { kind: "INVOICE", included: true },
      orderBy: { documentDate: "asc" },
      select: {
        kind: true,
        documentDate: true,
        totalHt: true,
        totalTtc: true,
        paid: true,
        netToPay: true,
        clientId: true,
        clientName: true,
      },
    }),
    prisma.syncState.findMany({ where: { source: { in: ["evoliz", "evoliz_buys"] } } }),
    // Achats fournisseurs (marge commerciale), avec lignes ventilées par catégorie.
    prisma.evolizBuy.findMany({
      where: { included: true },
      select: {
        documentDate: true,
        totalHt: true,
        items: { select: { categoryCode: true, categoryLabel: true, ht: true } },
      },
    }),
  ]);

  const buys: BuyDoc[] = buyRows.map((b) => ({
    date: b.documentDate.toISOString().slice(0, 10),
    ht: Number(b.totalHt),
  }));
  const buyItems: BuyItemDoc[] = buyRows.flatMap((b) =>
    b.items.map((it) => ({
      date: b.documentDate.toISOString().slice(0, 10),
      categoryCode: it.categoryCode,
      categoryLabel: it.categoryLabel,
      ht: Number(it.ht),
    }))
  );

  const factDocs: FactDoc[] = docs.map((d) => ({
    kind: d.kind,
    date: d.documentDate.toISOString().slice(0, 10),
    ht: Number(d.totalHt),
    ttc: Number(d.totalTtc),
    paid: Number(d.paid),
    netToPay: Number(d.netToPay),
    clientId: d.clientId,
    clientName: d.clientName,
  }));

  const todayISO = new Date().toISOString().slice(0, 10);
  // « Dernière synchro » = la plus ANCIENNE des deux sources (reflète un refresh complet).
  const syncDates = sync.map((s) => s.lastSyncAt).filter((d): d is Date => d != null);
  const lastSync =
    syncDates.length > 0
      ? new Date(Math.min(...syncDates.map((d) => d.getTime()))).toISOString()
      : null;

  return (
    <main className="flex flex-1 flex-col bg-cloud">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Logo className="text-lg text-white" />
            </Link>
            <span className="text-sm text-white/50">/ Facturation</span>
          </div>
          <Link
            href="/"
            className="rounded-md border border-white/20 px-3 py-1.5 text-sm text-white/90 hover:bg-white/10"
          >
            ← Cockpit
          </Link>
        </div>
      </header>

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
          todayISO={todayISO}
          lastSync={lastSync}
        />
      )}
    </main>
  );
}
