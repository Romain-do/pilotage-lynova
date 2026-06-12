// Chargement MIS EN CACHE des données Evoliz (factures + achats), partagé par le Cockpit
// et la vue Facturation. Données globales d'entreprise (aucune dépendance utilisateur).
//
// Les loaders renvoient des DTO DÉJÀ sérialisés (date en ISO court, montants en number) :
// indispensable car unstable_cache sérialise le résultat — on ne peut pas y stocker des
// `Decimal`/`Date` Prisma (perdraient leur type au passage par le cache).
//
// Invalidation : tags "evoliz-invoices" / "evoliz-buys".
//  - cron /api/cron/sync : revalidateTag(...,"max") par source (SWR).
//  - refreshAll (Actualiser) : updateTag(...) (read-your-own-writes, frais immédiat).
// Filet : revalidate 3600 s.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { FactDoc, BuyDoc, BuyItemDoc } from "@/lib/facturation";

const day = (d: Date) => d.toISOString().slice(0, 10);

/** Factures Evoliz validées (kind = INVOICE, included) → FactDoc[] (ordonnées par date). */
export const getEvolizInvoices = unstable_cache(
  async (): Promise<FactDoc[]> => {
    const rows = await prisma.evolizDocument.findMany({
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
    });
    return rows.map((d) => ({
      kind: d.kind,
      date: day(d.documentDate),
      ht: Number(d.totalHt),
      ttc: Number(d.totalTtc),
      paid: Number(d.paid),
      netToPay: Number(d.netToPay),
      clientId: d.clientId,
      clientName: d.clientName,
    }));
  },
  ["evoliz-invoices"],
  { tags: ["evoliz-invoices"], revalidate: 3600 }
);

/**
 * Achats fournisseurs Evoliz (included) avec lignes ventilées par catégorie.
 * Superset partagé : le Cockpit n'utilise que `buys`, Facturation utilise `buys` + `items`.
 */
export const getEvolizBuys = unstable_cache(
  async (): Promise<{ buys: BuyDoc[]; items: BuyItemDoc[] }> => {
    const rows = await prisma.evolizBuy.findMany({
      where: { included: true },
      select: {
        documentDate: true,
        totalHt: true,
        supplierId: true,
        supplierName: true,
        items: { select: { categoryCode: true, categoryLabel: true, ht: true } },
      },
    });
    const buys: BuyDoc[] = rows.map((b) => ({
      date: day(b.documentDate),
      ht: Number(b.totalHt),
      supplierId: b.supplierId,
    }));
    const items: BuyItemDoc[] = rows.flatMap((b) =>
      b.items.map((it) => ({
        date: day(b.documentDate),
        supplierId: b.supplierId,
        supplierName: b.supplierName,
        categoryCode: it.categoryCode,
        categoryLabel: it.categoryLabel,
        ht: Number(it.ht),
      }))
    );
    return { buys, items };
  },
  ["evoliz-buys"],
  { tags: ["evoliz-buys"], revalidate: 3600 }
);
