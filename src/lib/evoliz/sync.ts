// Synchronisation du cache Evoliz (factures + avoirs). Lecture seule.
// Récupère TOUT l'historique (period=custom + date_min/date_max), pagine, et
// upsert dans la table evoliz_document. Réutilisable par script ou server action.

import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@prisma/client";
import { createEvolizClient, EvolizApiError, type EvolizClient, type ListResponse } from "./client";

// Historique : on remonte large (l'API exige une borne basse avec period=custom).
const HISTORY_START = "2015-01-01";
// Taille des lots createMany (sous la limite de paramètres Postgres).
const CHUNK = 1000;

// Noms de ressource possibles pour les avoirs selon les versions de l'API.
const CREDIT_RESOURCES = ["credits", "creditnotes", "credit-notes"];

export interface EvolizExcluded {
  kind: "INVOICE" | "CREDIT";
  documentNumber: string | null;
  status: string | null;
  enabled: boolean;
  ht: number;
  reason: string;
}

export interface EvolizSyncSummary {
  invoices: number; // total récupéré
  credits: number;
  creditResource: string | null;
  invoicesCounted: number;
  creditsCounted: number;
  invoicesExcluded: number;
  creditsExcluded: number;
  totalHtInvoices: number; // factures comptées seulement
  totalHtCredits: number; // avoirs comptés seulement
  caHtNet: number; // factures comptées − avoirs comptés
  excluded: EvolizExcluded[];
  minDate: string | null;
  maxDate: string | null;
}

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}

