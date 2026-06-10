// Synchronisation du cache Revolut (comptes + transactions). LECTURE SEULE.
// - Comptes : solde + valorisation EUR (cours /rate ; crypto = quantité × cours).
// - Transactions : pagination sur ~24 mois (curseur `to`), dédoublonnées.
// - Règles trésorerie (§5.4) : on marque `internal` les jambes dont la contrepartie
//   est un de NOS comptes (transferts entre sous-comptes) ; les flux/charges ne se
//   calculent que sur des sorties EXTERNES (internal=false, type≠exchange, completed).

import type { PrismaClient } from "@prisma/client";
import { createRevolutClient, FIAT_CURRENCIES, type RevolutClient } from "./client";

const HISTORY_MONTHS = 24;

interface RawTx {
  id: string;
  type: string;
  state: string;
  reference?: string;
  created_at: string;
  completed_at?: string;
  legs?: {
    leg_id?: string;
    account_id?: string;
    amount?: number;
    currency?: string;
    description?: string;
    balance?: number;
    counterparty?: { account_id?: string; account_type?: string };
  }[];
}

export interface RevolutSyncSummary {
  accounts: number;
  fiatEur: number;
  cryptoEur: number;
  totalEur: number;
  txCount: number;
  internalLegs: number;
  exchangeTx: number;
  monthly: { month: string; in: number; out: number }[];
  minDate: string | null;
  maxDate: string | null;
}

function num(v: unknown): number {
  const n = typeof v === "string" ? Number(v) : (v as number);
  return Number.isFinite(n) ? n : 0;
}
function floorISO(months: number): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months, d.getUTCDate())).toISOString();
}

async function fetchAllTx(client: RevolutClient, fromISO: string): Promise<RawTx[]> {
  const all: RawTx[] = [];
  const seen = new Set<string>();
  let cursor: string | undefined;
  for (let page = 0; page < 80; page++) {
    const batch = await client.get<RawTx[]>("transactions", { from: fromISO, to: cursor, count: 1000 });
    if (batch.length === 0) break;
    let oldest = cursor;
    let progressed = false;
    for (const t of batch) {
      if (!seen.has(t.id)) {
        seen.add(t.id);
        all.push(t);
        progressed = true;
      }
      const c = t.created_at;
      if (!oldest || c < oldest) oldest = c;
    }
    if (batch.length < 1000 || !progressed) break;
    cursor = oldest;
  }
  return all;
}

