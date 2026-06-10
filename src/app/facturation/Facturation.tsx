"use client";

import { useMemo, useState } from "react";
import {
  IconCoin,
  IconPigMoney,
  IconReportMoney,
  IconPercentage,
  IconRepeat,
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
  type FactDoc,
  type BuyDoc,
  type BuyItemDoc,
  type TypeFilter,
  type DateRange,
  type PresetKey,
  type CatRow,
} from "@/lib/facturation";
import { netChargesInRange, earliestOutflowDate, type OutflowRow } from "@/lib/tresorerie";
import { SyncButtons } from "@/components/SyncButtons";

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

  // ── Marge nette approchée (CA − achats Evoliz − charges Revolut hors Evoliz) ──
  const bankStart = useMemo(() => earliestOutflowDate(outflows), [outflows]);
  const netCur = useMemo(() => netChargesInRange(outflows, range), [outflows, range]);
  const netPrev = useMemo(() => netChargesInRange(outflows, shiftYear(range)), [outflows, range]);
  // Données bancaires dispo si la plage atteint au moins le début du cache Revolut.
  const hasBank = bankStart != null && range.end >= bankStart;
  const hasBankPrev = bankStart != null && shiftYear(range).end >= bankStart;
  const margeNette = cur.marge - netCur.total;
  const margeNettePrev = prev.marge - netPrev.total;
  const tauxNette = cur.caHtTotal > 0 ? (margeNette / cur.caHtTotal) * 100 : null;
  const tauxNettePrev = prev.caHtTotal > 0 ? (margeNettePrev / prev.caHtTotal) * 100 : null;
  const tauxNetteDeltaPts =
    hasBank && hasBankPrev && tauxNette != null && tauxNettePrev != null ? tauxNette - tauxNettePrev : null;

  const months = Math.max(1, cur.months.length);
  const avg = cur.caHtTotal / months;
  const avgPrev = prev.caHtTotal / Math.max(1, prev.months.length);

  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => (clientSort === "ca" ? b.ca - a.ca : b.aboHt - a.aboHt)).slice(0, 12),
    [clients, clientSort]
  );

  return (
    <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6">
      {/* ───────── Barre d'outils ───────── */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">Facturation &amp; marge</h1>
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
        <KpiCard icon={<IconCoin size={18} stroke={2} />} tint="bg-cyan/15 text-cyan-600" label="CA HT" value={euro(cur.caHt)} delta={rel(cur.caHt, prev.caHt)} />
        <KpiCard icon={<IconPigMoney size={18} stroke={2} />} tint="bg-emerald-50 text-emerald-600" label="Marge commerciale" value={euro(cur.marge)} delta={rel(cur.marge, prev.marge)} />
        <MargeNetteCard
          hasBank={hasBank}
          value={margeNette}
          delta={hasBank && hasBankPrev ? rel(margeNette, margeNettePrev) : null}
          caHtTotal={cur.caHtTotal}
          achatsHt={cur.achatsHt}
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

      {/* ───────── Stats secondaires ───────── */}
      <div className="mt-3 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line sm:grid-cols-4">
        <StatCell label="CA moyen / mois" value={euro(avg)} delta={rel(avg, avgPrev)} />
        <StatCell label="Achats HT" value={euro(cur.achatsHt)} delta={rel(cur.achatsHt, prev.achatsHt)} />
        <StatCell label="Encaissé TTC" value={euro(cur.encaisseTtc)} />
        <StatCell label="Restant dû TTC" value={euro(cur.resteTtc)} />
      </div>

      {/* ───────── Graphiques ───────── */}
      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="rounded-card border border-line bg-white p-4 shadow-card lg:col-span-2">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold text-ink">CA vs Achats — mensuel HT</h2>
            <div className="flex items-center gap-3 text-xs text-ink-2">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-cyan" /> Abonnement</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-cyan/40" /> Installation</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-amber-400" /> Achats</span>
            </div>
          </div>
          <MonthlyChart
            months={cur.months}
            abo={cur.aboByMonth}
            install={cur.installByMonth}
            achats={cur.achatsByMonth}
          />
        </div>

        <SynthBlock stats={cur} />
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
        marge <strong className="text-ink-2">commerciale</strong> = CA − achats fournisseurs (hors
        rémunération, charges sociales, impôts, amortissements) · « encaissé / restant dû » en{" "}
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

        <SyncButtons initialLastSync={lastSync} />
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

function KpiCard({
  icon, tint, label, value, delta, deltaUnit = "%", muted = false,
}: {
  icon: React.ReactNode; tint: string; label: string; value: string;
  delta?: number | null; deltaUnit?: string; muted?: boolean;
}) {
  return (
    <div className="group rounded-card border border-line bg-white p-3.5 shadow-card transition-all duration-200 motion-safe:hover:-translate-y-px hover:shadow-card-hover">
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-[10px] ${tint}`}>{icon}</span>
        <span className="truncate text-xs font-medium uppercase tracking-wide text-ink-3">{label}</span>
      </div>
      <div className={`mt-2.5 text-2xl font-semibold leading-none ${muted ? "text-ink-3" : "text-ink"}`}>{value}</div>
      <div className="mt-1.5 min-h-4 text-xs">
        {delta == null ? (
          <span className="text-ink-3">Vs N-1 : —</span>
        ) : (
          <span className="inline-flex items-center gap-1">
            <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold ${delta >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {delta >= 0 ? <IconArrowUpRight size={12} stroke={2.5} /> : <IconArrowDownRight size={12} stroke={2.5} />}
              {Math.abs(delta).toFixed(1)} {deltaUnit}
            </span>
            <span className="text-ink-3">Vs N-1</span>
          </span>
        )}
      </div>
    </div>
  );
}

// Carte « Marge nette (approchée) » = CA HT − achats Evoliz − (rémunération + loyer + électricité
// captés via Revolut). Grise et explicite si la plage précède les données bancaires (nov. 2024).
function MargeNetteCard({
  hasBank, value, delta, caHtTotal, achatsHt, net,
}: {
  hasBank: boolean; value: number; delta: number | null;
  caHtTotal: number; achatsHt: number;
  net: { remuneration: number; loyer: number; electricite: number; total: number };
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
          <p className="mt-1 text-[10px] italic leading-tight text-ink-3">charges nettes captées depuis nov. 2024</p>
          {/* Détail au survol */}
          <div className="pointer-events-none absolute left-1/2 top-full z-20 mt-1 hidden w-60 -translate-x-1/2 rounded-card border border-line bg-white p-3 text-xs shadow-card-hover group-hover:block">
            <div className="font-semibold text-ink">Marge nette approchée</div>
            <div className="mt-2 space-y-1">
              <TipRow label="CA HT" value={euro(caHtTotal)} />
              <TipRow label="− Achats Evoliz" value={euro(-achatsHt)} />
              <TipRow label="− Rémunération" value={euro(-net.remuneration)} />
              <TipRow label="− Loyer" value={euro(-net.loyer)} />
              <TipRow label="− Électricité" value={euro(-net.electricite)} />
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

function StatCell({ label, value, delta }: { label: string; value: string; delta?: number | null }) {
  return (
    <div className="bg-white px-3.5 py-2.5">
      <div className="text-xs text-ink-3">{label}</div>
      <div className="mt-0.5 flex items-baseline gap-2">
        <span className="text-base font-semibold text-ink">{value}</span>
        {delta != null && (
          <span className={`text-xs font-medium ${delta >= 0 ? "text-emerald-600" : "text-red-600"}`}>
            {delta >= 0 ? "↑" : "↓"} {Math.abs(delta).toFixed(0)} %
          </span>
        )}
      </div>
    </div>
  );
}

/* ───────────────────────── Graphe mensuel ───────────────────────── */

function MonthlyChart({ months, abo, install, achats }: { months: { key: string; label: string }[]; abo: number[]; install: number[]; achats: number[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const ca = months.map((_, i) => abo[i] + install[i]);
  const max = Math.max(1, ...ca, ...achats);
  const n = months.length;
  return (
    <div className="relative mt-3" onMouseLeave={() => setHover(null)}>
      <div className="flex h-48 items-end gap-1 sm:gap-1.5">
        {months.map((m, i) => {
          const active = hover === null || hover === i;
          return (
            <div key={m.key} className="relative flex h-full flex-1 cursor-default flex-col items-center justify-end rounded-md" onMouseEnter={() => setHover(i)}>
              <div className={`absolute inset-x-0 bottom-5 top-0 rounded-md transition-colors ${hover === i ? "bg-cyan/[0.07]" : ""}`} />
              <div className="relative flex h-full w-full items-end justify-center gap-1 pb-5">
                <StackedBar abo={abo[i]} install={install[i]} max={max} idx={i} dim={!active} />
                <SimpleBar value={achats[i]} max={max} idx={i} color="bg-amber-400" dim={!active} />
              </div>
              {(n <= 14 || i % 2 === 0) && (
                <span className={`absolute bottom-0 truncate text-[9px] transition-colors ${hover === i ? "font-semibold text-ink" : "text-ink-3"}`}>{m.label}</span>
              )}
            </div>
          );
        })}
      </div>
      {hover !== null && (
        <MargeTooltip index={hover} n={n} label={months[hover].label} abo={abo[hover]} install={install[hover]} achats={achats[hover]} />
      )}
    </div>
  );
}

// Barre CA empilée : abonnement (bas, cyan plein) + installation (haut, cyan clair).
function StackedBar({ abo, install, max, idx, dim }: { abo: number; install: number; max: number; idx: number; dim: boolean }) {
  const total = abo + install;
  const h = Math.min(100, (total / max) * 100);
  const aboFrac = total > 0 ? (abo / total) * 100 : 0;
  const installFrac = total > 0 ? (install / total) * 100 : 0;
  return (
    <div
      className={`flex w-4 origin-bottom flex-col justify-end overflow-hidden rounded-t-sm transition-opacity duration-200 motion-safe:animate-[grow-up_0.5s_ease-out_both] sm:w-6 ${dim ? "opacity-40" : "opacity-100"}`}
      style={{ height: `${h}%`, animationDelay: `${idx * 20}ms` }}
    >
      {install > 0 && <div className="w-full bg-cyan/40" style={{ height: `${installFrac}%` }} />}
      {abo > 0 && <div className="w-full bg-cyan" style={{ height: `${aboFrac}%` }} />}
    </div>
  );
}

function SimpleBar({ value, max, idx, color, dim }: { value: number; max: number; idx: number; color: string; dim: boolean }) {
  const h = Math.min(100, (value / max) * 100);
  return (
    <div
      className={`w-4 origin-bottom rounded-t-sm transition-opacity duration-200 motion-safe:animate-[grow-up_0.5s_ease-out_both] sm:w-6 ${color} ${dim ? "opacity-40" : "opacity-100"}`}
      style={{ height: `${h}%`, animationDelay: `${idx * 20}ms` }}
    />
  );
}

function MargeTooltip({ index, n, label, abo, install, achats }: { index: number; n: number; label: string; abo: number; install: number; achats: number }) {
  const ca = abo + install;
  const marge = ca - achats;
  const taux = ca > 0 ? (marge / ca) * 100 : null;
  const left = ((index + 0.5) / n) * 100;
  const alignRight = index > n * 0.66;
  return (
    <div className="pointer-events-none absolute top-0 z-10 w-44 -translate-x-1/2 rounded-card border border-line bg-white p-3 text-xs shadow-card-hover"
      style={{ left: `${left}%`, ...(alignRight ? { transform: "translateX(-85%)" } : {}) }}>
      <div className="font-semibold text-ink">{label}</div>
      <div className="mt-2 space-y-1">
        <TipRow label="Abonnement" value={euro(abo)} />
        <TipRow label="Installation" value={euro(install)} />
        <TipRow label="CA HT" value={euro(ca)} strong />
        <TipRow label="Achats HT" value={euro(achats)} />
        <TipRow label="Marge" value={euro(marge)} strong />
      </div>
      <div className="mt-2 border-t border-line pt-1.5 text-ink-3">{taux !== null ? `Taux ${taux.toFixed(0)} %` : "—"}</div>
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
      <div className="mt-3 flex items-center gap-4">
        <div className="relative h-28 w-28 flex-none">
          <svg viewBox="0 0 128 128" className="h-28 w-28 -rotate-90">
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
        <div className="flex-1 space-y-1.5 text-sm">
          <LegRow color="bg-cyan" label="Abonnements" value={euro(stats.aboHt)} />
          <LegRow color="bg-navy" label="Installations" value={euro(stats.installHt)} />
          <div className="border-t border-line pt-1.5">
            <LegRow color="bg-amber-400" label="Achats" value={euro(stats.achatsHt)} />
            <LegRow color="bg-emerald-500" label="Marge" value={euro(stats.marge)} strong />
          </div>
        </div>
      </div>
    </div>
  );
}

function LegRow({ color, label, value, strong }: { color: string; label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="text-ink-2">{label}</span>
      <span className={`ml-auto ${strong ? "font-semibold text-ink" : "font-medium text-ink"}`}>{value}</span>
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
            className="block w-full rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-cyan/[0.06] focus:bg-cyan/[0.06] focus:outline-none">
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

