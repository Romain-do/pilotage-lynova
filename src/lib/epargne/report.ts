// Rapport mensuel des dépenses du compte COURANT joint + services de (re)catégorisation — Lot 2.
// Lecture/écriture via Prisma. Le périmètre « dépenses » = débits COURANT hors virements internes
// vers l'épargne (cf. isExpenseRow / isSavingsTransfer).
//
// Regroupement mensuel : à l'import (Lot 1), l'horodatage « heure locale » du CSV Revolut FR a été
// stocké TEL QUEL en UTC (cf. csv.ts). Les champs de calendrier UTC de la valeur stockée sont donc
// exactement l'heure murale d'origine (Europe/Paris) : regrouper par mois via les composantes UTC
// (toISOString) revient à regrouper par mois civil de Paris, SANS re-décalage horaire (qui, lui,
// fausserait les bornes de mois). On borne donc les requêtes en UTC.

import { prisma } from "@/lib/prisma";
import {
  categorizeExpense,
  ruleCategory,
  merchantKeyOf,
  isExpenseRow,
  isHouseholdRefundCredit,
  EXPENSE_CATEGORIES,
  type ExpenseCategory,
} from "./categorize";

export interface ReportTx {
  id: string;
  dateLabel: string; // « 5 juin »
  dateKey: string; // yyyy-mm-dd (tri)
  description: string;
  merchantKey: string;
  amount: number; // magnitude positive (dépense)
  category: ExpenseCategory;
  excluded: boolean; // exclu du budget (avance remboursée) — grisé, hors total
  refundCandidate: boolean; // « remboursement probable ? » (crédit Meg/Romain de même montant à ±3 j)
}

export interface CategorySlice {
  category: ExpenseCategory;
  amount: number;
  pct: number; // part du total du mois
  count: number;
  prevAmount: number; // même catégorie, mois précédent
  delta: number | null; // variation % vs mois précédent (null si pas de repère)
  monthlyAvg?: number; // moyenne mensuelle (total ÷ 12) — vue « 12 derniers mois » uniquement
}

export type PeriodMode = "mois" | "annee" | "perso";

export interface PeriodReport {
  mode: PeriodMode;
  periodLabel: string; // libellé humain de la période (« juin 2025 », « depuis janvier 2026 », « du 1 au 15 mars 2026 »)
  total: number;
  consumptionTotal: number; // total hors impôts (dépenses courantes ; virements foyer déjà hors périmètre)
  categories: CategorySlice[]; // triées par montant décroissant
  txByCategory: Record<string, ReportTx[]>; // drill-down (transactions de la période par catégorie)
  hasData: boolean;
  // Sélecteur « Mois »
  monthKey: string; // mois affiché (mode mois) / mois le plus récent (défaut)
  months: { key: string; label: string }[]; // récent → ancien
  // Comparaison (mode « mois » uniquement)
  prevMonthLabel: string | null;
  prevTotal: number;
  totalDelta: number | null; // variation % du total vs mois précédent
  // Bornes de la période (mode « perso » : pré-remplit les champs de dates)
  startISO: string; // yyyy-mm-dd
  endISO: string; // yyyy-mm-dd (inclus)
}

/** Catégories DANS le total des dépenses mais HORS « consommation ». Les virements au foyer
 *  (Romain/Meg) sont déjà exclus des dépenses en amont (isExpenseRow) → ne restent ici que les
 *  prélèvements fiscaux : « consommation » = dépenses − impôts. */
const NON_CONSUMPTION: ReadonlySet<string> = new Set(["Impôts / URSSAF"]);

const MONTH_FMT = new Intl.DateTimeFormat("fr-FR", { month: "long", year: "numeric", timeZone: "UTC" });
const MONTH_SHORT_FMT = new Intl.DateTimeFormat("fr-FR", { month: "short", timeZone: "UTC" });
const MONTH_SHORT_YEAR_FMT = new Intl.DateTimeFormat("fr-FR", { month: "short", year: "numeric", timeZone: "UTC" });

