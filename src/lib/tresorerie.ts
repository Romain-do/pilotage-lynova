// Types & helpers Trésorerie (§5.4-5.7). Plage de dates partagée avec Facturation.
// Tout en lecture du cache Revolut. CA/flux en EUR.

import { monthsInRange, type DateRange } from "@/lib/facturation";

export interface TAccount {
  id: string;
  name: string | null;
  currency: string;
  kind: "FIAT" | "CRYPTO";
  balance: number;
  rateToEur: number | null;
  valoEur: number | null;
}

/** Agrégat par mois civil : flux externes EUR + solde EUR fin de mois (§5.4). */
export interface MonthRow {
  key: string; // YYYY-MM
  inflow: number; // ≥ 0
  outflow: number; // ≤ 0
  endBalance: number; // solde EUR total fin de mois
}

/** Décaissement externe (pour catégorisation par libellé `reference`). */
export interface OutflowRow {
  date: string; // yyyy-mm-dd
  reference: string;
  counterparty: string | null;
  amount: number; // magnitude positive
}

export interface CryptoPnl {
  invested: number;
  recovered: number;
  value: number;
  pnl: number;
  pct: number | null;
  transferredOutValue: number; // crypto sortie hors plateforme (valo au cours du sync)
}

export interface TCatRow {
  label: string;
  amount: number;
}

const monthInRange = (key: string, r: DateRange) => key >= r.start.slice(0, 7) && key <= r.end.slice(0, 7);
const dateInRange = (d: string, r: DateRange) => d >= r.start && d <= r.end;

// ── Catégorisation des décaissements ──
// Matche sur le libellé `reference` ET le bénéficiaire (`counterparty`, ex. « To Leaya »),
// car beaucoup de libellés ne sont pas parlants. Les deux sont concaténés puis normalisés
// (minuscules, sans accents). Règles appliquées dans l'ordre : la PREMIÈRE qui matche gagne
// (l'ordre est important — ex. « Assurance » et « Rémunération » priment sur « Romain Ioli »).
// Facile à enrichir : ajoute une entrée au bon rang.
export const CATEGORY_RULES: { label: string; match: (norm: string) => boolean }[] = [
  { label: "Assurance", match: (r) => /(assurance|\bmapa\b)/.test(r) },
  { label: "TVA", match: (r) => /(tva|3310|ca3)/.test(r) },
  { label: "Impôt sociétés (IS)", match: (r) => /(is-|2571|2572|impot societes)/.test(r) },
  { label: "Charges sociales", match: (r) => /(urssaf|ur 11700|cotisation|\brsi\b)/.test(r) },
  { label: "Loyer", match: (r) => r.includes("loyer") },
  { label: "Électricité", match: (r) => /(electricite|belle energie)/.test(r) },
  { label: "Rémunération", match: (r) => /(remuneration|salaire)/.test(r) },
  { label: "Comptable", match: (r) => r.includes("orcom") },
  { label: "Abonnements & télécom", match: (r) => /(\bfree\b|canal|coyote|\bovh\b)/.test(r) },
  { label: "Notes de frais", match: (r) => r.includes("romain ioli") },
  { label: "Fournisseurs", match: (r) => /(leaya|2bsystem|agrolog|kymono|alissa|abc liv)/.test(r) },
];

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function categorize(reference: string | null | undefined, counterparty?: string | null): string {
  const ref = (reference ?? "").trim();
  const cp = (counterparty ?? "").trim();
  if (!ref && !cp) return "(sans libellé)";
  const hay = norm(`${ref} ${cp}`);
  for (const rule of CATEGORY_RULES) if (rule.match(hay)) return rule.label;
  return "Autres";
}

/** Mois de la plage (clé + label), pour l'axe du graphe. */
export function rangeMonths(range: DateRange): { key: string; label: string }[] {
  return monthsInRange(range).map((m) => ({ key: m.key, label: m.label }));
}

/** Flux entrées/sorties sur la plage. */
export function flowsInRange(months: MonthRow[], range: DateRange): { inflow: number; outflow: number; net: number } {
  let inflow = 0, outflow = 0;
  for (const m of months) {
    if (!monthInRange(m.key, range)) continue;
    inflow += m.inflow;
    outflow += m.outflow;
  }
  return { inflow, outflow, net: inflow + outflow };
}

