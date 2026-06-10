"use client";

import { useMemo, useState } from "react";
import {
  IconWallet,
  IconCoins,
  IconCurrencyBitcoin,
  IconArrowsExchange,
  IconX,
} from "@tabler/icons-react";
import {
  euro,
  rel,
  fyRange,
  presetRange,
  presetLabel,
  shiftYear,
  rangeLabel,
  type DateRange,
  type PresetKey,
} from "@/lib/facturation";
import {
  seriesForRange,
  flowsInRange,
  categoriesInRange,
  categoryOutflows,
  leayaInRange,
  fiscalYearsFromMonths,
  type TAccount,
  type MonthRow,
  type OutflowRow,
  type CryptoPnl,
  type TCatRow,
} from "@/lib/tresorerie";
import { KpiCard } from "@/components/KpiCard";
import { LeayaCard } from "@/components/LeayaCard";
import { RefreshButton } from "@/components/RefreshButton";

interface Data {
  accounts: TAccount[];
  cryptoPnl: CryptoPnl;
  months: MonthRow[];
  outflows: OutflowRow[];
  lastSync: string | null;
}
type Period =
  | { kind: "fy"; fy: number }
  | { kind: "preset"; key: PresetKey }
  | { kind: "custom"; start: string; end: string };

const PRESETS: PresetKey[] = ["current-month", "current-quarter", "last-12-months"];

