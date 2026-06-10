// Logique métier Facturation (§5). Fonctions pures (serveur & client).
// Règles : exercice fiscal 1er oct → 30 sept ; CA en HT (avoirs déduits) ;
// abonnement HT < 2000 € / installation HT ≥ 2000 € ; HT/TTC stricts.

export interface FactDoc {
  kind: "INVOICE" | "CREDIT";
  date: string; // yyyy-mm-dd
  ht: number; // magnitude positive
  ttc: number;
  paid: number; // TTC
  netToPay: number; // TTC
  clientId: number | null;
  clientName: string | null;
}

export type TypeFilter = "all" | "abo" | "install";

const INSTALL_THRESHOLD = 2000;

export function isInstallation(ht: number): boolean {
  return Math.abs(ht) >= INSTALL_THRESHOLD;
}

/**
 * Contribution au CA (brut, aligné Evoliz) : seules les factures validées comptent.
 * Les avoirs (commerciaux comme d'annulation) ne sont JAMAIS déduits du CA.
 */
function signed(d: FactDoc): number {
  return d.kind === "INVOICE" ? d.ht : 0;
}

export function matchesType(ht: number, filter: TypeFilter): boolean {
  if (filter === "all") return true;
  return filter === "install" ? isInstallation(ht) : !isInstallation(ht);
}

// ── Exercice fiscal ──

export function fyOf(dateISO: string): number {
  const d = new Date(dateISO);
  return d.getUTCFullYear() + (d.getUTCMonth() >= 9 ? 1 : 0); // octobre = mois 9
}
export function fyStart(fy: number): Date {
  return new Date(Date.UTC(fy - 1, 9, 1, 0, 0, 0));
}
export function fyEnd(fy: number): Date {
  return new Date(Date.UTC(fy, 8, 30, 23, 59, 59));
}
export function fyLabel(fy: number): string {
  return `Exercice ${fy} · oct. ${fy - 1} → sept. ${fy}`;
}
/** Index de mois fiscal 0..11 (oct = 0 … sept = 11). */
export function fyMonthIndex(dateISO: string): number {
  return (new Date(dateISO).getUTCMonth() - 9 + 12) % 12;
}
export const FY_MONTH_LABELS = [
  "oct", "nov", "déc", "janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept",
];

const MONTH_NAMES = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

export function listFiscalYears(docs: FactDoc[]): number[] {
  const set = new Set<number>();
  for (const d of docs) set.add(fyOf(d.date));
  return [...set].sort((a, b) => b - a); // plus récent d'abord
}

// ── Formatage ──

export function euro(n: number, decimals = 0): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

// ── Calculs d'exercice ──

export interface ExerciceStats {
  monthly: number[]; // 12 mois fiscaux, CA HT total
  monthlyAbo: number[]; // part abonnement par mois fiscal
  monthlyInstall: number[]; // part installation par mois fiscal
  caHt: number;
  aboHt: number;
  installHt: number;
  encaisseTtc: number; // payé (TTC)
  resteTtc: number; // restant dû (TTC)
  invoiceCount: number;
}

function inRange(dateISO: string, start: Date, end: Date): boolean {
  const t = new Date(dateISO).getTime();
  return t >= start.getTime() && t <= end.getTime();
}

export function computeExercice(docs: FactDoc[], fy: number, filter: TypeFilter): ExerciceStats {
  const start = fyStart(fy);
  const end = fyEnd(fy);
  const monthly = new Array(12).fill(0);
  const monthlyAbo = new Array(12).fill(0);
  const monthlyInstall = new Array(12).fill(0);
  let caHt = 0, aboHt = 0, installHt = 0, encaisseTtc = 0, resteTtc = 0, invoiceCount = 0;

  for (const d of docs) {
    if (d.kind !== "INVOICE") continue; // CA brut : factures seulement
    if (!inRange(d.date, start, end) || !matchesType(d.ht, filter)) continue;
    const v = d.ht;
    const idx = fyMonthIndex(d.date);
    caHt += v;
    monthly[idx] += v;
    if (isInstallation(d.ht)) {
      installHt += v;
      monthlyInstall[idx] += v;
    } else {
      aboHt += v;
      monthlyAbo[idx] += v;
    }
    encaisseTtc += d.paid;
    resteTtc += d.netToPay;
    invoiceCount++;
  }
  return { monthly, monthlyAbo, monthlyInstall, caHt, aboHt, installHt, encaisseTtc, resteTtc, invoiceCount };
}

