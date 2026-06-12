"use client";

import { useMemo, useState } from "react";
import {
  IconCoin,
  IconPigMoney,
  IconReportMoney,
  IconPercentage,
  IconRepeat,
  IconChartBar,
  IconShoppingCart,
  IconCash,
  IconClock,
  IconArrowUpRight,
  IconArrowDownRight,
  IconX,
} from "@tabler/icons-react";
import {
  euro,
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
import { netChargesInRange, chargeComponentsByMonth, remuByFiscalMonth, earliestOutflowDate, type OutflowRow, type RevolutCharges } from "@/lib/tresorerie";
import { KpiCard } from "@/components/KpiCard";
import { CaVsN1Chart } from "@/components/CaVsN1Chart";
import { CaVsChargesChart, ChargesLegend, CHARGE_META } from "@/components/CaVsChargesChart";
import { RefreshButton } from "@/components/RefreshButton";

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
}: {
  docs: FactDoc[];
  buys: BuyDoc[];
  buyItems: BuyItemDoc[];
  outflows: OutflowRow[];
  todayISO: string;
  lastSync: string | null;
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
  const chargeComps = useMemo(() => chargeComponentsByMonth(outflows, cur.months), [outflows, cur.months]);

  // ── Marge nette = CA HT − charges Revolut (tous décaissements externes hors deny-list TVA/IS) ──
  // La marge COMMERCIALE (cur.marge = CA − achats Evoliz) reste séparée et inchangée.
  const bankStart = useMemo(() => earliestOutflowDate(outflows), [outflows]);
  const netCur = useMemo(() => netChargesInRange(outflows, range), [outflows, range]);
  const netPrev = useMemo(() => netChargesInRange(outflows, shiftYear(range)), [outflows, range]);
  // Données bancaires dispo si la plage atteint au moins le début du cache Revolut.
  const hasBank = bankStart != null && range.end >= bankStart;
  const hasBankPrev = bankStart != null && shiftYear(range).end >= bankStart;
  const margeNette = cur.caHtTotal - netCur.total;
  const margeNettePrev = prev.caHtTotal - netPrev.total;
  const tauxNette = cur.caHtTotal > 0 ? (margeNette / cur.caHtTotal) * 100 : null;
  const tauxNettePrev = prev.caHtTotal > 0 ? (margeNettePrev / prev.caHtTotal) * 100 : null;
  const tauxNetteDeltaPts =
    hasBank && hasBankPrev && tauxNette != null && tauxNettePrev != null ? tauxNette - tauxNettePrev : null;

  const months = Math.max(1, cur.months.length);
  const avg = cur.caHtTotal / months;
  const avgPrev = prev.caHtTotal / Math.max(1, prev.months.length);
  const achatsAvg = cur.achatsHt / months;
  const achatsAvgPrev = prev.achatsHt / Math.max(1, prev.months.length);

  // Graphe « CA HT mensuel — exercice en cours vs N-1 » (axe fiscal oct→sept, indépendant du sélecteur).
  const fyNow = fyOf(todayISO);
  const caFyCur = useMemo(() => caHtByFiscalMonth(docs, fyNow), [docs, fyNow]);
  const caFyPrev = useMemo(() => caHtByFiscalMonth(docs, fyNow - 1), [docs, fyNow]);
  // Rémunération (décaissements Revolut « Rémunération ») par mois fiscal — exercice vs N-1.
  const remuFyCur = useMemo(() => remuByFiscalMonth(outflows, fyNow), [outflows, fyNow]);
  const remuFyPrev = useMemo(() => remuByFiscalMonth(outflows, fyNow - 1), [outflows, fyNow]);

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
        />
      </div>

      {/* ───────── KPI principaux ───────── */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard icon={<IconCoin size={18} stroke={2} />} tint="bg-cyan/15 text-cyan-600" label={filter === "abo" ? "CA HT — abonnements" : filter === "install" ? "CA HT — installations" : "CA HT"} value={euro(cur.caHt)} delta={rel(cur.caHt, prev.caHt)} />
        <KpiCard icon={<IconPigMoney size={18} stroke={2} />} tint="bg-emerald-50 text-emerald-600" label="Marge commerciale" value={euro(cur.marge)} delta={rel(cur.marge, prev.marge)} />
        <MargeNetteCard
          hasBank={hasBank}
          value={margeNette}
          delta={hasBank && hasBankPrev ? rel(margeNette, margeNettePrev) : null}
          caHtTotal={cur.caHtTotal}
          net={netCur}
        />
        <KpiCard
          icon={<IconPercentage size={18} stroke={2} />}
          tint="bg-amber-50 text-amber-600"
          label="Taux de marge nette"
          value={hasBank && tauxNette != null ? `${tauxNette.toFixed(1)} %` : "n/a"}
          muted={!hasBank}
          delta={tauxNetteDeltaPts}
          deltaUnit="pts"
        />
        <KpiCard icon={<IconRepeat size={18} stroke={2} />} tint="bg-sky-50 text-sky-600" label={`MRR · ${mrr.monthLabel ?? "—"}`} value={euro(mrr.mrr)} delta={mrr.pct} />
      </div>

      {/* ───────── Stats secondaires (même gabarit KpiCard, comparaison N-1) ───────── */}
      <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiCard icon={<IconChartBar size={18} stroke={2} />} tint="bg-cyan/15 text-cyan-600" label="CA moyen / mois" value={euro(avg)} delta={rel(avg, avgPrev)} />
        <KpiCard icon={<IconShoppingCart size={18} stroke={2} />} tint="bg-amber-50 text-amber-600" label="Achats moyens HT / mois" value={euro(achatsAvg)} delta={rel(achatsAvg, achatsAvgPrev)} />
        <KpiCard icon={<IconCash size={18} stroke={2} />} tint="bg-emerald-50 text-emerald-600" label="Encaissé TTC" value={euro(cur.encaisseTtc)} delta={rel(cur.encaisseTtc, prev.encaisseTtc)} />
        <KpiCard icon={<IconClock size={18} stroke={2} />} tint="bg-sky-50 text-sky-600" label="Restant dû TTC" value={euro(cur.resteTtc)} foot="solde instantané · pas de N-1" />
      </div>

      {/* ───────── Graphiques ───────── */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-card border border-line bg-white p-4 shadow-card lg:col-span-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-ink">CA vs charges — mensuel HT</h2>
            <ChargesLegend />
          </div>
          <p className="mt-0.5 text-xs text-ink-3">CA − charges = marge nette du mois · charges = dépenses Revolut (hors TVA/IS)</p>
          <CaVsChargesChart
            data={{
              months: cur.months,
              abo: cur.aboByMonth,
              install: cur.installByMonth,
              charges: chargeComps,
            }}
            bankStart={bankStart}
          />
        </div>

        <SynthBlock stats={cur} />
      </div>

      {/* ───────── CA HT mensuel — exercice vs N-1 ───────── */}
      <div className="mt-4 rounded-card border border-line bg-white p-4 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">CA HT mensuel — exercice {fyNow} vs {fyNow - 1}</h2>
          <div className="flex items-center gap-3 text-xs text-ink-2">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-cyan" /> Exercice {fyNow}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink-3/40" /> Exercice {fyNow - 1}</span>
          </div>
        </div>
        <CaVsN1Chart current={caFyCur} previous={caFyPrev} fy={fyNow} />
      </div>

      {/* ───────── Évolution rémunération — exercice vs N-1 ───────── */}
      <div className="mt-4 rounded-card border border-line bg-white p-4 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Évolution rémunération — exercice {fyNow} vs {fyNow - 1}</h2>
          <div className="flex items-center gap-3 text-xs text-ink-2">
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-cyan" /> Exercice {fyNow}</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-ink-3/40" /> Exercice {fyNow - 1}</span>
          </div>
        </div>
        <p className="mt-0.5 text-xs text-ink-3">Décaissements Revolut « Rémunération » · captés depuis nov. 2024</p>
        <CaVsN1Chart current={remuFyCur} previous={remuFyPrev} fy={fyNow} unitLabel="Rémunération" />
      </div>

      {/* ───────── Clients + Catégories ───────── */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-card border border-line bg-white p-4 shadow-card">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">Clients</h2>
            <div className="inline-flex rounded-[10px] border border-line bg-cloud p-0.5 text-xs">
              {(["ca", "abo"] as const).map((k) => (
                <button key={k} type="button" onClick={() => setClientSort(k)}
                  className={`rounded-md px-2.5 py-1 font-medium transition-colors ${clientSort === k ? "bg-navy text-white" : "text-ink-2 hover:text-ink"}`}>
                  {k === "ca" ? "Par total" : "Par abonnement"}
                </button>
              ))}
            </div>
          </div>
          <ClientsTable rows={sortedClients} />
        </div>

        <div className="rounded-card border border-line bg-white p-4 shadow-card">
          <h2 className="text-sm font-semibold text-ink">Achats par catégorie</h2>
          <p className="text-xs text-ink-3">Cliquez une catégorie pour le détail</p>
          <p className="mt-0.5 text-xs italic text-ink-3">
            Électricité (captée via Revolut) — exclue de la marge commerciale Evoliz
          </p>
          <CategoryBreakdown cats={cats} onPick={setDrill} />
        </div>
      </div>

      <p className="mt-4 text-xs text-ink-3">
        CA en <strong className="text-ink-2">HT brut</strong> (factures validées, avoirs non déduits) ·
        marge <strong className="text-ink-2">commerciale</strong> = CA − achats fournisseurs Evoliz ·
        marge <strong className="text-ink-2">nette</strong> = CA HT − toutes les dépenses Revolut
        (décaissements externes hors TVA &amp; impôt sociétés) · « encaissé / restant dû » en{" "}
        <strong className="text-ink-2">TTC</strong>.
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
}: {
  fyList: number[];
  period: Period;
  setPeriod: (p: Period) => void;
  filter: TypeFilter;
  setFilter: (f: TypeFilter) => void;
  lastSync: string | null;
}) {
  const [customOpen, setCustomOpen] = useState(period.kind === "custom");
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <select
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

        <RefreshButton initialLastSync={lastSync} />
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

// Carte « Marge nette » = CA HT − charges Revolut (tous décaissements externes hors deny-list
// TVA/IS). Grise et explicite si la plage précède les données bancaires (nov. 2024).
function MargeNetteCard({
  hasBank, value, delta, caHtTotal, net,
}: {
  hasBank: boolean; value: number; delta: number | null;
  caHtTotal: number;
  net: RevolutCharges;
}) {
  return (
    <div className="group relative rounded-card border border-line bg-white p-3.5 shadow-card transition-all duration-200 motion-safe:hover:-translate-y-px hover:shadow-card-hover">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-violet-50 text-violet-600">
          <IconReportMoney size={18} stroke={2} />
        </span>
        <span className="truncate text-xs font-medium uppercase tracking-wide text-ink-3">Marge nette (approchée)</span>
      </div>
      {hasBank ? (
        <>
          <div className="mt-2.5 text-2xl font-semibold leading-none text-ink">{euro(value)}</div>
          <div className="mt-1.5 min-h-4 text-xs">
            {delta == null ? (
              <span className="text-ink-3">Vs N-1 : —</span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold ${delta >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                  {delta >= 0 ? <IconArrowUpRight size={12} stroke={2.5} /> : <IconArrowDownRight size={12} stroke={2.5} />}
                  {Math.abs(delta).toFixed(1)} %
                </span>
                <span className="text-ink-3">Vs N-1</span>
              </span>
            )}
          </div>
          <p className="mt-1 text-[10px] italic leading-tight text-ink-3">CA HT − dépenses Revolut (hors TVA/IS) · depuis nov. 2024</p>
          {/* Détail au survol : ventilation des charges Revolut par catégorie */}
          <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden max-h-80 w-64 -translate-x-1/2 overflow-auto rounded-card border border-line bg-white p-3 text-xs shadow-card-hover group-hover:block">
            <div className="font-semibold text-ink">Marge nette = CA HT − charges Revolut</div>
            <div className="mt-2 space-y-1">
              <TipRow label="CA HT" value={euro(caHtTotal)} />
              <div className="my-1 border-t border-line" />
              {CHARGE_META.filter((m) => net.byCategory[m.key] > 0).map((m) => (
                <TipRow key={m.key} label={`− ${m.label}`} value={euro(-net.byCategory[m.key])} />
              ))}
              <div className="mt-1 border-t border-line pt-1"><TipRow label="= Marge nette" value={euro(value)} strong /></div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="mt-2.5 text-2xl font-semibold leading-none text-ink-3">n/a</div>
          <p className="mt-1.5 min-h-4 text-xs leading-tight text-ink-3">pas de données bancaires avant nov. 2024</p>
        </>
      )}
    </div>
  );
}

function TipRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-ink-2">{label}</span>
      <span className={`ml-auto ${strong ? "font-semibold text-ink" : "font-medium text-ink"}`}>{value}</span>
    </div>
  );
}

/* ───────────────── Synthèse : répartition CA & achats ───────────────── */

function SynthBlock({ stats }: { stats: { caHtTotal: number; aboHt: number; installHt: number; achatsHt: number; marge: number } }) {
  const [hover, setHover] = useState<"abo" | "install" | null>(null);
  const sum = stats.aboHt + stats.installHt;
  const aboPct = sum > 0 ? stats.aboHt / sum : 0;
  const r = 48;
  const c = 2 * Math.PI * r;
  const aboLen = aboPct * c;

  const center =
    hover === "abo" ? { l: "Abonnements", v: euro(stats.aboHt), p: aboPct }
    : hover === "install" ? { l: "Installations", v: euro(stats.installHt), p: 1 - aboPct }
    : { l: "CA HT", v: euro(stats.caHtTotal), p: null as number | null };

  return (
    <div className="rounded-card border border-line bg-white p-4 shadow-card">
      <h2 className="text-sm font-semibold text-ink">Répartition CA &amp; achats</h2>
      <div className="mt-4 flex flex-col items-center gap-5 sm:flex-row sm:items-center">
        <div className="relative h-28 w-28 flex-none">
          <svg viewBox="0 0 128 128" className="h-28 w-28 -rotate-90" role="img"
            aria-label={`Répartition du CA HT : ${euro(stats.caHtTotal)} au total — abonnements ${euro(stats.aboHt)} (${Math.round(aboPct * 100)} %), installations ${euro(stats.installHt)} (${Math.round((1 - aboPct) * 100)} %). Achats ${euro(stats.achatsHt)}, marge ${euro(stats.marge)}.`}>
            <title>Répartition du CA HT (abonnements / installations) et achats / marge</title>
            <circle cx="64" cy="64" r={r} fill="none" stroke="var(--color-line)" strokeWidth="14" />
            <circle cx="64" cy="64" r={r} fill="none" className="text-cyan transition-[stroke-width] duration-200" stroke="currentColor"
              strokeWidth={hover === "abo" ? 18 : 14} strokeDasharray={`${aboLen} ${c - aboLen}`}
              onMouseEnter={() => setHover("abo")} onMouseLeave={() => setHover(null)} />
            <circle cx="64" cy="64" r={r} fill="none" className="text-navy transition-[stroke-width] duration-200" stroke="currentColor"
              strokeWidth={hover === "install" ? 18 : 14} strokeDasharray={`${c - aboLen} ${aboLen}`} strokeDashoffset={-aboLen}
              onMouseEnter={() => setHover("install")} onMouseLeave={() => setHover(null)} />
          </svg>
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="text-[9px] uppercase tracking-wide text-ink-3">{center.l}</span>
            <span className="text-sm font-semibold text-ink">{center.v}</span>
            {center.p !== null && <span className="text-[10px] text-ink-3">{(center.p * 100).toFixed(0)} %</span>}
          </div>
        </div>
        <div className="w-full min-w-0 flex-1 space-y-2 text-sm">
          <LegRow color="bg-cyan" label="Abonnements" value={euro(stats.aboHt)} pct={aboPct} />
          <LegRow color="bg-navy" label="Installations" value={euro(stats.installHt)} pct={1 - aboPct} />
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
    </div>
  );
}

function LegRow({ color, label, value, strong, pct }: { color: string; label: string; value: string; strong?: boolean; pct?: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 flex-none rounded-full ${color}`} />
      <span className="min-w-0 truncate text-ink-2">{label}</span>
      {pct != null && <span className="flex-none text-xs text-ink-3">{(pct * 100).toFixed(0)} %</span>}
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
              <span className="flex-none font-medium text-ink">{euro(c.ht)} <span className="font-normal text-ink-3">· {pct.toFixed(0)} %</span></span>
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