export async function syncRevolut(prisma: PrismaClient): Promise<RevolutSyncSummary> {
  const client = createRevolutClient();

  // ── Comptes + valorisation EUR ──
  const accounts = await client.get<Record<string, unknown>[]>("accounts");
  const ownAccountIds = new Set(accounts.map((a) => String(a.id)));

  const accountRows: {
    id: string;
    name: string | null;
    currency: string;
    kind: "FIAT" | "CRYPTO";
    balance: number;
    rateToEur: number | null;
    valoEur: number | null;
    state: string | null;
  }[] = [];
  let fiatEur = 0;
  let cryptoEur = 0;
  for (const a of accounts) {
    const currency = String(a.currency);
    const balance = num(a.balance);
    const kind = FIAT_CURRENCIES.has(currency) ? "FIAT" : "CRYPTO";
    const rate = balance !== 0 ? await client.rateToEur(currency) : currency === "EUR" ? 1 : null;
    const valoEur = rate != null ? Math.round(balance * rate * 100) / 100 : null;
    if (valoEur != null) {
      if (kind === "FIAT") fiatEur += valoEur;
      else cryptoEur += valoEur;
    }
    accountRows.push({
      id: String(a.id),
      name: (a.name as string) || null,
      currency,
      kind: kind as "FIAT" | "CRYPTO",
      balance,
      rateToEur: rate,
      valoEur,
      state: (a.state as string) ?? null,
    });
  }

  // ── Transactions (paginées) ──
  const fromISO = floorISO(HISTORY_MONTHS);
  const txs = await fetchAllTx(client, fromISO);

  // Agrégat mensuel : flux EXTERNES en EUR (hors internes & exchanges).
  const monthly = new Map<string, { in: number; out: number }>();
  let internalLegs = 0;
  let exchangeTx = 0;
  const dates: string[] = [];

  const txRows: {
    id: string;
    type: string;
    state: string;
    reference: string | null;
    createdAt: Date;
    completedAt: Date | null;
  }[] = [];
  const legRows: {
    id: string;
    txId: string;
    accountId: string | null;
    currency: string;
    amount: number;
    balanceAfter: number | null;
    description: string | null;
    counterpartyAccountId: string | null;
    internal: boolean;
  }[] = [];
  for (const t of txs) {
    if (t.type === "exchange") exchangeTx++;
    const completed = t.completed_at ?? t.created_at;
    dates.push(t.created_at);
    txRows.push({
      id: t.id,
      type: t.type,
      state: t.state,
      reference: t.reference ?? null,
      createdAt: new Date(t.created_at),
      completedAt: t.completed_at ? new Date(t.completed_at) : null,
    });
    const legs = t.legs ?? [];
    // Transfert interne : ≥2 jambes toutes sur MES comptes (aucune contrepartie externe).
    const allOwn =
      legs.length > 1 &&
      legs.every((l) => l.account_id != null && ownAccountIds.has(String(l.account_id)));
    legs.forEach((leg, i) => {
      const cpId = leg.counterparty?.account_id ?? null;
      const internal = allOwn || (cpId != null && ownAccountIds.has(cpId));
      if (internal) internalLegs++;
      legRows.push({
        id: leg.leg_id ?? `${t.id}:${i}`,
        txId: t.id,
        accountId: leg.account_id ?? null,
        currency: leg.currency ?? "",
        amount: num(leg.amount),
        balanceAfter: leg.balance != null ? num(leg.balance) : null,
        description: leg.description ?? null,
        counterpartyAccountId: cpId,
        internal,
      });
      // Flux externes EUR complétés, hors exchange/internes.
      if (t.state === "completed" && t.type !== "exchange" && !internal && leg.currency === "EUR") {
        const month = completed.slice(0, 7);
        const m = monthly.get(month) ?? { in: 0, out: 0 };
        const amt = num(leg.amount);
        if (amt >= 0) m.in += amt;
        else m.out += amt;
        monthly.set(month, m);
      }
    });
  }

  // ── Écriture du cache (reconstruit à chaque synchro) ──
  await prisma.revolutLeg.deleteMany({});
  await prisma.revolutTx.deleteMany({});
  await prisma.revolutAccount.deleteMany({});

  for (const a of accountRows) await prisma.revolutAccount.create({ data: a });
  // Transactions par lots, puis legs par lots (createMany rapide).
  for (let i = 0; i < txRows.length; i += 500) {
    await prisma.revolutTx.createMany({ data: txRows.slice(i, i + 500) });
  }
  for (let i = 0; i < legRows.length; i += 500) {
    await prisma.revolutLeg.createMany({ data: legRows.slice(i, i + 500), skipDuplicates: true });
  }

  const summary: RevolutSyncSummary = {
    accounts: accountRows.length,
    fiatEur: Math.round(fiatEur * 100) / 100,
    cryptoEur: Math.round(cryptoEur * 100) / 100,
    totalEur: Math.round((fiatEur + cryptoEur) * 100) / 100,
    txCount: txRows.length,
    internalLegs,
    exchangeTx,
    monthly: [...monthly.entries()].sort().map(([month, v]) => ({ month, in: v.in, out: v.out })),
    minDate: dates.length ? dates.reduce((a, b) => (a < b ? a : b)).slice(0, 10) : null,
    maxDate: dates.length ? dates.reduce((a, b) => (a > b ? a : b)).slice(0, 10) : null,
  };

  await prisma.syncState.upsert({
    where: { source: "revolut" },
    update: { lastSyncAt: new Date(), detail: JSON.stringify({ ...summary, monthly: undefined }) },
    create: { source: "revolut", lastSyncAt: new Date(), detail: JSON.stringify({ ...summary, monthly: undefined }) },
  });

  return summary;
}