// ── Comparaison N-1 « à date » (même fenêtre temporelle) ──

export interface Comparison {
  caCurrent: number;
  caPrev: number;
  pct: number | null;
  partial: boolean;
  asOfMonthLabel: string; // mois de la borne (ex. « juin »)
}

export function compareAsOf(
  docs: FactDoc[],
  fy: number,
  filter: TypeFilter,
  todayISO: string
): Comparison {
  const partial = fyOf(todayISO) === fy;
  const today = new Date(todayISO);

  // Comparaison « à date » en MOIS ENTIERS : la borne haute est le dernier jour du
  // mois courant (Date.UTC(y, m+1, 0) = fin de mois), appliquée aux DEUX exercices.
  let asOf: Date;
  let asOfPrev: Date;
  if (partial) {
    const y = today.getUTCFullYear();
    const m = today.getUTCMonth();
    asOf = new Date(Date.UTC(y, m + 1, 0, 23, 59, 59));
    asOfPrev = new Date(Date.UTC(y - 1, m + 1, 0, 23, 59, 59));
  } else {
    asOf = fyEnd(fy);
    asOfPrev = fyEnd(fy - 1);
  }

  const sum = (start: Date, end: Date) =>
    docs.reduce((acc, d) => (inRange(d.date, start, end) && matchesType(d.ht, filter) ? acc + signed(d) : acc), 0);

  const caCurrent = sum(fyStart(fy), asOf);
  const caPrev = sum(fyStart(fy - 1), asOfPrev);
  const pct = caPrev !== 0 ? ((caCurrent - caPrev) / caPrev) * 100 : null;
  return { caCurrent, caPrev, pct, partial, asOfMonthLabel: MONTH_NAMES[asOf.getUTCMonth()] };
}

// ── MRR : abonnements du dernier mois civil facturé ──

export interface MrrResult {
  month: string | null; // "YYYY-MM"
  mrr: number;
  byClient: { clientName: string; amount: number }[];
}

export function computeMRR(docs: FactDoc[]): MrrResult {
  const months = docs.filter((d) => d.kind === "INVOICE").map((d) => d.date.slice(0, 7));
  if (months.length === 0) return { month: null, mrr: 0, byClient: [] };
  const month = months.sort().at(-1)!;

  const byClient = new Map<string, number>();
  let mrr = 0;
  for (const d of docs) {
    if (d.date.slice(0, 7) !== month || isInstallation(d.ht)) continue; // abonnements seulement
    const s = signed(d);
    mrr += s;
    const key = d.clientName ?? "—";
    byClient.set(key, (byClient.get(key) ?? 0) + s);
  }
  return {
    month,
    mrr,
    byClient: [...byClient.entries()]
      .map(([clientName, amount]) => ({ clientName, amount }))
      .filter((c) => c.amount !== 0)
      .sort((a, b) => b.amount - a.amount),
  };
}

// ── Clients (exercice) ──

export interface ClientRow {
  clientName: string;
  ca: number; // CA HT net exercice
  aboHt: number; // part abonnement
}

export function computeClients(docs: FactDoc[], fy: number): ClientRow[] {
  const start = fyStart(fy);
  const end = fyEnd(fy);
  const map = new Map<string, { ca: number; aboHt: number }>();
  for (const d of docs) {
    if (!inRange(d.date, start, end)) continue;
    const key = d.clientName ?? "—";
    const cur = map.get(key) ?? { ca: 0, aboHt: 0 };
    const s = signed(d);
    cur.ca += s;
    if (!isInstallation(d.ht)) cur.aboHt += s;
    map.set(key, cur);
  }
  return [...map.entries()]
    .map(([clientName, v]) => ({ clientName, ...v }))
    .filter((c) => c.ca !== 0 || c.aboHt !== 0)
    .sort((a, b) => b.ca - a.ca);
}