/** Série mensuelle alignée sur les mois de la plage (flux + solde fin de mois, reporté). */
export function seriesForRange(
  months: MonthRow[],
  range: DateRange
): { key: string; label: string; inflow: number; outflow: number; endBalance: number }[] {
  const byKey = new Map(months.map((m) => [m.key, m]));
  // Dernier solde connu avant la plage (report).
  let carry = 0;
  for (const m of months) {
    if (m.key < range.start.slice(0, 7)) carry = m.endBalance;
    else break;
  }
  return rangeMonths(range).map((m) => {
    const row = byKey.get(m.key);
    if (row) carry = row.endBalance;
    return {
      key: m.key,
      label: m.label,
      inflow: row?.inflow ?? 0,
      outflow: row?.outflow ?? 0,
      endBalance: carry,
    };
  });
}

/** Dépenses externes regroupées par CATÉGORIE (règles sur `reference`) sur la plage. */
export function categoriesInRange(outflows: OutflowRow[], range: DateRange): TCatRow[] {
  const map = new Map<string, number>();
  for (const o of outflows) {
    if (!dateInRange(o.date, range)) continue;
    const label = categorize(o.reference, o.counterparty);
    map.set(label, (map.get(label) ?? 0) + o.amount);
  }
  return [...map.entries()].map(([label, amount]) => ({ label, amount })).sort((a, b) => b.amount - a.amount);
}

// ── Marge nette base DÉPENSES Revolut ──
// Principe : tout le flux professionnel passe par Revolut. Les charges = TOUS les décaissements
// EXTERNES (les outflows sont déjà filtrés : hors virements internes, hors exchange/crypto, hors
// Coinbase — cf. buildTresorerie) SAUF une deny-list de NON-charges. Aucun achat Evoliz n'entre
// ici : la marge nette = CA HT − charges Revolut. La marge COMMERCIALE (CA − achats Evoliz) reste
// un indicateur séparé et inchangé. Pas de double comptage (chaque dépense comptée une seule fois).

/** Catégories `categorize()` exclues des charges (non-charges, pass-through / hors résultat) :
 *  - TVA : collectée puis reversée (CA déjà en HT).
 *  - Impôt sociétés (IS) : marge nette = AVANT impôt sur les bénéfices.
 *  (Virements internes & crypto : déjà exclus en amont des outflows.) */
export const DENY_CATEGORIES: readonly string[] = ["TVA", "Impôt sociétés (IS)"];

/** Catégories de charges affichées/empilées, dans l'ordre des segments du graphe.
 *  « Autres » = décaissement avec libellé mais hors règles (dépense opérationnelle réelle). */
export const CHARGE_CATEGORIES = [
  "Rémunération",
  "Loyer",
  "Électricité",
  "Charges sociales",
  "Assurance",
  "Comptable",
  "Abonnements & télécom",
  "Fournisseurs",
  "Notes de frais",
  "Autres",
] as const;
export type ChargeCategory = (typeof CHARGE_CATEGORIES)[number];

/** Catégorie de charge d'un décaissement, ou null s'il s'agit d'une non-charge (deny-list).
 *  « (sans libellé) » (résiduel, ≈ 0 €) est replié sur « Autres ». */
function chargeCategoryOf(reference: string | null | undefined, counterparty?: string | null): ChargeCategory | null {
  const c = categorize(reference, counterparty);
  if (DENY_CATEGORIES.includes(c)) return null;
  if (c === "(sans libellé)") return "Autres";
  return c as ChargeCategory;
}

function emptyByCategory(): Record<ChargeCategory, number> {
  return Object.fromEntries(CHARGE_CATEGORIES.map((c) => [c, 0])) as Record<ChargeCategory, number>;
}

/** Charges Revolut sur la plage : total + ventilation par catégorie (hors deny-list).
 *  Base de la marge nette = CA HT − total. */
