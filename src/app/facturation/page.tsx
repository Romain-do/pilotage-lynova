import { requireDirigeant } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { FactDoc, BuyDoc, BuyItemDoc } from "@/lib/facturation";
import { buildTresorerie } from "@/lib/tresorerie-data";
import { lastSyncAll } from "@/lib/sync-state";
import { AppNav } from "@/components/AppNav";
import { Facturation } from "./Facturation";

// Vue Facturation (§5) — réservée au DIRIGEANT (donnée financière, §3).
export const dynamic = "force-dynamic";
// La synchro manuelle (refreshAll) s'exécute dans cette route → marge anti-timeout.
export const maxDuration = 60;

export default async function FacturationPage() {
  await requireDirigeant();

  const [docs, lastSync, buyRows] = await Promise.all([
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
    // « Dernière synchro » globale (Evoliz + Revolut), cohérente avec le bouton unifié.
    lastSyncAll(prisma),
    // Achats fournisseurs (marge commerciale), avec lignes ventilées par catégorie.
    prisma.evolizBuy.findMany({
      where: { included: true },
      select: {
        documentDate: true,
        totalHt: true,
        supplierId: true,
        supplierName: true,
        items: { select: { categoryCode: true, categoryLabel: true, ht: true } },
      },
    }),
  ]);

  // Décaissements Revolut (charges nettes hors Evoliz : rémunération, loyer, électricité).
  // Lecture seule du cache Revolut, comme la vue Trésorerie.
  const treso = await buildTresorerie(prisma);

  const buys: BuyDoc[] = buyRows.map((b) => ({
    date: b.documentDate.toISOString().slice(0, 10),
    ht: Number(b.totalHt),
    supplierId: b.supplierId,
  }));
  const buyItems: BuyItemDoc[] = buyRows.flatMap((b) =>
    b.items.map((it) => ({
      date: b.documentDate.toISOString().slice(0, 10),
      supplierId: b.supplierId,
      supplierName: b.supplierName,
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