export function Tresorerie({ data, todayISO }: { data: Data; todayISO: string }) {
  const fyList = useMemo(() => fiscalYearsFromMonths(data.months), [data.months]);
  const [period, setPeriod] = useState<Period>(() =>
    fyList.length ? { kind: "fy", fy: fyList[0] } : { kind: "preset", key: "last-12-months" }
  );
  const [customOpen, setCustomOpen] = useState(false);
  const [drill, setDrill] = useState<TCatRow | null>(null);

  const range: DateRange = useMemo(() => {
    if (period.kind === "fy") return fyRange(period.fy, todayISO);
    if (period.kind === "preset") return presetRange(period.key, todayISO);
    return { start: period.start, end: period.end };
  }, [period, todayISO]);

  const series = useMemo(() => seriesForRange(data.months, range), [data.months, range]);
  const flows = useMemo(() => flowsInRange(data.months, range), [data.months, range]);
  const flowsPrev = useMemo(() => flowsInRange(data.months, shiftYear(range)), [data.months, range]);
  const cats = useMemo(() => categoriesInRange(data.outflows, range), [data.outflows, range]);
  const leaya = useMemo(() => leayaInRange(data.outflows, range), [data.outflows, range]);
  const leayaPrev = useMemo(() => leayaInRange(data.outflows, shiftYear(range)), [data.outflows, range]);

  const fiatEur = data.accounts.filter((a) => a.kind === "FIAT").reduce((s, a) => s + (a.valoEur ?? 0), 0);
  const cryptoEur = data.accounts.filter((a) => a.kind === "CRYPTO").reduce((s, a) => s + (a.valoEur ?? 0), 0);
  const total = fiatEur + cryptoEur;
  const p = data.cryptoPnl;

  return (
    <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6">
      {/* Barre d'outils */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">Revolut Business</h1>
          <p className="text-xs text-ink-3">{rangeLabel(range)} · comparé à N-1 (même période) · lecture seule</p>
        </div>
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
                <button key={k} type="button" onClick={() => { setCustomOpen(false); setPeriod({ kind: "preset", key: k }); }}
                  className={`rounded-[10px] px-2.5 py-1 text-xs font-medium transition-colors ${period.kind === "preset" && period.key === k ? "bg-navy text-white" : "text-ink-2 hover:bg-cloud hover:text-ink"}`}>
                  {presetLabel(k)}
                </button>
              ))}
              <button type="button" onClick={() => setCustomOpen((v) => !v)}
                className={`rounded-[10px] px-2.5 py-1 text-xs font-medium transition-colors ${period.kind === "custom" ? "bg-navy text-white" : "text-ink-2 hover:bg-cloud hover:text-ink"}`}>
                Perso
              </button>
            </div>
            <RefreshButton initialLastSync={data.lastSync} />
          </div>
          {customOpen && (
            <div className="flex flex-wrap items-center gap-2 text-xs text-ink-2">
              <span>Du</span>
              <input type="date" defaultValue={period.kind === "custom" ? period.start : ""}
                onChange={(e) => e.target.value && setPeriod({ kind: "custom", start: e.target.value, end: period.kind === "custom" ? period.end : todayISO })}
                className="rounded-md border border-line bg-white px-2 py-1 text-ink focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/40" />
              <span>au</span>
              <input type="date" defaultValue={period.kind === "custom" ? period.end : todayISO}
                onChange={(e) => e.target.value && setPeriod({ kind: "custom", start: period.kind === "custom" ? period.start : range.start, end: e.target.value })}
                className="rounded-md border border-line bg-white px-2 py-1 text-ink focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/40" />
            </div>
          )}
        </div>
      </div>

      {/* KPI */}
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard icon={<IconWallet size={18} stroke={2} />} tint="bg-cyan/15 text-cyan-600" label="Trésorerie totale"
          value={euro(total)} foot={`fiat ${euro(fiatEur)} · crypto ${euro(cryptoEur)}`} />
        <KpiCard icon={<IconCoins size={18} stroke={2} />} tint="bg-emerald-50 text-emerald-600" label="Liquidités fiat"
          value={euro(fiatEur)} foot="EUR + devises converties" />
        <KpiCard icon={<IconCurrencyBitcoin size={18} stroke={2} />} tint="bg-amber-50 text-amber-600" label="P&L crypto (global)"
          value={euro(p.pnl)} delta={p.pct} deltaLabel="rendement"
          foot={`~${euro(p.transferredOutValue)} de crypto transférée hors plateforme — estimation à ±${euro(p.transferredOutValue)} près`} />
        <KpiCard icon={<IconArrowsExchange size={18} stroke={2} />} tint="bg-sky-50 text-sky-600" label="Cash net de la période"
          value={euro(flows.net)} delta={flowsPrev.net !== 0 ? rel(flows.net, flowsPrev.net) : null}
          foot={`entrées ${euro(flows.inflow)} · sorties ${euro(flows.outflow)}`} />
        <LeayaCard ttc={leaya} ttcPrev={leayaPrev} />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          {/* Graphe 1 — Évolution de la trésorerie */}
          <div className="rounded-card border border-line bg-white p-4 shadow-card">
            <h2 className="text-sm font-semibold text-ink">Évolution de la trésorerie</h2>
            <p className="text-xs text-ink-3">Solde EUR fin de mois · {rangeLabel(range)}</p>
            <TresoAreaChart series={series} />
          </div>
          {/* Graphe 2 — Flux nets mensuels */}
          <div className="rounded-card border border-line bg-white p-4 shadow-card">
            <h2 className="text-sm font-semibold text-ink">Flux nets mensuels</h2>
            <p className="text-xs text-ink-3">Entrées − sorties externes (EUR) · vert = positif, rouge = négatif</p>
            <FluxBarsChart series={series} />
          </div>
        </div>

        {/* Soldes par compte */}
        <div className="rounded-card border border-line bg-white p-4 shadow-card">
          <h2 className="text-sm font-semibold text-ink">Soldes par compte</h2>
          <AccountsList accounts={data.accounts} />
        </div>
      </div>

      {/* Dépenses par catégorie */}
      <div className="mt-4 rounded-card border border-line bg-white p-4 shadow-card">
        <h2 className="text-sm font-semibold text-ink">Dépenses par catégorie (libellé)</h2>
        <p className="text-xs text-ink-3">
          Décaissements externes regroupés par libellé · transferts internes & exchanges exclus · cliquez pour le détail
        </p>
        <CategoryBreakdown cats={cats} onPick={setDrill} />
      </div>

      <p className="mt-4 text-xs text-ink-3">
        <strong className="text-ink-2">Lecture seule</strong> (aucun virement/paiement) · valorisations crypto au cours
        Revolut <code>/rate</code> de la dernière synchronisation · flux et charges comptés uniquement sur des sorties
        EXTERNES (transferts internes et exchanges exclus).
      </p>

      {drill && (
        <CategoryDrawer cat={drill} lines={categoryOutflows(data.outflows, range, drill.label)} onClose={() => setDrill(null)} />
      )}
    </div>
  );
}


