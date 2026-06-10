// Logique métier Facturation (§5) — basée sur une PLAGE DE DATES [start, end].
// CA en HT brut (factures validées, avoirs non déduits) ; abonnement < 2000 € /
// installation ≥ 2000 € ; marge commerciale = CA HT − achats fournisseurs HT ;
// HT/TTC stricts. Comparaison N-1 = même plage décalée d'un an.
// Les dates sont des chaînes ISO `yyyy-mm-dd` (comparaison lexicographique = chronologique).

export interface FactDoc {
  kind: "INVOICE" | "CREDIT";
  date: string;
  ht: number;
  ttc: number;
  paid: number; // TTC
  netToPay: number; // TTC
  clientId: number | null;
  clientName: string | null;
}

export interface BuyDoc {
  date: string;
  ht: number;
}
export interface BuyItemDoc {
  date: string;
  supplierName: string | null;
  categoryCode: string | null;
  categoryLabel: string | null;
  ht: number;
}

export type TypeFilter = "all" | "abo" | "install";
export interface DateRange {
  start: string; // yyyy-mm-dd (inclus)
  end: string; // yyyy-mm-dd (inclus)
}

const INSTALL_THRESHOLD = 2000;
export function isInstallation(ht: number): boolean {
  return Math.abs(ht) >= INSTALL_THRESHOLD;
}
export function matchesType(ht: number, filter: TypeFilter): boolean {
  if (filter === "all") return true;
  return filter === "install" ? isInstallation(ht) : !isInstallation(ht);
}

export function euro(n: number, decimals = 0): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(n);
}

const MONTH_ABBR = [
  "janv", "févr", "mars", "avr", "mai", "juin", "juil", "août", "sept", "oct", "nov", "déc",
];
const MONTH_FULL = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

// ── Exercice fiscal (oct→sept) ──
export function fyOf(dateISO: string): number {
  const m = Number(dateISO.slice(5, 7));
  return Number(dateISO.slice(0, 4)) + (m >= 10 ? 1 : 0);
}
export function fyLabel(fy: number): string {
  return `Exercice ${fy} · oct. ${fy - 1} → sept. ${fy}`;
}
export function listFiscalYears(docs: FactDoc[]): number[] {
  const set = new Set<number>();
  for (const d of docs) if (d.kind === "INVOICE") set.add(fyOf(d.date));
  return [...set].sort((a, b) => b - a);
}

// ── Construction de plages ──
const pad = (n: number) => String(n).padStart(2, "0");
function lastDayOfMonth(y: number, m1: number): number {
  return new Date(Date.UTC(y, m1, 0)).getUTCDate(); // m1 = mois 1-12
}
function endOfMonthISO(y: number, m1: number): string {
  return `${y}-${pad(m1)}-${pad(lastDayOfMonth(y, m1))}`;
}

/** Plage d'un exercice fiscal ; borné à la fin du mois courant si exercice en cours. */
export function fyRange(fy: number, todayISO: string): DateRange {
  const start = `${fy - 1}-10-01`;
  if (fyOf(todayISO) === fy) {
    const y = Number(todayISO.slice(0, 4));
    const m = Number(todayISO.slice(5, 7));
    return { start, end: endOfMonthISO(y, m) };
  }
  return { start, end: `${fy}-09-30` };
}

export type PresetKey = "current-fy" | "current-month" | "current-quarter" | "last-12-months";
export function presetRange(key: PresetKey, todayISO: string): DateRange {
  const y = Number(todayISO.slice(0, 4));
  const m = Number(todayISO.slice(5, 7));
  switch (key) {
    case "current-fy":
      return fyRange(fyOf(todayISO), todayISO);
    case "current-month":
      return { start: `${y}-${pad(m)}-01`, end: endOfMonthISO(y, m) };
    case "current-quarter": {
      const q0 = m - ((m - 1) % 3); // premier mois du trimestre civil
      return { start: `${y}-${pad(q0)}-01`, end: endOfMonthISO(y, q0 + 2) };
    }
    case "last-12-months": {
      let sy = y, sm = m - 11;
      while (sm <= 0) { sm += 12; sy -= 1; }
      return { start: `${sy}-${pad(sm)}-01`, end: endOfMonthISO(y, m) };
    }
  }
}