// Evoliz renvoie les avoirs en montants NÉGATIFs. On stocke toujours la magnitude
// positive ; le sens (déduction) est porté par `kind = CREDIT`. La déduction du CA
// se fait dans la logique métier (§5.8 : CA = factures HT − avoirs HT).
function amt(v: unknown): number {
  return Math.abs(num(v));
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

const PER_PAGE = 100; // max accepté par l'API Evoliz (per_page=1000 → 400)
const FETCH_CONCURRENCY = 5; // pages en parallèle (compromis vitesse / rate-limit)

/** Exécute `fn` sur les items avec une concurrence bornée, en préservant l'ordre. */
async function mapLimit<I, O>(items: I[], limit: number, fn: (item: I) => Promise<O>): Promise<O[]> {
  const out: O[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function fetchAll(
  client: EvolizClient,
  resource: string,
  dateMin: string,
  dateMax: string
): Promise<Record<string, unknown>[]> {
  const params = (page: number) => ({ period: "custom", date_min: dateMin, date_max: dateMax, page, per_page: PER_PAGE });
  // Page 1 d'abord (réchauffe le token, donne le nombre de pages), puis le reste EN PARALLÈLE.
  const first = await client.get<ListResponse>(resource, params(1));
  const all: Record<string, unknown>[] = [...(first.data ?? [])];
  const last = first.meta?.last_page ?? 1;
  if (last > 1 && (first.data?.length ?? 0) > 0) {
    const pages = Array.from({ length: last - 1 }, (_, i) => i + 2);
    const rest = await mapLimit(pages, FETCH_CONCURRENCY, (p) => client.get<ListResponse>(resource, params(p)));
    for (const res of rest) all.push(...(res.data ?? []));
  }
  return all;
}

/** Essaie les noms de ressource d'avoir jusqu'à en trouver un valide (non 404). */
async function fetchCredits(
  client: EvolizClient,
  dateMin: string,
  dateMax: string
): Promise<{ resource: string | null; items: Record<string, unknown>[] }> {
  for (const resource of CREDIT_RESOURCES) {
    try {
      const items = await fetchAll(client, resource, dateMin, dateMax);
      return { resource, items };
    } catch (e) {
      if (e instanceof EvolizApiError && e.status === 404) continue; // ressource inexistante → suivant
      throw e;
    }
  }
  return { resource: null, items: [] };
}

// Numéro de facture créditée par un avoir : champ invoice_ref, sinon parsé dans `object`
// (« Avoir sur Facture n°F-… »). Normalisé en chiffres pour un rapprochement robuste.
function creditedInvoiceKey(item: Record<string, unknown>): string | null {
  const ref = (item.invoice_ref as string) || "";
  const obj = (item.object as string) || "";
  const m = (ref || obj).match(/F-?(\d{6,})/i);
  return m ? m[1] : null;
}

function invoiceKey(documentNumber: string | null): string | null {
  const m = (documentNumber ?? "").match(/F-?(\d{6,})/i);
  return m ? m[1] : null;
}

function mapDoc(kind: "INVOICE" | "CREDIT", item: Record<string, unknown>) {
  const total = (item.total ?? {}) as Record<string, unknown>;
  const client = (item.client ?? {}) as Record<string, unknown>;
  const evolizId = Number(kind === "INVOICE" ? item.invoiceid : item.creditid);
  return {
    kind,
    evolizId,
    documentNumber: (item.document_number as string) ?? null,
    documentDate: new Date(item.documentdate as string),
    clientId: client.clientid != null ? Number(client.clientid) : null,
    clientName: (client.name as string) ?? null,
    totalHt: amt(total.vat_exclude),
    totalTtc: amt(total.vat_include),
    paid: amt(total.paid),
    netToPay: amt(total.net_to_pay),
    status: (item.status as string) ?? null,
    enabled: item.enabled !== false, // annulée si false
    invoiceRef: kind === "CREDIT" ? creditedInvoiceKey(item) : null, // avoir → clé facture créditée
    included: true, // recalculé après chargement complet
    syncedAt: new Date(),
  };
}

/** Document validé (non annulé) et non brouillon (§5). */
function isCounted(r: { enabled: boolean; status: string | null }): boolean {
  return r.enabled && r.status !== "draft";
}

export async function syncEvoliz(prisma: PrismaClient): Promise<EvolizSyncSummary> {
  const client = createEvolizClient();
  const dateMax = todayISO();

  // Factures et avoirs en parallèle (deux ressources indépendantes).
  const [invoices, creditsRes] = await Promise.all([
    fetchAll(client, "invoices", HISTORY_START, dateMax),
    fetchCredits(client, HISTORY_START, dateMax),
  ]);
  const { resource: creditResource, items: credits } = creditsRes;

  const records = [
    ...invoices.map((i) => mapDoc("INVOICE", i)),
    ...credits.map((c) => mapDoc("CREDIT", c)),
  ].filter((r) => Number.isFinite(r.evolizId) && !Number.isNaN(r.documentDate.getTime()));

  // Factures hors CA (annulées ou brouillons) : leurs avoirs d'annulation suivent.
  const excludedInvoiceNumbers = new Set(
    records
      .filter((r) => r.kind === "INVOICE" && !isCounted(r))
      .map((r) => invoiceKey(r.documentNumber))
      .filter((k): k is string => k !== null)
  );

  for (const r of records) {
    if (r.kind === "INVOICE") {
      r.included = isCounted(r);
    } else {
      // Avoir compté seulement s'il est validé ET ne crédite pas une facture exclue.
      r.included = isCounted(r) && !(r.invoiceRef !== null && excludedInvoiceNumbers.has(r.invoiceRef));
    }
  }

  // Réécriture groupée (balayage complet) : deleteMany + createMany par lots, en une
  // transaction. Capte les modifications de documents existants et re-catégorisations.
  const docOps = [prisma.evolizDocument.deleteMany({})];
  for (let i = 0; i < records.length; i += CHUNK) {
    docOps.push(prisma.evolizDocument.createMany({ data: records.slice(i, i + CHUNK) }));
  }
  await prisma.$transaction(docOps);

  const invoiceRecs = records.filter((r) => r.kind === "INVOICE");
  const creditRecs = records.filter((r) => r.kind === "CREDIT");
  const countedInvoices = invoiceRecs.filter((r) => r.included);
  const countedCredits = creditRecs.filter((r) => r.included);
  const sumHt = (rs: { totalHt: number }[]) => rs.reduce((s, r) => s + r.totalHt, 0);

  const totalHtInvoices = sumHt(countedInvoices);
  const totalHtCredits = sumHt(countedCredits);

  const reasonOf = (r: (typeof records)[number]): string => {
    if (!r.enabled) return "annulé";
    if (r.status === "draft") return "brouillon";
    if (r.kind === "CREDIT") return `avoir d'annulation (${r.invoiceRef ?? "?"})`;
    return "exclu";
  };

  const excluded: EvolizExcluded[] = records
    .filter((r) => !r.included)
    .map((r) => ({
      kind: r.kind,
      documentNumber: r.documentNumber,
      status: r.status,
      enabled: r.enabled,
      ht: r.totalHt,
      reason: reasonOf(r),
    }));

  const dates = records.map((r) => r.documentDate.getTime());
  const summary: EvolizSyncSummary = {
    invoices: invoices.length,
    credits: credits.length,
    creditResource,
    invoicesCounted: countedInvoices.length,
    creditsCounted: countedCredits.length,
    invoicesExcluded: invoiceRecs.length - countedInvoices.length,
    creditsExcluded: creditRecs.length - countedCredits.length,
    totalHtInvoices,
    totalHtCredits,
    caHtNet: totalHtInvoices - totalHtCredits,
    excluded,
    minDate: dates.length ? new Date(Math.min(...dates)).toISOString().slice(0, 10) : null,
    maxDate: dates.length ? new Date(Math.max(...dates)).toISOString().slice(0, 10) : null,
  };

  await prisma.syncState.upsert({
    where: { source: "evoliz" },
    update: { lastSyncAt: new Date(), detail: JSON.stringify(summary) },
    create: { source: "evoliz", lastSyncAt: new Date(), detail: JSON.stringify(summary) },
  });

  return summary;
}

// ───────────────────────── Achats (marge commerciale) ─────────────────────────

export interface BuysSyncSummary {
  buys: number;
  buysIncluded: number;
  itemsFallback: number; // achats rabattus sur catégorie dominante (HT ligne absent)
  totalHt: number; // achats inclus seulement
  minDate: string | null;
  maxDate: string | null;
}

interface BuyItemRow {
  categoryCode: string | null;
  categoryLabel: string | null;
  ht: number;
  fallback: boolean;
}

/** Catégorie dominante (la plus fréquente) parmi les lignes d'un achat. */
function dominantCategory(items: Record<string, unknown>[]): { code: string | null; label: string | null } {
  const count = new Map<string, { code: string | null; label: string | null; n: number }>();
  for (const it of items) {
    const pc = (it.purchase_classification ?? {}) as Record<string, unknown>;
    const code = (pc.code as string) ?? null;
    const label = (pc.label as string) ?? null;
    const key = code ?? label ?? "—";
    const cur = count.get(key) ?? { code, label, n: 0 };
    cur.n++;
    count.set(key, cur);
  }
  let best: { code: string | null; label: string | null; n: number } | null = null;
  for (const v of count.values()) if (!best || v.n > best.n) best = v;
  return best ? { code: best.code, label: best.label } : { code: null, label: null };
}

export async function syncEvolizBuys(prisma: PrismaClient): Promise<BuysSyncSummary> {
  const client = createEvolizClient();
  const dateMax = todayISO();
  const buys = await fetchAll(client, "buys", HISTORY_START, dateMax);

  let buysIncluded = 0;
  let itemsFallback = 0;
  let totalHt = 0;
  const dates: number[] = [];
  const seen = new Set<number>();

  // Lignes préparées en mémoire ; UUID des achats générés côté app pour relier les items
  // (deux createMany : parents puis enfants), au lieu d'un create imbriqué par achat.
  const buyRows: {
    id: string; evolizId: number; documentNumber: string | null; documentDate: Date;
    supplierId: number | null; supplierName: string | null; totalHt: number;
    status: string | null; enabled: boolean; included: boolean;
  }[] = [];
  const itemRows: { buyId: string; categoryCode: string | null; categoryLabel: string | null; ht: number; fallback: boolean }[] = [];

  for (const b of buys) {
    const evolizId = Number(b.buyid);
    const documentDate = new Date(b.documentdate as string);
    if (!Number.isFinite(evolizId) || Number.isNaN(documentDate.getTime())) continue;
    if (seen.has(evolizId)) continue; // doublon de pagination
    seen.add(evolizId);

    const enabled = b.enabled !== false;
    const status = (b.status as string) ?? null;
    const included = enabled && status !== "draft";
    const buyHt = amt((b.total as Record<string, unknown>)?.vat_exclude);
    const supplier = (b.supplier ?? {}) as Record<string, unknown>;
    const rawItems = Array.isArray(b.items) ? (b.items as Record<string, unknown>[]) : [];

    // Ventilation au niveau ligne ; repli sur catégorie dominante si un HT ligne manque.
    const anyMissing = rawItems.some(
      (it) => (it.total as Record<string, unknown>)?.vat_exclude == null
    );
    let items: BuyItemRow[];
    if (rawItems.length === 0) {
      items = [{ categoryCode: null, categoryLabel: "(sans catégorie)", ht: buyHt, fallback: true }];
      itemsFallback++;
    } else if (anyMissing) {
      const dom = dominantCategory(rawItems);
      items = [{ categoryCode: dom.code, categoryLabel: dom.label, ht: buyHt, fallback: true }];
      itemsFallback++;
    } else {
      items = rawItems.map((it) => {
        const pc = (it.purchase_classification ?? {}) as Record<string, unknown>;
        return {
          categoryCode: (pc.code as string) ?? null,
          categoryLabel: (pc.label as string) ?? null,
          ht: amt((it.total as Record<string, unknown>).vat_exclude),
          fallback: false,
        };
      });
    }

    if (included) {
      buysIncluded++;
      totalHt += buyHt;
    }
    dates.push(documentDate.getTime());

    const id = randomUUID();
    buyRows.push({
      id,
      evolizId,
      documentNumber: (b.document_number as string) ?? null,
      documentDate,
      supplierId: supplier.supplierid != null ? Number(supplier.supplierid) : null,
      supplierName: (supplier.name as string) ?? null,
      totalHt: buyHt,
      status,
      enabled,
      included,
    });
    for (const it of items) itemRows.push({ buyId: id, categoryCode: it.categoryCode, categoryLabel: it.categoryLabel, ht: it.ht, fallback: it.fallback });
  }

  // Réécriture groupée en une transaction : purge (items puis achats, contrainte FK),
  // puis createMany parents (achats) avant enfants (items).
  const buyOps = [prisma.evolizBuyItem.deleteMany({}), prisma.evolizBuy.deleteMany({})];
  for (let i = 0; i < buyRows.length; i += CHUNK) buyOps.push(prisma.evolizBuy.createMany({ data: buyRows.slice(i, i + CHUNK) }));
  for (let i = 0; i < itemRows.length; i += CHUNK) buyOps.push(prisma.evolizBuyItem.createMany({ data: itemRows.slice(i, i + CHUNK) }));
  await prisma.$transaction(buyOps);

  const summary: BuysSyncSummary = {
    buys: buys.length,
    buysIncluded,
    itemsFallback,
    totalHt,
    minDate: dates.length ? new Date(Math.min(...dates)).toISOString().slice(0, 10) : null,
    maxDate: dates.length ? new Date(Math.max(...dates)).toISOString().slice(0, 10) : null,
  };

  await prisma.syncState.upsert({
    where: { source: "evoliz_buys" },
    update: { lastSyncAt: new Date(), detail: JSON.stringify(summary) },
    create: { source: "evoliz_buys", lastSyncAt: new Date(), detail: JSON.stringify(summary) },
  });

  return summary;
}