/* ───────────── Soldes par compte ───────────── */
function AccountsList({ accounts }: { accounts: TAccount[] }) {
  const fiat = accounts.filter((a) => a.kind === "FIAT" && a.valoEur != null && Math.abs(a.valoEur) >= 0.005);
  const crypto = accounts.filter((a) => a.kind === "CRYPTO" && (a.balance ?? 0) > 0);
  const row = (a: TAccount) => (
    <div key={a.id} className="flex items-center justify-between py-1.5">
      <span className="min-w-0 truncate text-ink-2">
        <span className="rounded bg-cloud px-1.5 py-0.5 text-[10px] font-medium text-ink-3">{a.currency}</span>{" "}
        {a.name || (a.kind === "CRYPTO" ? a.currency : "—")}
      </span>
      <span className="flex-none text-right">
        <span className="font-medium text-ink">{a.valoEur != null ? euro(a.valoEur) : "—"}</span>
        {a.kind === "CRYPTO" && (
          <span className="ml-1 text-xs text-ink-3">
            ({new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 6 }).format(a.balance)} {a.currency})
          </span>
        )}
      </span>
    </div>
  );
  return (
    <div className="mt-2 text-sm">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-3">Fiat</div>
      <div className="divide-y divide-line/70">{fiat.map(row)}</div>
      {crypto.length > 0 && (
        <>
          <div className="mt-3 text-xs font-medium uppercase tracking-wide text-ink-3">Crypto</div>
          <div className="divide-y divide-line/70">{crypto.map(row)}</div>
        </>
      )}
    </div>
  );
}

/* ───────────── Helpers graphes ───────────── */
type SeriePoint = { key: string; label: string; inflow: number; outflow: number; endBalance: number };

// Arrondi « joli » vers le haut pour caler les repères d'axe.
function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = 10 ** exp;
  const f = v / base;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * base;
}
// Montant abrégé pour les axes : « 30 k€ », « 450 € ».
function kEuro(v: number): string {
  const a = Math.abs(v);
  if (a >= 1000) return `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: a >= 10000 ? 0 : 1 })} k€`;
  return `${Math.round(v)} €`;
}
// Lissage Catmull-Rom → cubique de Bézier (coords en repère 0..100).
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