export interface RevolutCharges {
  total: number;
  byCategory: Record<ChargeCategory, number>;
}
export function netChargesInRange(outflows: OutflowRow[], range: DateRange): RevolutCharges {
  const byCategory = emptyByCategory();
  let total = 0;
  for (const o of outflows) {
    if (!dateInRange(o.date, range)) continue;
    const cc = chargeCategoryOf(o.reference, o.counterparty);
    if (cc == null) continue; // non-charge (TVA / IS)
    byCategory[cc] += o.amount;
    total += o.amount;
  }
  return { total, byCategory };
}

// ── Séries mensuelles (oct→sept) & par mois civil pour les graphes ──

/** Rémunération (décaissements Revolut « Rémunération ») ventilée sur les 12 mois fiscaux
 *  [oct → sept] d'un exercice `fy`. Indices oct=0 … sept=11. Mois sans décaissement = 0.
 *  Symétrique de `caHtByFiscalMonth` côté Facturation. */
export function remuByFiscalMonth(outflows: OutflowRow[], fy: number): number[] {
  const out = new Array(12).fill(0);
  const start = `${fy - 1}-10-01`;
  const end = `${fy}-09-30`;
  for (const o of outflows) {
    if (o.date < start || o.date > end) continue;
    if (categorize(o.reference, o.counterparty) !== "Rémunération") continue;
    const m = Number(o.date.slice(5, 7));
    out[m >= 10 ? m - 10 : m + 2] += o.amount;
  }
  return out;
}

/** Charges Revolut (hors deny-list) ventilées par catégorie ET par mois CIVIL, alignées sur
 *  `months` (mêmes clés YYYY-MM que `computeRange`). Sert la barre empilée « CA vs charges ».
 *  Chaque catégorie → un tableau de longueur `months`. Mois hors `months` ignorés ; mois sans
 *  décaissement (avant les données bancaires) → 0. La somme de toutes les catégories sur la plage
 *  égale `netChargesInRange(range).total` (mêmes outflows, même deny-list). */
export function chargeComponentsByMonth(
  outflows: OutflowRow[],
  months: { key: string }[]
): Record<ChargeCategory, number[]> {
  const idx = new Map(months.map((m, i) => [m.key, i]));
  const out = Object.fromEntries(
    CHARGE_CATEGORIES.map((c) => [c, new Array(months.length).fill(0)])
  ) as Record<ChargeCategory, number[]>;
  for (const o of outflows) {
    const i = idx.get(o.date.slice(0, 7));
    if (i == null) continue;
    const cc = chargeCategoryOf(o.reference, o.counterparty);
    if (cc == null) continue; // non-charge (TVA / IS)
    out[cc][i] += o.amount;
  }
  return out;
}

/** Date du plus ancien décaissement capté (début des données bancaires). */
export function earliestOutflowDate(outflows: OutflowRow[]): string | null {
  let min: string | null = null;
  for (const o of outflows) if (min === null || o.date < min) min = o.date;
  return min;
}

/** Total versé à Leaya sur la plage — indépendant de la catégorisation (somme des
 *  décaissements dont le bénéficiaire/libellé contient « leaya »). Alimente la carte KPI
 *  Leaya, alors que la répartition par catégorie range ces montants dans « Fournisseurs ». */
export function leayaInRange(outflows: OutflowRow[], range: DateRange): number {
  let sum = 0;
  for (const o of outflows) {
    if (!dateInRange(o.date, range)) continue;
    if (norm(`${o.reference} ${o.counterparty ?? ""}`).includes("leaya")) sum += o.amount;
  }
  return sum;
}

/** Détail des décaissements d'une catégorie (libellés bruts + dates + montants). */
export function categoryOutflows(outflows: OutflowRow[], range: DateRange, label: string): OutflowRow[] {
  return outflows
    .filter((o) => dateInRange(o.date, range) && categorize(o.reference, o.counterparty) === label)
    .sort((a, b) => b.amount - a.amount);
}

/** Liste des exercices fiscaux présents dans les mois du cache. */
export function fiscalYearsFromMonths(months: MonthRow[]): number[] {
  const set = new Set<number>();
  for (const m of months) {
    const y = Number(m.key.slice(0, 4));
    const mm = Number(m.key.slice(5, 7));
    set.add(y + (mm >= 10 ? 1 : 0));
  }
  return [...set].sort((a, b) => b - a);
}
