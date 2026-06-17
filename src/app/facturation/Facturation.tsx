"use client";

import { useMemo, useState } from "react";
import {
  IconCoin,
  IconPigMoney,
  IconRepeat,
  IconShoppingCart,
  IconCash,
  IconClock,
  IconX,
} from "@tabler/icons-react";
import {
  euro,
  pct1,
  formatDateFR,
  computeRange,
  computeMRR,
  computeClients,
  computeBuyCategories,
  categoryDetail,
  listFiscalYears,
  fyRange,
  presetRange,
  presetLabel,
  shiftYear,
  rangeLabel,
  fyOf,
  rel,
  caHtByFiscalMonth,
  type FactDoc,
  type BuyDoc,
  type BuyItemDoc,
  type TypeFilter,
  type DateRange,
  type PresetKey,
  type CatRow,
} from "@/lib/facturation";
import { netChargesInRange, chargeComponentsByMonth, horsExploitationByMonth, earliestOutflowDate, leayaInRange, type OutflowRow } from "@/lib/tresorerie";
import { staleSourcesLabel, type Freshness } from "@/lib/sync-state";
import { KpiCard } from "@/components/KpiCard";
import { MargeNetteCard } from "@/components/MargeNetteCard";
import { LeayaCard } from "@/components/LeayaCard";
import { CaVsN1Chart } from "@/components/CaVsN1Chart";
import { CaVsChargesChart, ChargesLegend } from "@/components/CaVsChargesChart";
import { RefreshButton } from "@/components/RefreshButton";
import { InfoTip } from "@/components/InfoTip";

const TYPES: { key: TypeFilter; label: string }[] = [
  { key: "all", label: "Tout" },
  { key: "abo", label: "Abo" },
  { key: "install", label: "Install." },
];
const PRESETS: PresetKey[] = ["current-month", "current-quarter", "last-12-months"];

type Period =
  | { kind: "fy"; fy: number }
  | { kind: "preset"; key: PresetKey }
  | { kind: "custom"; start: string; end: string };