export function presetLabel(key: PresetKey): string {
  return {
    "current-fy": "Exercice en cours",
    "current-month": "Mois en cours",
    "current-quarter": "Trimestre en cours",
    "last-12-months": "12 derniers mois",
  }[key];
}

/** Même plage décalée d'un an (comparaison N-1). */
export function shiftYear({ start, end }: DateRange): DateRange {
  const dec = (iso: string) => `${Number(iso.slice(0, 4)) - 1}${iso.slice(4)}`;
  return { start: dec(start), end: dec(end) };
}

/** Libellé court d'une plage (ex. « oct. 2024 → juin 2025 »). */
export function rangeLabel({ start, end }: DateRange): string {
  const fmt = (iso: string) => `${MONTH_ABBR[Number(iso.slice(5, 7)) - 1]}. ${iso.slice(0, 4)}`;
  return `${fmt(start)} → ${fmt(end)}`;
}

/** Liste des mois civils de la plage (pour l'axe du graphe). */
export function monthsInRange({ start, end }: DateRange): { key: string; label: string }[] {
  let y = Number(start.slice(0, 4));
  let m = Number(start.slice(5, 7));
  const ey = Number(end.slice(0, 4));
  const em = Number(end.slice(5, 7));
  const out: { key: string; label: string }[] = [];
  while (y < ey || (y === ey && m <= em)) {
    out.push({ key: `${y}-${pad(m)}`, label: `${MONTH_ABBR[m - 1]} ${String(y).slice(2)}` });
    m++;
    if (m > 12) { m = 1; y++; }
    if (out.length > 60) break; // garde-fou
  }
  return out;
}

const inRange = (d: string, r: DateRange) => d >= r.start && d <= r.end;

// ── Calculs sur une plage ──

export interface RangeStats {
  caHt: number; // CA filtré (selon le filtre Tout/Abo/Install)
  caHtTotal: number; // CA toutes typologies (base de la marge)
  aboHt: number;
  installHt: number;
  achatsHt: number;
  marge: number; // CA total − achats
  taux: number | null; // %
  encaisseTtc: number;
  resteTtc: number;
  invoiceCount: number;
  months: { key: string; label: string }[];
  caByMonth: number[]; // CA total par mois civil
  achatsByMonth: number[];
}

export function computeRange(
  docs: FactDoc[],
  buys: BuyDoc[],
  range: DateRange,
  filter: TypeFilter
): RangeStats {
  const months = monthsInRange(range);
  const idx = new Map(months.map((m, i) => [m.key, i]));
  const caByMonth = new Array(months.length).fill(0);
  const achatsByMonth = new Array(months.length).fill(0);
  let caHt = 0, caHtTotal = 0, aboHt = 0, installHt = 0, encaisseTtc = 0, resteTtc = 0, invoiceCount = 0, achatsHt = 0;

  for (const d of docs) {
    if (d.kind !== "INVOICE" || !inRange(d.date, range)) continue;
    caHtTotal += d.ht;
    if (isInstallation(d.ht)) installHt += d.ht;
    else aboHt += d.ht;
    encaisseTtc += d.paid;
    resteTtc += d.netToPay;
    invoiceCount++;
    const i = idx.get(d.date.slice(0, 7));
    if (i != null) caByMonth[i] += d.ht;
    if (matchesType(d.ht, filter)) caHt += d.ht;
  }
  for (const b of buys) {
    if (!inRange(b.date, range)) continue;
    achatsHt += b.ht;
    const i = idx.get(b.date.slice(0, 7));
    if (i != null) achatsByMonth[i] += b.ht;
  }

  const marge = caHtTotal - achatsHt;
  return {
    caHt,
    caHtTotal,
    aboHt,
    installHt,
    achatsHt,
    marge,
    taux: caHtTotal > 0 ? (marge / caHtTotal) * 100 : null,
    encaisseTtc,
    resteTtc,
    invoiceCount,
    months,
    caByMonth,
    achatsByMonth,
  };
}

