"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  IconCoin,
  IconRepeat,
  IconCash,
  IconClock,
  IconRefresh,
  IconArrowUpRight,
  IconArrowDownRight,
} from "@tabler/icons-react";
import {
  euro,
  fyLabel,
  listFiscalYears,
  computeExercice,
  compareAsOf,
  computeMRR,
  computeClients,
  fyMonthIndex,
  FY_MONTH_LABELS,
  type FactDoc,
  type TypeFilter,
} from "@/lib/facturation";
import { IconChartBar } from "@tabler/icons-react";
import { refreshEvoliz } from "./actions";

const TYPES: { key: TypeFilter; label: string }[] = [
  { key: "all", label: "Tout" },
  { key: "abo", label: "Abonnements" },
  { key: "install", label: "Installations" },
];

export function Facturation({
  docs,
  todayISO,
  lastSync,
}: {
  docs: FactDoc[];
  todayISO: string;
  lastSync: string | null;
}) {
  const fyList = useMemo(() => listFiscalYears(docs), [docs]);
  const [fy, setFy] = useState(fyList[0]);
  const [type, setType] = useState<TypeFilter>("all");
  const [clientSort, setClientSort] = useState<"ca" | "abo">("ca");

  const stats = useMemo(() => computeExercice(docs, fy, type), [docs, fy, type]);
  const prev = useMemo(() => computeExercice(docs, fy - 1, type), [docs, fy, type]);
  const cmp = useMemo(() => compareAsOf(docs, fy, type, todayISO), [docs, fy, type, todayISO]);
  const mrr = useMemo(() => computeMRR(docs), [docs]);
  const clients = useMemo(() => computeClients(docs, fy), [docs, fy]);

  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => (clientSort === "ca" ? b.ca - a.ca : b.aboHt - a.aboHt)).slice(0, 12),
    [clients, clientSort]
  );

  // Mois écoulés dans l'exercice (jusqu'à fin du mois courant) ; CA moyen / mois.
  const elapsedMonths = cmp.partial ? fyMonthIndex(todayISO) + 1 : 12;
  const avgPerMonth = stats.caHt / elapsedMonths;

  return (
    <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
      {/* Barre d'outils */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap items-center gap-3">
          <select
            value={fy}
            onChange={(e) => setFy(Number(e.target.value))}
            className="rounded-card border border-line bg-white px-3.5 py-2 text-sm font-semibold text-ink shadow-card focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/40"
          >
            {fyList.map((y) => (
              <option key={y} value={y}>
                {fyLabel(y)}
              </option>
            ))}
          </select>
          {cmp.partial && (
            <span className="rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700">
              en cours
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex rounded-card border border-line bg-white p-1 shadow-card">
            {TYPES.map((t) => (
              <button
                key={t.key}
                type="button"
                onClick={() => setType(t.key)}
                className={`rounded-[10px] px-3 py-1.5 text-sm font-medium transition-colors ${
                  type === t.key ? "bg-navy text-white" : "text-ink-2 hover:bg-cloud hover:text-ink"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <RefreshButton initialLastSync={lastSync} />
        </div>
      </div>

      {/* KPIs */}
      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
        <KpiCard
          icon={<IconCoin size={18} stroke={2} />}
          tint="bg-cyan/15 text-cyan-600"
          label={`CA HT ${cmp.partial ? "à date" : "exercice"}`}
          value={euro(stats.caHt)}
          delta={cmp.pct}
          deltaHint="Vs N-1"
        />
        <KpiCard
          icon={<IconChartBar size={18} stroke={2} />}
          tint="bg-cyan/15 text-cyan-600"
          label="CA HT moyen / mois"
          value={euro(avgPerMonth)}
          delta={cmp.pct}
          deltaHint="Vs N-1"
        />
        <KpiCard
          icon={<IconRepeat size={18} stroke={2} />}
          tint="bg-emerald-50 text-emerald-600"
          label="MRR"
          value={euro(mrr.mrr)}
          foot={`Abonnements HT · ${mrr.month ?? "—"}`}
        />
        <KpiCard
          icon={<IconCash size={18} stroke={2} />}
          tint="bg-sky-50 text-sky-600"
          label="Encaissé"
          value={euro(stats.encaisseTtc)}
          foot="TTC · sur l'exercice"
        />
        <KpiCard
          icon={<IconClock size={18} stroke={2} />}
          tint="bg-amber-50 text-amber-600"
          label="Restant dû"
          value={euro(stats.resteTtc)}
          foot="TTC · impayés exercice"
        />
      </div>

      {/* Graphiques */}
      <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-3">
        <div className="rounded-card border border-line bg-white p-5 shadow-card lg:col-span-2">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-sm font-semibold text-ink">CA mensuel HT</h2>
              <p className="text-xs text-ink-3">Exercice {fy} vs {fy - 1} · axe oct → sept</p>
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-cyan" /> Abonnement</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-cyan/45" /> Installation</span>
              <span className="text-ink-3">· {fy} cyan / {fy - 1} gris</span>
            </div>
          </div>
          <MonthlyChart
            curAbo={stats.monthlyAbo}
            curInstall={stats.monthlyInstall}
            prevAbo={prev.monthlyAbo}
            prevInstall={prev.monthlyInstall}
            fyCur={fy}
            fyPrev={fy - 1}
          />
        </div>

        <div className="rounded-card border border-line bg-white p-5 shadow-card">
          <h2 className="text-sm font-semibold text-ink">Répartition du CA</h2>
          <p className="text-xs text-ink-3">HT brut · factures validées</p>
          <DonutCard abo={stats.aboHt} install={stats.installHt} total={stats.caHt} />
        </div>
      </div>

      {/* Clients */}
      <div className="mt-5 rounded-card border border-line bg-white p-5 shadow-card">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-ink">Clients · exercice {fy}</h2>
          <div className="inline-flex rounded-[10px] border border-line bg-cloud p-0.5 text-xs">
            {(["ca", "abo"] as const).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setClientSort(k)}
                className={`rounded-md px-2.5 py-1 font-medium transition-colors ${
                  clientSort === k ? "bg-navy text-white" : "text-ink-2 hover:text-ink"
                }`}
              >
                {k === "ca" ? "Par CA HT" : "Par abonnement"}
              </button>
            ))}
          </div>
        </div>
        <ClientsTable rows={sortedClients} sortKey={clientSort} />
      </div>

      <p className="mt-4 text-xs text-ink-3">
        CA en <strong className="text-ink-2">HT brut</strong> (factures validées, avoirs non déduits,
        aligné Evoliz) · abonnement &lt; 2 000 € HT / installation ≥ 2 000 € · « encaissé » et
        « restant dû » en <strong className="text-ink-2">TTC</strong>.
      </p>
    </div>
  );
}

/* ─────────────────────────── KPI ─────────────────────────── */

function KpiCard({
  icon,
  tint,
  label,
  value,
  delta,
  deltaHint,
  foot,
}: {
  icon: React.ReactNode;
  tint: string;
  label: string;
  value: string;
  delta?: number | null;
  deltaHint?: string;
  foot?: string;
}) {
  return (
    <div className="group rounded-card border border-line bg-white p-4 shadow-card transition-all duration-200 motion-safe:hover:-translate-y-px hover:shadow-card-hover">
      <div className="flex items-center gap-2.5">
        <span className={`flex h-9 w-9 items-center justify-center rounded-[10px] ${tint}`}>{icon}</span>
        <span className="text-xs font-medium uppercase tracking-wide text-ink-3">{label}</span>
      </div>
      <div className="mt-3 text-[1.7rem] font-semibold leading-none text-ink">{value}</div>
      <div className="mt-2 min-h-5 text-xs">
        {delta !== undefined ? (
          delta === null ? (
            <span className="text-ink-3">N-1 indisponible</span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <span
                className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold ${
                  delta >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
                }`}
              >
                {delta >= 0 ? <IconArrowUpRight size={12} stroke={2.5} /> : <IconArrowDownRight size={12} stroke={2.5} />}
                {Math.abs(delta).toFixed(1)} %
              </span>
              {deltaHint && <span className="text-ink-3">{deltaHint}</span>}
            </span>
          )
        ) : (
          <span className="text-ink-3">{foot}</span>
        )}
      </div>
    </div>
  );
}

/* ─────────────────────── Graphique mensuel ─────────────────────── */

function MonthlyChart({
  curAbo,
  curInstall,
  prevAbo,
  prevInstall,
  fyCur,
  fyPrev,
}: {
  curAbo: number[];
  curInstall: number[];
  prevAbo: number[];
  prevInstall: number[];
  fyCur: number;
  fyPrev: number;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const curTot = curAbo.map((v, i) => v + curInstall[i]);
  const prevTot = prevAbo.map((v, i) => v + prevInstall[i]);
  const max = Math.max(1, ...curTot, ...prevTot);

  return (
    <div className="relative mt-4" onMouseLeave={() => setHover(null)}>
      <div className="flex h-56 items-end gap-1 sm:gap-1.5">
        {FY_MONTH_LABELS.map((m, i) => {
          const active = hover === null || hover === i;
          return (
            <div
              key={m}
              className="relative flex h-full flex-1 cursor-default flex-col items-center justify-end rounded-lg"
              onMouseEnter={() => setHover(i)}
            >
              <div
                className={`absolute inset-x-0 bottom-6 top-0 rounded-lg transition-colors ${
                  hover === i ? "bg-cyan/[0.07]" : "bg-transparent"
                }`}
              />
              <div className="relative flex h-full w-full items-end justify-center gap-0.5 pb-6">
                <StackBar abo={prevAbo[i]} install={prevInstall[i]} max={max} idx={i} aboColor="bg-navy/30" installColor="bg-navy/15" dim={!active} />
                <StackBar abo={curAbo[i]} install={curInstall[i]} max={max} idx={i} aboColor="bg-cyan" installColor="bg-cyan/45" dim={!active} />
              </div>
              <span
                className={`absolute bottom-0 text-[10px] transition-colors ${
                  hover === i ? "font-semibold text-ink" : "text-ink-3"
                }`}
              >
                {m}
              </span>
            </div>
          );
        })}
      </div>

      {hover !== null && (
        <ChartTooltip
          index={hover}
          month={FY_MONTH_LABELS[hover]}
          curAbo={curAbo[hover]}
          curInstall={curInstall[hover]}
          prevAbo={prevAbo[hover]}
          prevInstall={prevInstall[hover]}
          fyCur={fyCur}
          fyPrev={fyPrev}
        />
      )}
    </div>
  );
}

function StackBar({
  abo,
  install,
  max,
  idx,
  aboColor,
  installColor,
  dim,
}: {
  abo: number;
  install: number;
  max: number;
  idx: number;
  aboColor: string;
  installColor: string;
  dim: boolean;
}) {
  const total = abo + install;
  const hPct = Math.min(100, (total / max) * 100);
  const installInner = total > 0 ? (install / total) * 100 : 0;
  const aboInner = total > 0 ? (abo / total) * 100 : 0;
  return (
    <div
      className={`w-2.5 origin-bottom overflow-hidden rounded-t-md transition-opacity duration-200 motion-safe:animate-[grow-up_0.5s_ease-out_both] sm:w-3 ${
        dim ? "opacity-40" : "opacity-100"
      }`}
      style={{ height: `${hPct}%`, animationDelay: `${idx * 25}ms` }}
    >
      <div className={installColor} style={{ height: `${installInner}%` }} />
      <div className={aboColor} style={{ height: `${aboInner}%` }} />
    </div>
  );
}

function ChartTooltip({
  index,
  month,
  curAbo,
  curInstall,
  prevAbo,
  prevInstall,
  fyCur,
  fyPrev,
}: {
  index: number;
  month: string;
  curAbo: number;
  curInstall: number;
  prevAbo: number;
  prevInstall: number;
  fyCur: number;
  fyPrev: number;
}) {
  const curTot = curAbo + curInstall;
  const prevTot = prevAbo + prevInstall;
  const diff = curTot - prevTot;
  const pct = prevTot !== 0 ? (diff / prevTot) * 100 : null;
  const left = ((index + 0.5) / 12) * 100;
  const alignRight = index >= 8;
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 w-56 -translate-x-1/2 rounded-card border border-line bg-white p-3 text-xs shadow-card-hover"
      style={{ left: `${left}%`, ...(alignRight ? { transform: "translateX(-85%)" } : {}) }}
    >
      <div className="font-semibold text-ink">{month}.</div>

      <div className="mt-2">
        <div className="mb-1 flex items-center gap-1.5 font-medium text-ink">
          <span className="h-2 w-2 rounded-sm bg-cyan" /> Exercice {fyCur}
        </div>
        <Row label="Abonnement" value={euro(curAbo)} />
        <Row label="Installation" value={euro(curInstall)} />
        <Row label="Total" value={euro(curTot)} strong />
      </div>

      <div className="mt-2 border-t border-line pt-1.5">
        <div className="mb-1 flex items-center gap-1.5 font-medium text-ink-2">
          <span className="h-2 w-2 rounded-sm bg-navy/30" /> Exercice {fyPrev}
        </div>
        <Row label="Abonnement" value={euro(prevAbo)} />
        <Row label="Installation" value={euro(prevInstall)} />
        <Row label="Total" value={euro(prevTot)} strong />
      </div>

      <div className="mt-2 border-t border-line pt-1.5">
        {pct === null ? (
          <span className="text-ink-3">Écart N-1 : —</span>
        ) : (
          <span className={diff >= 0 ? "text-emerald-700" : "text-red-700"}>
            {diff >= 0 ? "▲" : "▼"} {euro(Math.abs(diff))} ({Math.abs(pct).toFixed(0)} %)
          </span>
        )}
      </div>
    </div>
  );
}

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-ink-2">{label}</span>
      <span className={`ml-auto ${strong ? "font-semibold text-ink" : "font-medium text-ink"}`}>{value}</span>
    </div>
  );
}