export function Facturation({
  docs,
  buys,
  buyItems,
  outflows,
  todayISO,
  lastSync,
  freshness,
}: {
  docs: FactDoc[];
  buys: BuyDoc[];
  buyItems: BuyItemDoc[];
  outflows: OutflowRow[];
  todayISO: string;
  lastSync: string | null;
  freshness: Freshness;
}) {
  const fyList = useMemo(() => listFiscalYears(docs), [docs]);
  const [period, setPeriod] = useState<Period>({ kind: "fy", fy: fyList[0] ?? fyOf(todayISO) });
  const [filter, setFilter] = useState<TypeFilter>("all");
  const [clientSort, setClientSort] = useState<"ca" | "abo">("ca");
  const [drill, setDrill] = useState<CatRow | null>(null);

  const range: DateRange = useMemo(() => {
    if (period.kind === "fy") return fyRange(period.fy, todayISO);
    if (period.kind === "preset") return presetRange(period.key, todayISO);
    return { start: period.start, end: period.end };
  }, [period, todayISO]);

  const cur = useMemo(() => computeRange(docs, buys, range, filter), [docs, buys, range, filter]);
  const prev = useMemo(
    () => computeRange(docs, buys, shiftYear(range), filter),
    [docs, buys, range, filter]
  );
  const mrr = useMemo(() => computeMRR(docs, range), [docs, range]);
  const clients = useMemo(() => computeClients(docs, range), [docs, range]);
  const cats = useMemo(() => computeBuyCategories(buyItems, range), [buyItems, range]);
  // Charges Revolut ventilées par catégorie & par mois civil (alignées sur cur.months) pour la
  // barre empilée « CA vs charges ». CA − charges = marge nette du mois (mêmes charges, même
  // deny-list que netChargesInRange).
  const chargeComps = useMemo(() => chargeComponentsByMonth(outflows, cur.months, range), [outflows, cur.months, range]);
  // Reversements hors exploitation (TVA, IS) par mois — segments visuels du graphe, hors marge.
  const horsExploit = useMemo(() => horsExploitationByMonth(outflows, cur.months, range), [outflows, cur.months, range]);

  // ── Marge nette = CA HT − charges Revolut (tous décaissements externes hors deny-list TVA/IS) ──
  // La marge COMMERCIALE (cur.marge = CA − achats Evoliz) reste séparée et inchangée.
  const bankStart = useMemo(() => earliestOutflowDate(outflows), [outflows]);
  const netCur = useMemo(() => netChargesInRange(outflows, range), [outflows, range]);
  const netPrev = useMemo(() => netChargesInRange(outflows, shiftYear(range)), [outflows, range]);
  // Total versé à Leaya sur la période (vs N-1) — carte « Leaya » à droite du restant dû.
  const leaya = useMemo(() => leayaInRange(outflows, range), [outflows, range]);
  const leayaPrev = useMemo(() => leayaInRange(outflows, shiftYear(range)), [outflows, range]);
  // Données bancaires dispo si la plage atteint au moins le début du cache Revolut.
  const hasBank = bankStart != null && range.end >= bankStart;
  const hasBankPrev = bankStart != null && shiftYear(range).end >= bankStart;
  // Indicateur composite (marge nette = CA Evoliz × charges Revolut) : mention si une source est périmée.
  const staleLabel = staleSourcesLabel(freshness);
  const staleNote = hasBank && staleLabel ? `Partiellement à jour — ${staleLabel}` : undefined;
  const margeNette = cur.caHtTotal - netCur.total;
  const margeNettePrev = prev.caHtTotal - netPrev.total;
  const tauxNette = cur.caHtTotal > 0 ? (margeNette / cur.caHtTotal) * 100 : null;
  const tauxNettePrev = prev.caHtTotal > 0 ? (margeNettePrev / prev.caHtTotal) * 100 : null;
  const tauxNetteDeltaPts =
    hasBank && hasBankPrev && tauxNette != null && tauxNettePrev != null ? tauxNette - tauxNettePrev : null;

  const months = Math.max(1, cur.months.length); // nb de mois de la période (pour les ⌀/mois)
  const achatsAvg = cur.achatsHt / months;

  // Graphe « CA HT mensuel — exercice en cours vs N-1 » (axe fiscal oct→sept, indépendant du sélecteur).
  const fyNow = fyOf(todayISO);
  const caFyCur = useMemo(() => caHtByFiscalMonth(docs, fyNow), [docs, fyNow]);
  const caFyPrev = useMemo(() => caHtByFiscalMonth(docs, fyNow - 1), [docs, fyNow]);

  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => (clientSort === "ca" ? b.ca - a.ca : b.aboHt - a.aboHt)).slice(0, 12),
    [clients, clientSort]
  );

  return (
    <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6">
      {/* ───────── Barre d'outils ───────── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">Evoliz</h1>
          <p className="text-xs text-ink-3">
            {rangeLabel(range)} · comparé à N-1 (même période)
          </p>
        </div>
        <Toolbar
          fyList={fyList}
          period={period}
          setPeriod={setPeriod}
          filter={filter}
          setFilter={setFilter}
          lastSync={lastSync}
          freshness={freshness}
        />
      </div>

      {/* ───────── KPI principaux ───────── */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard icon={<IconCoin size={18} stroke={2} />} tint="bg-cyan/15 text-cyan-600" label={filter === "abo" ? "CA HT — abonnements" : filter === "install" ? "CA HT — installations" : "CA HT"} value={euro(cur.caHt)} delta={rel(cur.caHt, prev.caHt)} foot={`⌀ ${euro(cur.caHt / months)}/mois`}
          info="Chiffre d'affaires hors taxes : somme des factures validées de la période. ⌀/mois = CA HT ÷ nombre de mois." />
        <KpiCard icon={<IconPigMoney size={18} stroke={2} />} tint="bg-emerald-50 text-emerald-600" label="Marge brute" value={euro(cur.marge)} delta={rel(cur.marge, prev.marge)}
          info="Marge brute = CA HT − achats fournisseurs (Evoliz)." />
        {/* Marge nette + taux de marge nette fusionnés dans une seule carte. */}
        <MargeNetteCard
          hasBank={hasBank}
          value={margeNette}
          delta={hasBank && hasBankPrev ? rel(margeNette, margeNettePrev) : null}
          caHtTotal={cur.caHtTotal}
          net={netCur}
          taux={tauxNette}
          tauxDeltaPts={tauxNetteDeltaPts}
          staleNote={staleNote}
        />
        <KpiCard icon={<IconRepeat size={18} stroke={2} />} tint="bg-sky-50 text-sky-600" label={`MRR · ${mrr.monthLabel ?? "—"}`} value={euro(mrr.mrr)} delta={mrr.pct}
          info="Revenu mensuel récurrent : montant HT des abonnements facturés sur le dernier mois de la période." />
      </div>

      {/* ───────── Stats secondaires (même gabarit KpiCard, comparaison N-1) ───────── */}
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard icon={<IconShoppingCart size={18} stroke={2} />} tint="bg-amber-50 text-amber-600" label="Achats HT" value={euro(cur.achatsHt)} delta={rel(cur.achatsHt, prev.achatsHt)} positiveIsGood={false} foot={`⌀ ${euro(achatsAvg)}/mois`}
          info="Total des achats fournisseurs (Evoliz) en HT sur la période. ⌀/mois = achats ÷ nombre de mois." />
        <KpiCard icon={<IconCash size={18} stroke={2} />} tint="bg-emerald-50 text-emerald-600" label="Encaissé TTC" value={euro(cur.encaisseTtc)} delta={rel(cur.encaisseTtc, prev.encaisseTtc)}
          info="Montant TTC déjà encaissé sur les factures de la période." />
        <KpiCard icon={<IconClock size={18} stroke={2} />} tint="bg-sky-50 text-sky-600" label="Restant dû TTC" value={euro(cur.resteTtc)} foot="solde instantané · pas de N-1"
          info="Montant TTC restant à encaisser sur les factures de la période (solde instantané, sans comparaison N-1)." />
        <LeayaCard ttc={leaya} ttcPrev={leayaPrev} />
      </div>

      {/* ───────── Graphiques ───────── */}
      {/* Colonne gauche 2/3 : « CA vs charges » puis « CA HT mensuel » empilés ; colonne droite 1/3 :
          « Répartition CA & achats » (donut + détail), étirée sur toute la hauteur. */}
      <div className="mt-4 grid grid-cols-1 items-stretch gap-4 lg:grid-cols-3">
        <div className="flex flex-col gap-4 lg:col-span-2">
          <div className="rounded-card border border-line bg-white p-4 shadow-card">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-ink">CA vs charges — mensuel HT</h2>
              <ChargesLegend />
            </div>
            <p className="mt-0.5 flex flex-wrap items-center gap-1 text-xs text-ink-3">
              CA HT vs charges — marge nette du mois
              <InfoTip label="Détail CA vs charges">
                <strong className="font-semibold text-ink">CA</strong> en HT ; <strong className="font-semibold text-ink">charges &amp; dépenses</strong> en TTC
                (montants réellement décaissés). Marge nette = CA HT − charges d&apos;exploitation. <strong className="font-semibold text-ink">TVA</strong> reversée
                &amp; <strong className="font-semibold text-ink">IS</strong> affichés hors exploitation (visuels, hors marge).
              </InfoTip>
            </p>
            <CaVsChargesChart
              data={{
                months: cur.months,
                abo: cur.aboByMonth,
                install: cur.installByMonth,
                charges: chargeComps,
                horsExploit,
              }}
              bankStart={bankStart}
            />
          </div>

          <div className="rounded-card border border-line bg-white p-4 shadow-card">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-ink">CA HT mensuel — exercice {fyNow} vs {fyNow - 1}</h2>
              <div className="flex items-center gap-3 text-xs text-ink-2">
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-cyan" /> Exercice {fyNow}</span>
                <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink-3/40" /> Exercice {fyNow - 1}</span>
              </div>
            </div>
            <CaVsN1Chart current={caFyCur} previous={caFyPrev} fy={fyNow} />
          </div>
        </div>

        <SynthBlock stats={cur} />
      </div>

      {/* « Évolution rémunération » retirée d'Evoliz (donnée bancaire) → visible sur Revolut + Cockpit. */}

      {/* ───────── Clients + Catégories ───────── */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-card border border-line bg-white p-4 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Clients</h2>
            <div className="inline-flex rounded-[10px] border border-line bg-cloud p-0.5 text-xs" role="group" aria-label="Trier les clients">
              {(["ca", "abo"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setClientSort(k)} aria-pressed={clientSort === k}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${clientSort === k ? "bg-navy text-white" : "text-ink-2 hover:text-ink"}`}>
                  {k === "ca" ? "Par total" : "Par abonnement"}
                </button>
              ))}
            </div>
          </div>
          <ClientsTable rows={sortedClients} />
        </div>

        <div className="rounded-card border border-line bg-white p-4 shadow-card">
          <div className="flex items-center gap-1.5">
            <h2 className="text-sm font-semibold text-ink">Achats par catégorie</h2>
            <InfoTip label="À propos des achats par catégorie">
              L&apos;<strong className="font-semibold text-ink">électricité</strong> (captée via Revolut) est exclue
              de la marge brute Evoliz pour éviter le double comptage.
            </InfoTip>
          </div>
          <p className="text-xs text-ink-3">Cliquez une catégorie pour le détail</p>
          <CategoryBreakdown cats={cats} onPick={setDrill} />
        </div>
      </div>

      <p className="mt-4 flex flex-wrap items-center gap-1 text-xs text-ink-3">
        CA en <strong className="text-ink-2">HT brut</strong> · marges brute &amp; nette · encaissé / restant dû en <strong className="text-ink-2">TTC</strong>.
        <InfoTip label="Définitions des indicateurs">
          <span className="block"><strong className="font-semibold text-ink">CA HT brut</strong> : factures validées, avoirs non déduits.</span>
          <span className="mt-1 block">Marge <strong className="font-semibold text-ink">brute</strong> = CA − achats fournisseurs Evoliz.</span>
          <span className="mt-1 block">Marge <strong className="font-semibold text-ink">nette</strong> = CA HT − charges d&apos;exploitation Revolut en TTC (décaissements réellement sortis, hors TVA &amp; IS, URSSAF incluse).</span>
          <span className="mt-1 block">La <strong className="font-semibold text-ink">TVA</strong> reversée et l&apos;<strong className="font-semibold text-ink">IS</strong> sont affichés hors exploitation (visuels, hors marge).</span>
        </InfoTip>
      </p>

      {drill && (
        <CategoryDrawer
          cat={drill}
          lines={categoryDetail(buyItems, range, drill.label)}
          onClose={() => setDrill(null)}
        />
      )}
    </div>
  );
}

/* ───────────────────────── Toolbar ───────────────────────── */

function Toolbar({
  fyList,
  period,
  setPeriod,
  filter,
  setFilter,
  lastSync,
  freshness,
}: {
  fyList: number[];
  period: Period;
  setPeriod: (p: Period) => void;
  filter: TypeFilter;
  setFilter: (f: TypeFilter) => void;
  lastSync: string | null;
  freshness: Freshness;
}) {
  const [customOpen, setCustomOpen] = useState(period.kind === "custom");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Choisir l'exercice fiscal"
          value={period.kind === "fy" ? String(period.fy) : ""}
          onChange={(e) => e.target.value && setPeriod({ kind: "fy", fy: Number(e.target.value) })}
          className="rounded-card border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink shadow-card focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/40"
        >
          <option value="">Période…</option>
          {fyList.map((y) => (
            <option key={y} value={y}>Exercice {y}</option>
          ))}
        </select>

        <div className="inline-flex rounded-card border border-line bg-white p-0.5 shadow-card">
          {PRESETS.map((k) => (
            <button key={k} type="button"
              onClick={() => { setCustomOpen(false); setPeriod({ kind: "preset", key: k }); }}
              className={`rounded-[10px] px-2.5 py-1 text-xs font-medium transition-colors ${period.kind === "preset" && period.key === k ? "bg-navy text-white" : "text-ink-2 hover:bg-cloud hover:text-ink"}`}>
              {presetLabel(k)}
            </button>
          ))}
          <button type="button" onClick={() => setCustomOpen((v) => !v)}
            className={`rounded-[10px] px-2.5 py-1 text-xs font-medium transition-colors ${period.kind === "custom" ? "bg-navy text-white" : "text-ink-2 hover:bg-cloud hover:text-ink"}`}>
            Perso
          </button>
        </div>

        <div className="inline-flex rounded-card border border-line bg-white p-0.5 shadow-card">
          {TYPES.map((t) => (
            <button key={t.key} type="button" onClick={() => setFilter(t.key)}
              className={`rounded-[10px] px-2.5 py-1 text-xs font-medium transition-colors ${filter === t.key ? "bg-navy text-white" : "text-ink-2 hover:bg-cloud hover:text-ink"}`}>
              {t.label}
            </button>
          ))}
        </div>

        <RefreshButton initialLastSync={lastSync} freshness={freshness} />
      </div>

      {customOpen && (
        <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
          <span>Du</span>
          <input type="date" defaultValue={period.kind === "custom" ? period.start : ""}
            onChange={(e) => {
              const end = period.kind === "custom" ? period.end : e.target.value;
              if (e.target.value) setPeriod({ kind: "custom", start: e.target.value, end });
            }}
            className="rounded-md border border-line bg-white px-2 py-1 text-ink focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/40" />
          <span>au</span>
          <input type="date" defaultValue={period.kind === "custom" ? period.end : ""}
            onChange={(e) => {
              const start = period.kind === "custom" ? period.start : e.target.value;
              if (e.target.value) setPeriod({ kind: "custom", start, end: e.target.value });
            }}
            className="rounded-md border border-line bg-white px-2 py-1 text-ink focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/40" />
        </div>
      )}
    </div>
  );
}

/* ───────────────────────── KPI & stats ───────────────────────── */

/* ───────────────── Synthèse : répartition CA & achats ───────────────── */

function SynthBlock({ stats }: { stats: { caHtTotal: number; aboHt: number; installHt: number; achatsHt: number; marge: number } }) {
  const [hover, setHover] = useState<"abo" | "install" | null>(null);
  const sum = stats.aboHt + stats.installHt;
  const aboPct = sum > 0 ? stats.aboHt / sum : 0;
  // Anneau plus fin (12) → trou plus large : le montant COMPLET (euro()) tient au centre.
  const r = 50;
  const c = 2 * Math.PI * r;
  const aboLen = aboPct * c;
  // Montant complet au centre. Police adaptée à la longueur (les millions « 1 234 567 € »
  // restent dans le trou) : grand par défaut, réduit pour les nombres longs.
  const caStr = euro(stats.caHtTotal);
  const caCls = caStr.length <= 9 ? "text-xl" : caStr.length <= 12 ? "text-lg" : "text-base";
  // Segment survolé : son détail va dans le tooltip externe + la légende — JAMAIS au centre.
  const seg =
    hover === "abo" ? { label: "Abonnements", value: stats.aboHt, pct: aboPct }
    : hover === "install" ? { label: "Installations", value: stats.installHt, pct: 1 - aboPct }
    : null;

  return (
    <div className="flex h-full flex-col rounded-card border border-line bg-white p-4 shadow-card">
      <h2 className="text-sm font-semibold text-ink">Répartition CA &amp; achats</h2>
      {/* Donut en haut, centré dans l'espace vertical libre (comble le vide de la colonne) */}
      <div className="flex flex-1 items-center justify-center py-5">
        <div className="relative h-52 w-52 flex-none">
          <svg viewBox="0 0 128 128" className="h-52 w-52 -rotate-90" role="img"
            aria-label={`Répartition du CA HT : ${euro(stats.caHtTotal)} au total — abonnements ${euro(stats.aboHt)} (${pct1(aboPct * 100)} %), installations ${euro(stats.installHt)} (${pct1((1 - aboPct) * 100)} %). Achats ${euro(stats.achatsHt)}, marge ${euro(stats.marge)}.`}>
            <title>Répartition du CA HT (abonnements / installations) et achats / marge</title>
            <circle cx="64" cy="64" r={r} fill="none" stroke="var(--color-line)" strokeWidth="12" />
            <circle cx="64" cy="64" r={r} fill="none" className="text-cyan transition-[stroke-width] duration-200" stroke="currentColor"
              strokeWidth={hover === "abo" ? 15 : 12} strokeDasharray={`${aboLen} ${c - aboLen}`}
              onMouseEnter={() => setHover("abo")} onMouseLeave={() => setHover(null)} />
            <circle cx="64" cy="64" r={r} fill="none" className="text-navy transition-[stroke-width] duration-200" stroke="currentColor"
              strokeWidth={hover === "install" ? 15 : 12} strokeDasharray={`${c - aboLen} ${aboLen}`} strokeDashoffset={-aboLen}
              onMouseEnter={() => setHover("install")} onMouseLeave={() => setHover(null)} />
          </svg>
          {/* Centre FIXE : « CA HT » + total COMPLET (euro()). Ne change jamais (ni au survol).
              Police adaptée à la longueur + tabular-nums → le montant reste dans le trou. */}
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center gap-0.5 px-3 text-center">
            <span className="text-[11px] uppercase tracking-wide text-ink-3">CA HT</span>
            <span className={`font-semibold tabular-nums leading-tight text-ink ${caCls}`}>{caStr}</span>
          </div>
          {/* Tooltip court à côté du donut (au-dessus) — segment survolé, jamais au centre. */}
          {seg && (
            <div className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-card border border-line bg-white px-2 py-1 text-xs shadow-card-hover">
              <span className="font-medium text-ink">{seg.label}</span>
              <span className="text-ink-2"> · {euro(seg.value)} · {pct1(seg.pct * 100)} %</span>
            </div>
          )}
        </div>
      </div>
      {/* Détail en dessous du donut */}
      <div className="w-full min-w-0 space-y-2 text-sm">
        <LegButton color="bg-cyan" label="Abonnements" value={euro(stats.aboHt)} pct={aboPct}
          active={hover === "abo"} onHover={(v) => setHover(v ? "abo" : null)} />
        <LegButton color="bg-navy" label="Installations" value={euro(stats.installHt)} pct={1 - aboPct}
          active={hover === "install"} onHover={(v) => setHover(v ? "install" : null)} />
        <div className="flex items-center gap-2 border-t border-line pt-2">
          <span className="h-2.5 w-2.5 flex-none rounded-full bg-transparent" />
          <span className="font-medium text-ink">CA HT total</span>
          <span className="ml-auto font-semibold tabular-nums text-ink">{euro(stats.caHtTotal)}</span>
        </div>
        <div className="space-y-2 border-t border-line pt-2">
          <LegRow color="bg-amber-400" label="Achats" value={euro(stats.achatsHt)} />
          <LegRow color="bg-emerald-500" label="Marge" value={euro(stats.marge)} strong />
        </div>
      </div>
    </div>
  );
}

// Ligne de légende INTERACTIVE (Abonnements / Installations) : survol/focus → met en avant le
// segment du donut (état `hover` remonté) et se surligne. Accessible clavier (button + focus ring).
function LegButton({ color, label, value, pct, active, onHover }: {
  color: string; label: string; value: string; pct: number; active: boolean; onHover: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      onFocus={() => onHover(true)}
      onBlur={() => onHover(false)}
      aria-label={`${label} : ${value}, ${pct1(pct * 100)} %`}
      className={`flex w-full items-center gap-2 rounded-md px-1 py-0.5 text-left transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan ${active ? "bg-cyan/[0.08]" : "hover:bg-cloud"}`}
    >
      <span className={`h-2.5 w-2.5 flex-none rounded-full ${color}`} />
      <span className={`min-w-0 truncate ${active ? "font-medium text-ink" : "text-ink-2"}`}>{label}</span>
      <span className="flex-none text-xs text-ink-3">{pct1(pct * 100)} %</span>
      <span className="ml-auto flex-none tabular-nums font-medium text-ink">{value}</span>
    </button>
  );
}

function LegRow({ color, label, value, strong, pct }: { color: string; label: string; value: string; strong?: boolean; pct?: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 flex-none rounded-full ${color}`} />
      <span className="min-w-0 truncate text-ink-2">{label}</span>
      {pct != null && <span className="flex-none text-xs text-ink-3">{pct1(pct * 100)} %</span>}
      <span className={`ml-auto flex-none tabular-nums ${strong ? "font-semibold text-ink" : "font-medium text-ink"}`}>{value}</span>
    </div>
  );
}

/* ───────────────────────── Clients ───────────────────────── */

function ClientsTable({ rows }: { rows: { clientName: string; installHt: number; aboHt: number; ca: number }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.ca));
  if (rows.length === 0) return <p className="mt-6 text-center text-sm text-ink-3">Aucun client sur la période.</p>;
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[440px] text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-ink-3">
            <th className="pb-2 pr-3 font-medium">Client</th>
            <th className="pb-2 pr-3 text-right font-medium">Install. HT</th>
            <th className="pb-2 pr-3 text-right font-medium">Abo. HT</th>
            <th className="pb-2 text-right font-medium">Total HT</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.clientName} className="border-t border-line/70 transition-colors hover:bg-cloud">
              <td className="py-2 pr-3">
                <div className="font-medium text-ink">{r.clientName}</div>
                <div className="mt-1 h-1 w-full max-w-[160px] overflow-hidden rounded-full bg-cloud">
                  <div className="h-full rounded-full bg-cyan/70 transition-all duration-500" style={{ width: `${Math.max(2, (r.ca / max) * 100)}%` }} />
                </div>
              </td>
              <td className="py-2 pr-3 text-right text-ink-2">{r.installHt ? euro(r.installHt) : "—"}</td>
              <td className="py-2 pr-3 text-right text-ink-2">{r.aboHt ? euro(r.aboHt) : "—"}</td>
              <td className="py-2 text-right font-medium text-ink">{euro(r.ca)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────── Achats par catégorie (+ drill-down) ─────────────────── */

function CategoryBreakdown({ cats, onPick }: { cats: CatRow[]; onPick: (c: CatRow) => void }) {
  if (cats.length === 0) return <p className="mt-6 text-center text-sm text-ink-3">Aucun achat sur la période.</p>;
  const named = cats.filter((c) => c.label !== "(sans catégorie)").slice(0, 10);
  const sans = cats.filter((c) => c.label === "(sans catégorie)");
  const ordered = [...named, ...sans];
  const total = cats.reduce((s, c) => s + c.ht, 0);
  const max = Math.max(1, ...ordered.map((c) => c.ht));
  return (
    <div className="mt-3 space-y-1">
      {ordered.map((c) => {
        const pct = total > 0 ? (c.ht / total) * 100 : 0;
        const isSans = c.label === "(sans catégorie)";
        return (
          <button key={c.label} type="button" onClick={() => onPick(c)}
            className="block w-full rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-cyan/[0.06] focus:bg-cyan/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className={`truncate ${isSans ? "italic text-ink-3" : "text-ink-2"}`}>{c.label}</span>
              <span className="flex-none font-medium text-ink">{euro(c.ht)} <span className="font-normal text-ink-3">· {pct1(pct)} %</span></span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-cloud">
              <div className={`h-full rounded-full transition-all duration-500 ${isSans ? "bg-navy/30" : "bg-amber-400"}`} style={{ width: `${Math.max(2, (c.ht / max) * 100)}%` }} />
            </div>
          </button>
        );
      })}
      <div className="border-t border-line pt-2 text-xs text-ink-3">Total achats : <strong className="text-ink">{euro(total)}</strong></div>
    </div>
  );
}

function CategoryDrawer({ cat, lines, onClose }: { cat: CatRow; lines: { supplierName: string; date: string; ht: number }[]; onClose: () => void }) {
  const total = lines.reduce((s, l) => s + l.ht, 0);
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-navy/30" onClick={onClose} aria-hidden />
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col bg-cloud shadow-xl">
        <div className="flex items-center justify-between border-b border-line bg-white px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">{cat.label}</h2>
            <p className="text-xs text-ink-3">{lines.length} achat(s) · {euro(total)} HT</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-md p-1.5 text-ink-3 hover:bg-cloud hover:text-ink">
            <IconX size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-ink-3">
                <th className="pb-2 pr-3 font-medium">Fournisseur</th>
                <th className="pb-2 pr-3 font-medium">Date</th>
                <th className="pb-2 text-right font-medium">HT</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-t border-line/70">
                  <td className="py-2 pr-3 text-ink">{l.supplierName}</td>
                  <td className="py-2 pr-3 text-ink-2">{formatDateFR(l.date)}</td>
                  <td className="py-2 text-right font-medium text-ink">{euro(l.ht)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </aside>
    </div>
  );
}

