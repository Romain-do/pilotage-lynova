// Agrégation serveur de la trésorerie depuis le cache Revolut (lecture seule).
// Calcule : comptes, P&L crypto global, séries mensuelles (flux externes EUR +
// solde EUR fin de mois), et décaissements externes (pour catégorisation).
import type { PrismaClient } from "@prisma/client";
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { TAccount, MonthRow, OutflowRow, CryptoPnl } from "@/lib/tresorerie";

const FIAT = new Set(["EUR", "USD", "GBP", "CHF", "JPY", "CAD", "AUD", "SEK", "NOK", "DKK", "PLN"]);

export interface TresorerieData {
  accounts: TAccount[];
  cryptoPnl: CryptoPnl;
  months: MonthRow[];
  outflows: OutflowRow[];
  lastSync: string | null;
}

const n = (v: unknown): number => {
  const x = typeof v === "object" && v !== null ? Number(v.toString()) : Number(v);
  return Number.isFinite(x) ? x : 0;
};
const monthEndTs = (key: string): number => {
  const y = Number(key.slice(0, 4));
  const m = Number(key.slice(5, 7));
  return Date.UTC(y, m, 0, 23, 59, 59);
};

export async function buildTresorerie(prisma: PrismaClient): Promise<TresorerieData> {
  const [accts, txs, sync] = await Promise.all([
    prisma.revolutAccount.findMany(),
    prisma.revolutTx.findMany({ include: { legs: true } }),
    prisma.syncState.findUnique({ where: { source: "revolut" } }),
  ]);

  const accounts: TAccount[] = accts.map((a) => ({
    id: a.id,
    name: a.name,
    currency: a.currency,
    kind: a.kind,
    balance: n(a.balance),
    rateToEur: a.rateToEur != null ? n(a.rateToEur) : null,
    valoEur: a.valoEur != null ? n(a.valoEur) : null,
  }));

  const eurIds = new Set(accounts.filter((a) => a.kind === "FIAT" && a.currency === "EUR").map((a) => a.id));
  const usdRate = accounts.find((a) => a.currency === "USD")?.rateToEur ?? 0;
  const toEur = (amt: number, cur: string) => (cur === "EUR" ? amt : cur === "USD" ? amt * usdRate : amt);

  // ── P&L crypto global ──
  const cryptoAccts = accounts.filter((a) => a.kind === "CRYPTO");
  let invested = 0, recovered = 0;
  const reconstructed = new Map<string, number>(); // qty nette par crypto via exchanges
  for (const t of txs) {
    if (t.type !== "exchange" || t.state !== "completed") continue;
    const legs = t.legs;
    const fiat = legs.find((l) => FIAT.has(l.currency));
    const crypto = legs.find((l) => !FIAT.has(l.currency) && n(l.amount) !== 0);
    if (!crypto) continue;
    reconstructed.set(crypto.currency, (reconstructed.get(crypto.currency) ?? 0) + n(crypto.amount));
    if (!fiat) continue;
    const fe = toEur(n(fiat.amount), fiat.currency);
    const cq = n(crypto.amount);
    if (fe < 0 && cq > 0) invested += -fe;
    else if (fe > 0 && cq < 0) recovered += fe;
  }
  const value = cryptoAccts.reduce((s, a) => s + (a.valoEur ?? 0), 0);
  let transferredOutValue = 0;
  for (const a of cryptoAccts) {
    const recon = reconstructed.get(a.currency) ?? 0;
    const gap = recon - a.balance; // unités sorties hors plateforme
    if (gap > 0 && a.rateToEur) transferredOutValue += gap * a.rateToEur;
  }
  const pnl = value + recovered - invested;
  const cryptoPnl: CryptoPnl = {
    invested: Math.round(invested * 100) / 100,
    recovered: Math.round(recovered * 100) / 100,
    value: Math.round(value * 100) / 100,
    pnl: Math.round(pnl * 100) / 100,
    pct: invested > 0 ? (pnl / invested) * 100 : null,
    transferredOutValue: Math.round(transferredOutValue * 100) / 100,
  };

  // ── Séries mensuelles : flux externes EUR + solde EUR fin de mois ──
  const flow = new Map<string, { inflow: number; outflow: number }>();
  const outflows: OutflowRow[] = [];
  const acctLegs = new Map<string, { t: number; bal: number }[]>(); // par compte EUR, pour solde
  let minMonth = "9999-99";
  let maxMonth = "0000-00";

  for (const t of txs) {
    const completed = (t.completedAt ?? t.createdAt).toISOString();
    const monthKey = completed.slice(0, 7);
    for (const leg of t.legs) {
      if (leg.currency !== "EUR" || !leg.accountId || !eurIds.has(leg.accountId)) continue;
      // Solde : on suit toutes les jambes EUR (y c. internes) via balanceAfter réel.
      if (leg.balanceAfter != null) {
        const arr = acctLegs.get(leg.accountId) ?? [];
        arr.push({ t: new Date(completed).getTime(), bal: n(leg.balanceAfter) });
        acctLegs.set(leg.accountId, arr);
      }
      // Coinbase : aller-retour de placement (sortie puis retour, net nul) → neutre,
      // exclu des flux et de la répartition (comme un transfert interne).
      const isCoinbase = (leg.description ?? "").toLowerCase().includes("coinbase");
      // Flux : externes seulement (completed, hors exchange, non interne, hors Coinbase).
      if (t.state === "completed" && t.type !== "exchange" && !leg.internal && !isCoinbase) {
        if (monthKey < minMonth) minMonth = monthKey;
        if (monthKey > maxMonth) maxMonth = monthKey;
        const amt = n(leg.amount);
        const m = flow.get(monthKey) ?? { inflow: 0, outflow: 0 };
        if (amt >= 0) m.inflow += amt;
        else m.outflow += amt;
        flow.set(monthKey, m);
        if (amt < 0) {
          outflows.push({
            date: completed.slice(0, 10),
            reference: t.reference ?? "",
            counterparty: leg.description ?? null,
            amount: -amt,
          });
        }
      }
    }
  }

  // Liste de mois (du plus ancien mouvement à aujourd'hui).
  const monthsKeys: string[] = [];
  if (minMonth !== "9999-99") {
    const now = new Date();
    const end = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
    let [y, m] = [Number(minMonth.slice(0, 4)), Number(minMonth.slice(5, 7))];
    const last = maxMonth > end ? maxMonth : end;
    while (true) {
      const key = `${y}-${String(m).padStart(2, "0")}`;
      monthsKeys.push(key);
      if (key === last) break;
      m++; if (m > 12) { m = 1; y++; }
      if (monthsKeys.length > 240) break;
    }
  }

  // Solde EUR fin de mois par compte (report), sommé.
  const carry = new Map<string, number>();
  const idx = new Map<string, number>();
  for (const id of eurIds) {
    acctLegs.get(id)?.sort((a, b) => a.t - b.t);
    carry.set(id, 0);
    idx.set(id, 0);
  }
  const months: MonthRow[] = monthsKeys.map((key) => {
    const endTs = monthEndTs(key);
    let endBalance = 0;
    for (const id of eurIds) {
      const legs = acctLegs.get(id) ?? [];
      let i = idx.get(id)!;
      let bal = carry.get(id)!;
      while (i < legs.length && legs[i].t <= endTs) { bal = legs[i].bal; i++; }
      idx.set(id, i);
      carry.set(id, bal);
      endBalance += bal;
    }
    const fl = flow.get(key) ?? { inflow: 0, outflow: 0 };
    return { key, inflow: fl.inflow, outflow: fl.outflow, endBalance: Math.round(endBalance * 100) / 100 };
  });

  return {
    accounts,
    cryptoPnl,
    months,
    outflows,
    lastSync: sync?.lastSyncAt ? sync.lastSyncAt.toISOString() : null,
  };
}

/**
 * Version MISE EN CACHE de `buildTresorerie` (cache inter-requêtes Next, données globales
 * d'entreprise — aucune dépendance à l'utilisateur). Évite de recharger toutes les
 * transactions Revolut + recalculer à chaque navigation (/, /facturation, /tresorerie).
 *
 * - Sans argument (clé de cache stable) → utilise le singleton `prisma` en interne.
 * - Invalidée par `revalidateTag("revolut")` : cron /api/cron/sync + bouton « Actualiser ».
 * - Filet `revalidate: 3600` (1 h) : rafraîchissement horaire même si un tag est manqué
 *   (couvre aussi les bornes de mois dépendantes de la date).
 * Les pages restent `force-dynamic` : seul ce loader est caché, l'auth reste par-requête.
 */
export const getTresorerie = unstable_cache(
  async (): Promise<TresorerieData> => buildTresorerie(prisma),
  ["tresorerie-data"],
  { tags: ["revolut"], revalidate: 3600 }
);