export const rel = (cur: number, prev: number): number | null =>
  prev !== 0 ? ((cur - prev) / prev) * 100 : null;

// ── MRR (abonnements du dernier mois civil de la plage) ──
export function monthAbo(docs: FactDoc[], monthKey: string): number {
  let s = 0;
  for (const d of docs) {
    if (d.kind !== "INVOICE" || d.date.slice(0, 7) !== monthKey || isInstallation(d.ht)) continue;
    s += d.ht;
  }
  return s;
}
export interface MrrResult {
  monthKey: string | null;
  monthLabel: string | null;
  mrr: number;
  pct: number | null;
}
export function computeMRR(docs: FactDoc[], range: DateRange): MrrResult {
  const months = monthsInRange(range);
  const last = months[months.length - 1];
  if (!last) return { monthKey: null, monthLabel: null, mrr: 0, pct: null };
  const mrr = monthAbo(docs, last.key);
  const prevKey = `${Number(last.key.slice(0, 4)) - 1}${last.key.slice(4)}`;
  const prev = monthAbo(docs, prevKey);
  const full = MONTH_FULL[Number(last.key.slice(5, 7)) - 1];
  return { monthKey: last.key, monthLabel: `${full} ${last.key.slice(0, 4)}`, mrr, pct: rel(mrr, prev) };
}

// ── Clients (installations / abonnements / total) ──
export interface ClientRow {
  clientName: string;
  installHt: number;
  aboHt: number;
  ca: number;
}
export function computeClients(docs: FactDoc[], range: DateRange): ClientRow[] {
  const map = new Map<string, ClientRow>();
  for (const d of docs) {
    if (d.kind !== "INVOICE" || !inRange(d.date, range)) continue;
    const key = d.clientName ?? "—";
    const cur = map.get(key) ?? { clientName: key, installHt: 0, aboHt: 0, ca: 0 };
    cur.ca += d.ht;
    if (isInstallation(d.ht)) cur.installHt += d.ht;
    else cur.aboHt += d.ht;
    map.set(key, cur);
  }
  return [...map.values()].filter((c) => c.ca !== 0).sort((a, b) => b.ca - a.ca);
}

// ── Achats par catégorie + détail (drill-down) ──
export interface CatRow {
  code: string | null;
  label: string;
  ht: number;
}
export function computeBuyCategories(items: BuyItemDoc[], range: DateRange): CatRow[] {
  const map = new Map<string, CatRow>();
  for (const it of items) {
    if (!inRange(it.date, range)) continue;
    const label = it.categoryLabel ?? "(sans catégorie)";
    const key = `${it.categoryCode ?? "—"}|${label}`;
    const cur = map.get(key) ?? { code: it.categoryCode, label, ht: 0 };
    cur.ht += it.ht;
    map.set(key, cur);
  }
  return [...map.values()].filter((c) => c.ht !== 0).sort((a, b) => b.ht - a.ht);
}

export interface BuyLine {
  supplierName: string;
  date: string;
  ht: number;
}
/** Détail des lignes d'achat d'une catégorie sur la plage (tri montant décroissant). */
export function categoryDetail(items: BuyItemDoc[], range: DateRange, label: string): BuyLine[] {
  return items
    .filter((it) => inRange(it.date, range) && (it.categoryLabel ?? "(sans catégorie)") === label)
    .map((it) => ({ supplierName: it.supplierName ?? "—", date: it.date, ht: it.ht }))
    .sort((a, b) => b.ht - a.ht);
}

export function formatDateFR(iso: string): string {
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;
}