/* ─────────────────────────── Donut ─────────────────────────── */

function DonutCard({ abo, install, total }: { abo: number; install: number; total: number }) {
  const [hover, setHover] = useState<"abo" | "install" | null>(null);
  const [isolate, setIsolate] = useState<"abo" | "install" | null>(null);

  const sumAbs = Math.abs(abo) + Math.abs(install);
  const aboPct = sumAbs > 0 ? Math.abs(abo) / sumAbs : 0;
  const r = 54;
  const c = 2 * Math.PI * r;
  const aboLen = aboPct * c;

  const focus = hover ?? isolate;
  const center: { label: string; value: string; pct: number | null } =
    focus === "abo"
      ? { label: "Abonnements", value: euro(abo), pct: aboPct }
      : focus === "install"
        ? { label: "Installations", value: euro(install), pct: 1 - aboPct }
        : { label: "Total HT", value: euro(total), pct: null };

  const dim = (seg: "abo" | "install") => isolate !== null && isolate !== seg;

  return (
    <div className="mt-3 flex flex-col items-center gap-4 sm:flex-row sm:items-center">
      <div className="relative h-36 w-36 flex-none">
        <svg viewBox="0 0 140 140" className="h-36 w-36 -rotate-90">
          <circle cx="70" cy="70" r={r} fill="none" stroke="var(--color-line)" strokeWidth="16" />
          <circle
            cx="70"
            cy="70"
            r={r}
            fill="none"
            className="cursor-pointer transition-[stroke-width,opacity] duration-200 text-cyan"
            stroke="currentColor"
            strokeWidth={hover === "abo" ? 22 : 16}
            strokeOpacity={dim("abo") ? 0.25 : 1}
            strokeDasharray={`${aboLen} ${c - aboLen}`}
            strokeLinecap="butt"
            onMouseEnter={() => setHover("abo")}
            onMouseLeave={() => setHover(null)}
          />
          <circle
            cx="70"
            cy="70"
            r={r}
            fill="none"
            className="cursor-pointer transition-[stroke-width,opacity] duration-200 text-navy"
            stroke="currentColor"
            strokeWidth={hover === "install" ? 22 : 16}
            strokeOpacity={dim("install") ? 0.25 : 1}
            strokeDasharray={`${c - aboLen} ${aboLen}`}
            strokeDashoffset={-aboLen}
            strokeLinecap="butt"
            onMouseEnter={() => setHover("install")}
            onMouseLeave={() => setHover(null)}
          />
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] uppercase tracking-wide text-ink-3">{center.label}</span>
          <span className="text-base font-semibold text-ink">{center.value}</span>
          {center.pct !== null && (
            <span className="text-[11px] text-ink-3">{(center.pct * 100).toFixed(0)} %</span>
          )}
        </div>
      </div>

      <div className="w-full space-y-1.5 text-sm">
        <LegendButton
          color="bg-cyan"
          label="Abonnements"
          value={euro(abo)}
          active={isolate === "abo"}
          onClick={() => setIsolate(isolate === "abo" ? null : "abo")}
          onHover={(h) => setHover(h ? "abo" : null)}
        />
        <LegendButton
          color="bg-navy"
          label="Installations"
          value={euro(install)}
          active={isolate === "install"}
          onClick={() => setIsolate(isolate === "install" ? null : "install")}
          onHover={(h) => setHover(h ? "install" : null)}
        />
      </div>
    </div>
  );
}