/** Libellé court avec année (« juil. 2025 ») d'un mois yyyy-mm. */
function shortMonthYearLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return MONTH_SHORT_YEAR_FMT.format(new Date(Date.UTC(y, m - 1, 1)));
}
const DAY_FMT_YEAR = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short", year: "2-digit", timeZone: "UTC" });
const FULL_DATE_FMT = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
const DAY_MS = 24 * 60 * 60 * 1000;

/** yyyy-mm-dd (UTC) d'une Date. */
const isoOf = (d: Date): string => d.toISOString().slice(0, 10);

/** Parse un yyyy-mm-dd en Date UTC (minuit), ou null si invalide. */
function parseISODate(s: string | undefined): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(`${s}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Clé de mois civil (yyyy-mm) d'une date — composantes UTC (= heure murale Paris, cf. en-tête). */
function monthKeyOf(d: Date): string {
  return d.toISOString().slice(0, 7);
}

/** Bornes UTC [gte, lt) d'un mois yyyy-mm. */
function monthRange(monthKey: string): { gte: Date; lt: Date } {
  const [y, m] = monthKey.split("-").map(Number);
  return { gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) };
}

/** Mois précédent (yyyy-mm). */
function prevMonthOf(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 2, 1));
  return d.toISOString().slice(0, 7);
}

/** Libellé « juin 2025 » d'un mois yyyy-mm. */
function monthLabelOf(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  return MONTH_FMT.format(new Date(Date.UTC(y, m - 1, 1)));
}

/** Libellé court d'axe (« juin », « janv 26 » en janvier pour ancrer l'année) d'un mois yyyy-mm. */
function shortMonthLabel(monthKey: string): string {
  const [y, m] = monthKey.split("-").map(Number);
  const base = MONTH_SHORT_FMT.format(new Date(Date.UTC(y, m - 1, 1))).replace(".", "");
  return m === 1 ? `${base} ${String(y).slice(2)}` : base;
}

export interface SavingsPoint {
  key: string;
  label: string;
  inflow: number;
  outflow: number;
  endBalance: number; // solde fin de mois (métrique tracée)
  missing?: boolean; // courbe N-1 : pas d'équivalent ce mois → segment interrompu (pas de chute à 0)
}

export interface SavingsEvolution {
  series: SavingsPoint[]; // 12 derniers mois glissants
  currentBalance: number; // dernier solde connu
  totalInterest: number; // somme des lignes de type « Intérêts » (tout l'historique)
  prevYearBalance: number | null; // solde épargne fin du même mois l'an dernier (null si indisponible)
  prevYearLabel: string | null; // libellé du mois N-1 (« juil. 2025 »), null si indisponible
  yoyDelta: number | null; // variation % vs le même mois l'an dernier (null si pas de N-1)
}

export interface CourantEvolution {
  series: SavingsPoint[]; // 12 derniers mois glissants (courbe épurée, sans N-1)
  currentBalance: number;
}

const MAX_ITER = 600; // garde-fou d'itération (données perso → quelques années au plus)

/**
 * Solde de FIN DE MOIS d'un compte (report du dernier solde connu) sur toute la période disponible :
 * pour chaque mois, le solde de la dernière transaction (colonne `balance`) ; les mois sans
 * mouvement reportent le dernier solde connu (courbe continue). + solde actuel & intérêts cumulés.
 */
async function endOfMonthBalances(account: "COURANT" | "EPARGNE"): Promise<{
  months: string[];
  balByMonth: Map<string, number>;
  currentBalance: number;
  totalInterest: number;
} | null> {
  const rows = await prisma.persoTransaction.findMany({
    where: { account },
    orderBy: { startedAt: "asc" },
    select: { startedAt: true, balance: true, amount: true, type: true },
  });
  if (rows.length === 0) return null;

  const rawByMonth = new Map<string, number>();
  let totalInterest = 0;
  for (const r of rows) {
    rawByMonth.set(monthKeyOf(r.startedAt), Number(r.balance)); // asc → la DERNIÈRE du mois gagne
    if (/int[eé]r[eê]t/i.test(r.type)) totalInterest += Number(r.amount);
  }

  const firstKey = monthKeyOf(rows[0].startedAt);
  const lastKey = monthKeyOf(rows[rows.length - 1].startedAt);
  const months: string[] = [];
  const balByMonth = new Map<string, number>();
  let carry = 0;
  let [y, m] = firstKey.split("-").map(Number);
  for (let i = 0; i < MAX_ITER; i++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    if (rawByMonth.has(key)) carry = rawByMonth.get(key)!;
    months.push(key);
    balByMonth.set(key, carry);
    if (key === lastKey) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return { months, balByMonth, currentBalance: Number(rows[rows.length - 1].balance), totalInterest };
}

const point = (key: string, endBalance: number): SavingsPoint => ({ key, label: shortMonthLabel(key), inflow: 0, outflow: 0, endBalance });

/** Décale une clé de mois d'un an en arrière (2026-06 → 2025-06). */
function prevYearKey(key: string): string {
  return `${Number(key.slice(0, 4)) - 1}${key.slice(4)}`;
}

/**
 * Évolution de l'épargne — 12 derniers mois glissants + solde actuel & intérêts cumulés + variation
 * N-1 (solde au même mois l'an dernier). `yoyDelta`/`prevYearBalance` sont null si aucun équivalent
 * l'an précédent (données < 12 mois pour ce mois) → la carte masque le badge.
 */
export async function getSavingsEvolution(): Promise<SavingsEvolution | null> {
  const data = await endOfMonthBalances("EPARGNE");
  if (!data) return null;
  const last12 = data.months.slice(-12);
  const lastKey = data.months[data.months.length - 1];
  const pk = prevYearKey(lastKey); // même mois, année précédente
  // Garde-fou : disponible seulement si ce mois N-1 est dans la période de données épargne.
  const prevYearBalance = data.balByMonth.has(pk) ? data.balByMonth.get(pk)! : null;
  const prevYearLabel = prevYearBalance != null ? shortMonthYearLabel(pk) : null;
  const yoyDelta = prevYearBalance && prevYearBalance !== 0 ? ((data.currentBalance - prevYearBalance) / prevYearBalance) * 100 : null;
  return {
    series: last12.map((k) => point(k, data.balByMonth.get(k)!)),
    currentBalance: data.currentBalance,
    totalInterest: data.totalInterest,
    prevYearBalance,
    prevYearLabel,
    yoyDelta,
  };
}

/** Solde du compte COURANT — 12 derniers mois glissants (courbe épurée, sans N-1). */
export async function getCourantEvolution(): Promise<CourantEvolution | null> {
  const data = await endOfMonthBalances("COURANT");
  if (!data) return null;
  const last12 = data.months.slice(-12);
  return { series: last12.map((k) => point(k, data.balByMonth.get(k)!)), currentBalance: data.currentBalance };
}

/** Liste des mois civils entre le premier et le dernier mois ayant une transaction COURANT. */
async function availableMonths(): Promise<{ key: string; label: string }[]> {
  const [min, max] = await Promise.all([
    prisma.persoTransaction.findFirst({ where: { account: "COURANT" }, orderBy: { startedAt: "asc" }, select: { startedAt: true } }),
    prisma.persoTransaction.findFirst({ where: { account: "COURANT" }, orderBy: { startedAt: "desc" }, select: { startedAt: true } }),
  ]);
  if (!min || !max) return [];
  const keys: string[] = [];
  let [y, m] = monthKeyOf(min.startedAt).split("-").map(Number);
  const last = monthKeyOf(max.startedAt);
  // Garde-fou : borne le nombre d'itérations (données perso → quelques années au plus).
  for (let i = 0; i < 600; i++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    keys.push(key);
    if (key === last) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return keys.reverse().map((key) => ({ key, label: monthLabelOf(key) }));
}

/** Dépenses COURANT d'un mois → total + montant par catégorie (pour le repère mois précédent).
 *  Les transactions exclues du budget (`excluded`) sont ignorées, comme dans le mois affiché. */
async function monthExpenseTotals(monthKey: string): Promise<{ total: number; byCategory: Map<string, number> }> {
  const { gte, lt } = monthRange(monthKey);
  const rows = await prisma.persoTransaction.findMany({
    where: { account: "COURANT", startedAt: { gte, lt }, excluded: false },
    select: { type: true, description: true, amount: true, category: true },
  });
  const byCategory = new Map<string, number>();
  let total = 0;
  for (const r of rows) {
    if (!isExpenseRow(r)) continue;
    const amt = -Number(r.amount);
    const cat = (r.category as ExpenseCategory | null) ?? ruleCategory(r.type, r.description) ?? "Autres";
    byCategory.set(cat, (byCategory.get(cat) ?? 0) + amt);
    total += amt;
  }
  return { total, byCategory };
}

const REFUND_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // ±3 jours
const REFUND_AMOUNT_TOLERANCE_CENTS = 100; // ±1 € (remboursements parfois arrondis)

/**
 * Repère les crédits ENTRANTS de type Virement provenant de Meg/Romain autour du mois (fenêtre
 * élargie de ±3 j aux bornes), pour détecter les avances remboursées. Renvoie une fonction :
 * un débit est « remboursement probable » s'il existe un tel crédit de montant proche (±1 €) à ±3 jours.
 */
async function buildRefundMatcher(gte: Date, lt: Date): Promise<(amount: number, at: Date) => boolean> {
  const rows = await prisma.persoTransaction.findMany({
    where: {
      account: "COURANT",
      amount: { gt: 0 }, // crédits
      startedAt: { gte: new Date(gte.getTime() - REFUND_WINDOW_MS), lt: new Date(lt.getTime() + REFUND_WINDOW_MS) },
    },
    select: { type: true, description: true, amount: true, startedAt: true },
  });
  // Crédits « virement de Meg/Romain » (hors transferts internes depuis l'épargne, cf.
  // isHouseholdRefundCredit) : (montant en centimes, instant). Tolérance sur le montant →
  // on ne peut pas indexer par montant exact, on scanne la liste (volume perso faible).
  const credits: { cents: number; time: number }[] = [];
  for (const r of rows) {
    if (!isHouseholdRefundCredit(r.type, r.description)) continue;
    credits.push({ cents: Math.round(Number(r.amount) * 100), time: r.startedAt.getTime() });
  }
  return (amount: number, at: Date) => {
    const cents = Math.round(amount * 100);
    const t = at.getTime();
    return credits.some(
      (c) => Math.abs(c.cents - cents) <= REFUND_AMOUNT_TOLERANCE_CENTS && Math.abs(c.time - t) <= REFUND_WINDOW_MS,
    );
  };
}

/**
 * Cœur commun : agrège les dépenses du compte COURANT sur une plage [gte, lt) — total, total
 * consommation (hors impôts), ventilation par catégorie et drill-down. Les transactions exclues
 * restent visibles (grisées) mais hors total/catégories. `prevByCategory` (mode mois) permet la
 * variation par catégorie ; sinon delta null.
 */
async function buildExpenseReport(
  gte: Date,
  lt: Date,
  prevByCategory?: Map<string, number>,
): Promise<{ total: number; consumptionTotal: number; categories: CategorySlice[]; txByCategory: Record<string, ReportTx[]>; hasData: boolean }> {
  const [rows, isRefund] = await Promise.all([
    prisma.persoTransaction.findMany({
      where: { account: "COURANT", startedAt: { gte, lt } },
      orderBy: { startedAt: "desc" },
      select: { id: true, type: true, description: true, amount: true, category: true, startedAt: true, excluded: true },
    }),
    buildRefundMatcher(gte, lt),
  ]);

  const txByCategory: Record<string, ReportTx[]> = {};
  const catTotals = new Map<string, number>();
  const catHasTx = new Set<string>();
  let total = 0;
  let consumptionTotal = 0;

  for (const r of rows) {
    if (!isExpenseRow(r)) continue;
    const amount = -Number(r.amount);
    const category = ((r.category as ExpenseCategory | null) ?? ruleCategory(r.type, r.description) ?? "Autres") as ExpenseCategory;
    catHasTx.add(category);
    if (!r.excluded) {
      total += amount;
      if (!NON_CONSUMPTION.has(category)) consumptionTotal += amount;
      catTotals.set(category, (catTotals.get(category) ?? 0) + amount);
    }
    (txByCategory[category] ??= []).push({
      id: r.id,
      dateKey: r.startedAt.toISOString().slice(0, 10),
      dateLabel: DAY_FMT_YEAR.format(r.startedAt),
      description: r.description,
      merchantKey: merchantKeyOf(r.description),
      amount,
      category,
      excluded: r.excluded,
      refundCandidate: !r.excluded && isRefund(amount, r.startedAt),
    });
  }

  const categories: CategorySlice[] = [...catHasTx]
    .map((category) => {
      const amount = catTotals.get(category) ?? 0;
      const prevAmount = prevByCategory?.get(category) ?? 0;
      return {
        category: category as ExpenseCategory,
        amount,
        pct: total > 0 ? (amount / total) * 100 : 0,
        count: (txByCategory[category] ?? []).filter((t) => !t.excluded).length,
        prevAmount,
        delta: prevAmount > 0 ? ((amount - prevAmount) / prevAmount) * 100 : null,
      };
    })
    .sort((a, b) => b.amount - a.amount);

  return { total, consumptionTotal, categories, txByCategory, hasData: rows.length > 0 };
}

/**
 * Rapport des dépenses du compte COURANT pour une PÉRIODE : mois (avec sélecteur + variation vs
 * mois précédent), année en cours (depuis janvier), ou plage personnalisée. Renvoie null si aucune
 * donnée. Les paramètres proviennent de l'URL (`vue`, `mois`, `debut`, `fin`).
 */
export async function getPeriodReport(params: {
  vue?: string;
  mois?: string;
  debut?: string;
  fin?: string;
}): Promise<PeriodReport | null> {
  const months = await availableMonths();
  if (months.length === 0) return null;

  const validMonths = new Set(months.map((m) => m.key));
  const latest = months[0].key; // récent → ancien
  const earliest = months[months.length - 1].key;
  const mode: PeriodMode = params.vue === "annee" ? "annee" : params.vue === "perso" ? "perso" : "mois";

  // Défauts communs (bornes des données) pour pré-remplir le mode « perso ».
  const dataStartISO = `${earliest}-01`;
  const dataEndISO = isoOf(new Date(monthRange(latest).lt.getTime() - DAY_MS));

  let gte: Date;
  let lt: Date;
  let periodLabel: string;
  let monthKey = latest;
  let startISO = dataStartISO;
  let endISO = dataEndISO;
  let prevByCategory: Map<string, number> | undefined;
  let prevMonthLabel: string | null = null;
  let prevTotal = 0;
  let prevMonthKey: string | null = null;

  if (mode === "annee") {
    const year = Number(latest.slice(0, 4));
    gte = new Date(Date.UTC(year, 0, 1));
    lt = monthRange(latest).lt;
    startISO = `${year}-01-01`;
    endISO = dataEndISO;
    periodLabel = `Depuis janvier ${year}`;
  } else if (mode === "perso") {
    const a0 = parseISODate(params.debut) ?? new Date(`${dataStartISO}T00:00:00Z`);
    const b0 = parseISODate(params.fin) ?? new Date(`${dataEndISO}T00:00:00Z`);
    const [a, b] = a0.getTime() <= b0.getTime() ? [a0, b0] : [b0, a0]; // ordre tolérant
    gte = a;
    lt = new Date(b.getTime() + DAY_MS); // borne de fin incluse
    startISO = isoOf(a);
    endISO = isoOf(b);
    periodLabel = `Du ${FULL_DATE_FMT.format(a)} au ${FULL_DATE_FMT.format(b)}`;
  } else {
    // mode « mois »
    monthKey = params.mois && validMonths.has(params.mois) ? params.mois : latest;
    ({ gte, lt } = monthRange(monthKey));
    startISO = `${monthKey}-01`;
    endISO = isoOf(new Date(lt.getTime() - DAY_MS));
    periodLabel = monthLabelOf(monthKey);
    prevMonthKey = prevMonthOf(monthKey);
    if (validMonths.has(prevMonthKey)) {
      const prev = await monthExpenseTotals(prevMonthKey);
      prevByCategory = prev.byCategory;
      prevTotal = prev.total;
      prevMonthLabel = monthLabelOf(prevMonthKey);
    }
  }

  const built = await buildExpenseReport(gte, lt, prevByCategory);
  const totalDelta = prevMonthLabel && prevTotal > 0 ? ((built.total - prevTotal) / prevTotal) * 100 : null;

  return {
    mode,
    periodLabel,
    total: built.total,
    consumptionTotal: built.consumptionTotal,
    categories: built.categories,
    txByCategory: built.txByCategory,
    hasData: built.hasData,
    monthKey,
    months,
    prevMonthLabel,
    prevTotal,
    totalDelta,
    startISO,
    endISO,
  };
}

/** Assure l'ordre canonique des catégories (pour couleurs/légende stables côté UI). */
export const CATEGORY_ORDER = EXPENSE_CATEGORIES;

export interface RollingReport {
  rangeLabel: string; // « juillet 2025 → juin 2026 »
  total: number; // dépenses des 12 derniers mois (hors exclues)
  consumptionTotal: number; // hors virements Romain/Meg & impôts
  categories: CategorySlice[]; // top 10 par montant décroissant
  txByCategory: Record<string, ReportTx[]>; // détail 12 mois (top 10 uniquement)
}

/**
 * Rapport « 12 derniers mois glissants » : classement des catégories de dépenses du compte COURANT
 * (top 10 par montant), + détail de TOUTES les transactions de ces catégories sur la fenêtre.
 * Exclut les transactions `excluded` des montants (mais les garde visibles/grisées au drill-down),
 * et distingue total / consommation (hors virements Romain/Meg & impôts).
 */
export async function getRollingCategoryReport(): Promise<RollingReport | null> {
  const months = await availableMonths(); // récent → ancien
  if (months.length === 0) return null;
  const lastKey = months[0].key;
  const [ly, lm] = lastKey.split("-").map(Number);
  const firstKey = new Date(Date.UTC(ly, lm - 1 - 11, 1)).toISOString().slice(0, 7); // 12 mois glissants
  const gte = monthRange(firstKey).gte;
  const lt = monthRange(lastKey).lt;

  const rows = await prisma.persoTransaction.findMany({
    where: { account: "COURANT", startedAt: { gte, lt } },
    orderBy: { startedAt: "desc" },
    select: { id: true, type: true, description: true, amount: true, category: true, startedAt: true, excluded: true },
  });

  const txByCategory: Record<string, ReportTx[]> = {};
  const catTotals = new Map<string, number>();
  let total = 0;
  let consumptionTotal = 0;

  for (const r of rows) {
    if (!isExpenseRow(r)) continue;
    const amount = -Number(r.amount);
    const category = ((r.category as ExpenseCategory | null) ?? ruleCategory(r.type, r.description) ?? "Autres") as ExpenseCategory;
    if (!r.excluded) {
      total += amount;
      if (!NON_CONSUMPTION.has(category)) consumptionTotal += amount;
      catTotals.set(category, (catTotals.get(category) ?? 0) + amount);
    }
    (txByCategory[category] ??= []).push({
      id: r.id,
      dateKey: r.startedAt.toISOString().slice(0, 10),
      dateLabel: DAY_FMT_YEAR.format(r.startedAt),
      description: r.description,
      merchantKey: merchantKeyOf(r.description),
      amount,
      category,
      excluded: r.excluded,
      refundCandidate: false, // repère mensuel (le badge « remboursement » reste au rapport du mois)
    });
  }

  const topCats = [...catTotals.entries()].filter(([, a]) => a > 0).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const categories: CategorySlice[] = topCats.map(([category, amount]) => ({
    category: category as ExpenseCategory,
    amount,
    pct: total > 0 ? (amount / total) * 100 : 0,
    count: (txByCategory[category] ?? []).filter((t) => !t.excluded).length,
    prevAmount: 0,
    delta: null,
    monthlyAvg: amount / 12, // moyenne mensuelle sur les 12 mois glissants
  }));

  // Ne conserver le détail que pour les catégories du top 10 (limite la charge côté client).
  const filtered: Record<string, ReportTx[]> = {};
  for (const [category] of topCats) filtered[category] = txByCategory[category] ?? [];

  return {
    rangeLabel: `${monthLabelOf(firstKey)} → ${monthLabelOf(lastKey)}`,
    total,
    consumptionTotal,
    categories,
    txByCategory: filtered,
  };
}

// ─────────────────────────── (Re)catégorisation ───────────────────────────

/**
 * Enregistre une correction marchand → catégorie (MerchantCategory) et recatégorise TOUTES les
 * transactions COURANT de ce marchand (même merchantKey). Idempotent. Renvoie le nb de lignes mises à jour.
 */
export async function applyMerchantCategory(merchantKey: string, category: ExpenseCategory): Promise<number> {
  await prisma.merchantCategory.upsert({
    where: { merchantKey },
    update: { category },
    create: { merchantKey, category },
  });

  const rows = await prisma.persoTransaction.findMany({
    where: { account: "COURANT" },
    select: { id: true, description: true, amount: true },
  });
  const ids = rows
    .filter((r) => isExpenseRow(r) && merchantKeyOf(r.description) === merchantKey)
    .map((r) => r.id);
  if (ids.length > 0) {
    await prisma.persoTransaction.updateMany({ where: { id: { in: ids } }, data: { category } });
  }
  return ids.length;
}

/**
 * (Re)catégorise TOUTES les transactions COURANT (backfill + réparation). Applique la priorité
 * mapping → règles → « Autres » aux dépenses ; met `category` à null pour les non-dépenses
 * (crédits, virements internes vers l'épargne). Renvoie le nb de lignes modifiées.
 */
export async function recategorizeAllCourant(): Promise<{ scanned: number; updated: number }> {
  const mapping = new Map((await prisma.merchantCategory.findMany()).map((m) => [m.merchantKey, m.category]));
  const rows = await prisma.persoTransaction.findMany({
    where: { account: "COURANT" },
    select: { id: true, type: true, description: true, amount: true, category: true },
  });

  // Regroupe les ids par catégorie cible (null = non-dépense) et n'écrit que les vrais changements.
  const byTarget = new Map<ExpenseCategory | null, string[]>();
  for (const r of rows) {
    const target: ExpenseCategory | null = isExpenseRow(r)
      ? categorizeExpense(r.type, r.description, mapping)
      : null;
    if ((r.category ?? null) === target) continue; // déjà à jour
    const list = byTarget.get(target) ?? [];
    list.push(r.id);
    byTarget.set(target, list);
  }

  let updated = 0;
  for (const [target, ids] of byTarget) {
    for (let i = 0; i < ids.length; i += 1000) {
      const batch = ids.slice(i, i + 1000);
      await prisma.persoTransaction.updateMany({ where: { id: { in: batch } }, data: { category: target } });
      updated += batch.length;
    }
  }
  return { scanned: rows.length, updated };
}

/** Catégorie de dépense d'une ligne parsée (import) : mapping → règles → « Autres », ou null si non-dépense. */
export function categoryForRow(
  row: { account: string; type: string; description: string; amount: number | string },
  mapping: Map<string, string>,
): ExpenseCategory | null {
  if (row.account !== "COURANT" || !isExpenseRow(row)) return null;
  return categorizeExpense(row.type, row.description, mapping);
}
