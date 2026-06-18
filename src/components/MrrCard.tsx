"use client";

import { IconRepeat, IconArrowUpRight, IconArrowDownRight } from "@tabler/icons-react";
import { euro, pct1, rel } from "@/lib/facturation";
import { InfoTip } from "@/components/InfoTip";
import { TresoAreaChart, type SeriePoint } from "@/components/TresoAreaChart";

// Carte MRR élargie (Cockpit) : KPI MRR (valeur + badge % + delta € + ligne N-1) AU-DESSUS du graphe
// « Évolution du MRR » (aire lissée + courbe N-1 ambrée). Occupe 2 colonnes en desktop (lg:col-span-2),
// pleine largeur en mobile (grid-cols-2 → col-span-2). Polarité « plus haut = mieux ».
export function MrrCard({
  mrr,
  mrrPrev,
  monthLabel,
  series,
  compare,
}: {
  mrr: number;
  mrrPrev: number;
  monthLabel: string | null;
  series: SeriePoint[];
  compare?: SeriePoint[];
}) {
  const dPct = rel(mrr, mrrPrev);
  const dEur = mrr - mrrPrev;
  const dir = dPct ?? dEur;
  const badgeClass = dir >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700";
  const Arrow = dir >= 0 ? IconArrowUpRight : IconArrowDownRight;
  return (
    <div className="group col-span-2 rounded-card border border-line bg-white p-3.5 shadow-card transition-all duration-200 motion-safe:hover:-translate-y-px hover:shadow-card-hover">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-sky-50 text-sky-600">
          <IconRepeat size={18} stroke={2} />
        </span>
        <span className="min-w-0 text-xs font-medium uppercase leading-tight tracking-wide text-ink-3 line-clamp-2">MRR · {monthLabel ?? "—"}</span>
        <span className="flex-none">
          <InfoTip label="Détail : MRR">
            <span className="block">Revenu mensuel récurrent : montant HT des abonnements facturés sur le mois, comparé au même mois N-1.</span>
            <span className="mt-1 block text-ink-3">La courbe montre le niveau mensuel sur l&apos;exercice (pointillé ambré = N-1).</span>
          </InfoTip>
        </span>
      </div>

      <div className="mt-2.5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="text-xl font-semibold leading-none text-ink sm:text-2xl">{euro(mrr)}</span>
        <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
          <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold ${badgeClass}`}>
            <Arrow size={12} stroke={2.5} />
            {dPct != null ? `${pct1(Math.abs(dPct))} %` : euro(Math.abs(dEur))}
          </span>
          {dPct != null && (
            <span className="font-medium text-ink-2">{dEur >= 0 ? "+" : "−"}{euro(Math.abs(dEur))}</span>
          )}
        </span>
        <span className="text-[11px] font-medium text-n1-text">N-1 {euro(mrrPrev)}</span>
      </div>

      <div className="mt-2">
        <TresoAreaChart series={series} compare={compare} title="Évolution du MRR" valueLabel="MRR" deltaInTooltip />
      </div>
    </div>
  );
}