/* ───────────── Graphe 1 — Évolution de la trésorerie (aire lissée) ───────────── */
function TresoAreaChart({ series }: { series: SeriePoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = series.length;
  if (n === 0) return <p className="mt-6 text-center text-sm text-ink-3">Aucune donnée sur la période.</p>;

  const maxBal = Math.max(...series.map((s) => s.endBalance), 0);
  const niceMax = niceCeil(maxBal);
  const TOP = 8; // marge haute (place pour le marqueur)
  const yOf = (v: number) => {
    const y = TOP + (1 - v / niceMax) * (100 - TOP);
    return Math.min(100, Math.max(0, y));
  };
  const xOf = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 50);
  const pts = series.map((s, i) => ({ x: xOf(i), y: yOf(s.endBalance) }));
  const line = smoothPath(pts);
  const area = n > 1 ? `${line} L ${xOf(n - 1).toFixed(2)} 100 L ${xOf(0).toFixed(2)} 100 Z` : "";
  const ticks = [0, 1 / 3, 2 / 3, 1].map((t) => niceMax * t);
  const last = pts[n - 1];
  const lastVal = series[n - 1].endBalance;
  const sel = hover ?? n - 1;
  const ariaLabel = `Évolution de la trésorerie sur ${n} mois : de ${euro(series[0].endBalance)} (${series[0].label}) à ${euro(lastVal)} (${series[n - 1].label}).`;

  return (
    <div className="relative mt-3 select-none" onMouseLeave={() => setHover(null)} role="img" aria-label={ariaLabel}>
      <div className="relative h-44 pl-12">
        {/* Repères d'axe Y (libellés HTML, nets) */}
        {ticks.map((t, i) => (
          <span key={i} className="absolute left-0 -translate-y-1/2 text-[10px] font-medium text-ink-3"
            style={{ top: `${yOf(t)}%` }}>{kEuro(t)}</span>
        ))}
        {/* Zone traçée */}
        <div className="relative h-full">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
            <defs>
              <linearGradient id="treso-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-cyan)" stopOpacity="0.38" />
                <stop offset="100%" stopColor="var(--color-cyan)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Grille horizontale */}
            {ticks.map((t, i) => (
              <line key={i} x1="0" x2="100" y1={yOf(t)} y2={yOf(t)} stroke="var(--color-line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            {area && <path d={area} fill="url(#treso-area)" className="motion-safe:animate-[fade-in_0.7s_ease-out]" />}
            <path d={line} fill="none" stroke="var(--color-cyan-600)" strokeWidth={2} vectorEffect="non-scaling-stroke"
              strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          {/* Marqueur dernier point (sans étiquette flottante : la valeur reste lisible au survol) */}
          <span className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-cyan-600 shadow"
            style={{ left: `${last.x}%`, top: `${last.y}%` }} />
          {/* Marqueur survol */}
          {hover !== null && hover !== n - 1 && (
            <span className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-600"
              style={{ left: `${pts[hover].x}%`, top: `${pts[hover].y}%` }} />
          )}
          {/* Colonnes de survol */}
          <div className="absolute inset-0 flex">
            {series.map((s, i) => (
              <div key={s.key} className="h-full flex-1" onMouseEnter={() => setHover(i)} />
            ))}
          </div>
        </div>
      </div>
      {/* Axe des mois */}
      <div className="flex pl-12">
        {series.map((s, i) => (
          <div key={s.key} className="flex-1 text-center">
            {(n <= 14 || i % 2 === 0) && <span className={`text-[9px] ${sel === i ? "font-semibold text-ink" : "text-ink-3"}`}>{s.label}</span>}
          </div>
        ))}
      </div>
      {/* Tooltip */}
      {hover !== null && (
        <div className="pointer-events-none absolute top-0 z-10 w-40 -translate-x-1/2 rounded-card border border-line bg-white p-2.5 text-xs shadow-card-hover"
          style={{ left: `calc(48px + (100% - 48px) * ${(xOf(hover) / 100).toFixed(4)})`, ...(hover > n * 0.66 ? { transform: "translateX(-90%)" } : {}) }}>
          <div className="font-semibold text-ink">{series[hover].label}</div>
          <div className="mt-1.5"><Line label="Solde fin" value={euro(series[hover].endBalance)} strong /></div>
        </div>
      )}
    </div>
  );
}

/* ───────────── Graphe 2 — Flux nets mensuels (barres sur base zéro) ───────────── */
function FluxBarsChart({ series }: { series: SeriePoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = series.length;
  if (n === 0) return <p className="mt-6 text-center text-sm text-ink-3">Aucune donnée sur la période.</p>;

  const nets = series.map((s) => s.inflow + s.outflow);
  const niceMax = niceCeil(Math.max(1, ...nets.map(Math.abs)));
  const totalIn = series.reduce((s, m) => s + m.inflow, 0);
  const totalOut = series.reduce((s, m) => s + m.outflow, 0);
  const pos = nets.filter((v) => v > 0).length;
  const ariaLabel = `Flux nets mensuels sur ${n} mois : ${pos} mois positifs, ${n - pos} négatifs ou nuls ; entrées totales ${euro(totalIn)}, sorties totales ${euro(totalOut)}, net ${euro(totalIn + totalOut)}.`;

  return (
    <div className="relative mt-3 select-none" onMouseLeave={() => setHover(null)} role="img" aria-label={ariaLabel}>
      <div className="relative h-44">
        {/* Demi-hauteur positive (les colonnes prennent toute la hauteur → les % de barre se résolvent) */}
        <div className="flex h-1/2 gap-1.5">
          {series.map((s, i) => {
            const net = nets[i];
            const h = net > 0 ? (net / niceMax) * 100 : 0;
            const active = hover === null || hover === i;
            return (
              <div key={s.key} className="flex h-full flex-1 items-end justify-center" onMouseEnter={() => setHover(i)}>
                {net > 0 && (
                  <div className={`w-full max-w-[28px] origin-bottom rounded-t-md bg-emerald-400 transition-opacity motion-safe:animate-[grow-up_0.5s_ease-out] ${active ? "" : "opacity-40"}`}
                    style={{ height: `${h}%` }} />
                )}
              </div>
            );
          })}
        </div>
        {/* Ligne de base zéro (visible) */}
        <div className="pointer-events-none absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-ink-3/40" />
        {/* Demi-hauteur négative */}
        <div className="flex h-1/2 gap-1.5">
          {series.map((s, i) => {
            const net = nets[i];
            const h = net < 0 ? (Math.abs(net) / niceMax) * 100 : 0;
            const active = hover === null || hover === i;
            return (
              <div key={s.key} className="flex h-full flex-1 items-start justify-center" onMouseEnter={() => setHover(i)}>
                {net < 0 && (
                  <div className={`w-full max-w-[28px] origin-top rounded-b-md bg-red-400 transition-opacity motion-safe:animate-[grow-up_0.5s_ease-out] ${active ? "" : "opacity-40"}`}
                    style={{ height: `${h}%` }} />
                )}
              </div>
            );
          })}
        </div>
      </div>
      {/* Axe des mois */}
      <div className="mt-1 flex gap-1.5">
        {series.map((s, i) => (
          <div key={s.key} className="flex-1 text-center">
            {(n <= 14 || i % 2 === 0) && <span className={`text-[9px] ${hover === i ? "font-semibold text-ink" : "text-ink-3"}`}>{s.label}</span>}
          </div>
        ))}
      </div>
      {/* Tooltip */}
      {hover !== null && (
        <div className="pointer-events-none absolute top-0 z-10 w-44 -translate-x-1/2 rounded-card border border-line bg-white p-2.5 text-xs shadow-card-hover"
          style={{ left: `${((hover + 0.5) / n) * 100}%`, ...(hover > n * 0.66 ? { transform: "translateX(-90%)" } : {}) }}>
          <div className="font-semibold text-ink">{series[hover].label}</div>
          <div className="mt-1.5 space-y-1">
            <Line label="Entrées" value={euro(series[hover].inflow)} />
            <Line label="Sorties" value={euro(series[hover].outflow)} />
            <Line label="Net" value={euro(nets[hover])} strong />
          </div>
        </div>
      )}
    </div>
  );
}
function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-ink-2">{label}</span>
      <span className={`ml-auto ${strong ? "font-semibold text-ink" : "font-medium text-ink"}`}>{value}</span>
    </div>
  );
}

/* ───────────── Catégories + drill-down ───────────── */
function CategoryBreakdown({ cats, onPick }: { cats: TCatRow[]; onPick: (c: TCatRow) => void }) {
  if (cats.length === 0) return <p className="mt-6 text-center text-sm text-ink-3">Aucun décaissement externe sur la période.</p>;
  const top = cats.slice(0, 14);
  const total = cats.reduce((s, c) => s + c.amount, 0);
  const max = Math.max(1, ...top.map((c) => c.amount));
  return (
    <div className="mt-3 grid grid-cols-1 gap-1 sm:grid-cols-2">
      {top.map((c) => {
        const pct = total > 0 ? (c.amount / total) * 100 : 0;
        return (
          <button key={c.label} type="button" onClick={() => onPick(c)}
            className="block w-full rounded-lg px-1.5 py-1 text-left transition-colors hover:bg-cyan/[0.06] focus:bg-cyan/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan">
            <div className="flex items-baseline justify-between gap-2 text-xs">
              <span className="truncate text-ink-2">{c.label}</span>
              <span className="flex-none font-medium text-ink">{euro(c.amount)} <span className="font-normal text-ink-3">· {pct.toFixed(0)} %</span></span>
            </div>
            <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-cloud">
              <div className="h-full rounded-full bg-amber-400 transition-all duration-500" style={{ width: `${Math.max(2, (c.amount / max) * 100)}%` }} />
            </div>
          </button>
        );
      })}
      <div className="col-span-full border-t border-line pt-2 text-xs text-ink-3">Total décaissements : <strong className="text-ink">{euro(total)}</strong></div>
    </div>
  );
}

function CategoryDrawer({ cat, lines, onClose }: { cat: TCatRow; lines: OutflowRow[]; onClose: () => void }) {
  const total = lines.reduce((s, l) => s + l.amount, 0);
  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-navy/30" onClick={onClose} aria-hidden />
      <aside className="relative z-10 flex h-full w-full max-w-md flex-col bg-cloud shadow-xl">
        <div className="flex items-center justify-between border-b border-line bg-white px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">{cat.label}</h2>
            <p className="text-xs text-ink-3">{lines.length} décaissement(s) · {euro(total)}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fermer" className="rounded-md p-1.5 text-ink-3 hover:bg-cloud hover:text-ink">
            <IconX size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-3">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="text-xs uppercase tracking-wide text-ink-3">
                <th className="pb-2 pr-3 font-medium">Date</th>
                <th className="pb-2 pr-3 font-medium">Contrepartie</th>
                <th className="pb-2 text-right font-medium">Montant</th>
              </tr>
            </thead>
            <tbody>
              {lines.map((l, i) => (
                <tr key={i} className="border-t border-line/70">
                  <td className="py-2 pr-3 text-ink-2">{l.date.slice(8, 10)}/{l.date.slice(5, 7)}/{l.date.slice(0, 4)}</td>
                  <td className="py-2 pr-3 text-ink">{l.counterparty ?? "—"}</td>
                  <td className="py-2 text-right font-medium text-ink">{euro(l.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </aside>
    </div>
  );
}