function LegendButton({
  color,
  label,
  value,
  active,
  onClick,
  onHover,
}: {
  color: string;
  label: string;
  value: string;
  active: boolean;
  onClick: () => void;
  onHover: (h: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => onHover(true)}
      onMouseLeave={() => onHover(false)}
      className={`flex w-full items-center gap-2 rounded-[10px] border px-2.5 py-1.5 text-left transition-colors ${
        active ? "border-cyan/50 bg-cyan/[0.06]" : "border-transparent hover:bg-cloud"
      }`}
    >
      <span className={`h-2.5 w-2.5 rounded-full ${color}`} />
      <span className="text-ink-2">{label}</span>
      <span className="ml-auto font-semibold text-ink">{value}</span>
    </button>
  );
}

/* ─────────────────────────── Clients ─────────────────────────── */

function ClientsTable({
  rows,
  sortKey,
}: {
  rows: { clientName: string; ca: number; aboHt: number }[];
  sortKey: "ca" | "abo";
}) {
  const max = Math.max(1, ...rows.map((r) => (sortKey === "ca" ? r.ca : r.aboHt)));
  if (rows.length === 0) {
    return <p className="mt-6 text-center text-sm text-ink-3">Aucun client sur cet exercice.</p>;
  }
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[460px] text-left text-sm">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-ink-3">
            <th className="pb-2 pr-4 font-medium">Client</th>
            <th className="pb-2 pr-4 text-right font-medium">CA HT</th>
            <th className="pb-2 text-right font-medium">dont abonnement HT</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const w = Math.max(2, ((sortKey === "ca" ? r.ca : r.aboHt) / max) * 100);
            return (
              <tr key={r.clientName} className="group border-t border-line/70 transition-colors hover:bg-cloud">
                <td className="py-2.5 pr-4">
                  <div className="font-medium text-ink">{r.clientName}</div>
                  <div className="mt-1 h-1.5 w-full max-w-[220px] overflow-hidden rounded-full bg-cloud">
                    <div
                      className="h-full rounded-full bg-cyan/70 transition-all duration-500"
                      style={{ width: `${w}%` }}
                    />
                  </div>
                </td>
                <td className="py-2.5 pr-4 text-right font-medium text-ink">{euro(r.ca)}</td>
                <td className="py-2.5 text-right text-ink-2">{r.aboHt ? euro(r.aboHt) : "—"}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/* ─────────────────────────── Actualiser ─────────────────────────── */

function RefreshButton({ initialLastSync }: { initialLastSync: string | null }) {
  const [pending, start] = useTransition();
  const [lastSync, setLastSync] = useState(initialLastSync);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [now, setNow] = useState<number | null>(null);

  useEffect(() => {
    const id = requestAnimationFrame(() => setNow(Date.now()));
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => {
      cancelAnimationFrame(id);
      clearInterval(t);
    };
  }, []);

  function run() {
    setMsg(null);
    start(async () => {
      const r = await refreshEvoliz();
      setMsg({ ok: r.ok, text: r.message });
      if (r.ok && r.lastSync) setLastSync(r.lastSync);
      setTimeout(() => setMsg(null), 6000);
    });
  }

  const rel = lastSync && now ? relativeTime(lastSync, now) : null;

  return (
    <div className="flex items-center gap-3">
      <div className="text-right text-xs text-ink-3" suppressHydrationWarning>
        {rel ? (
          <>
            Dernière synchro
            <br />
            <span className="text-ink-2">{rel}</span>
          </>
        ) : (
          <span>&nbsp;</span>
        )}
      </div>
      <button
        type="button"
        onClick={run}
        disabled={pending}
        className="inline-flex items-center gap-2 rounded-card bg-navy px-3.5 py-2 text-sm font-medium text-white shadow-card transition-colors hover:bg-navy-700 disabled:cursor-not-allowed disabled:opacity-70"
      >
        <IconRefresh size={16} stroke={2} className={pending ? "animate-spin" : ""} />
        {pending ? "Actualisation…" : "Actualiser"}
      </button>
      {msg && (
        <span
          className={`rounded-full px-2.5 py-1 text-xs font-medium ${
            msg.ok ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"
          }`}
        >
          {msg.text}
        </span>
      )}
    </div>
  );
}

function relativeTime(iso: string, now: number): string {
  const s = Math.max(0, (now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "à l'instant";
  if (s < 3600) return `il y a ${Math.floor(s / 60)} min`;
  if (s < 86400) return `il y a ${Math.floor(s / 3600)} h`;
  return `il y a ${Math.floor(s / 86400)} j`;
}
