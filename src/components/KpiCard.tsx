import type { ReactNode } from "react";
import { IconArrowUpRight, IconArrowDownRight } from "@tabler/icons-react";

// Carte KPI partagée (charte Lynova) — même gabarit que Facturation / Trésorerie.
// `muted` grise la valeur (état « n/a »). `foot` remplace la ligne « Vs N-1 : — »
// quand aucun delta n'est fourni (ex. mention de garde-fou).
export function KpiCard({
  icon, tint, label, value, delta, deltaUnit = "%", deltaLabel = "Vs N-1", muted = false, foot,
}: {
  icon: ReactNode;
  tint: string;
  label: string;
  value: string;
  delta?: number | null;
  deltaUnit?: string;
  deltaLabel?: string;
  muted?: boolean;
  foot?: string;
}) {
  return (
    <div className="group rounded-card border border-line bg-white p-3.5 shadow-card transition-all duration-200 motion-safe:hover:-translate-y-px hover:shadow-card-hover">
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-[10px] ${tint}`}>{icon}</span>
        <span className="truncate text-xs font-medium uppercase tracking-wide text-ink-3">{label}</span>
      </div>
      <div className={`mt-2.5 text-2xl font-semibold leading-none ${muted ? "text-ink-3" : "text-ink"}`}>{value}</div>
      <div className="mt-1.5 min-h-4 space-y-1 text-xs">
        {delta != null ? (
          <span className="inline-flex items-center gap-1">
            <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold ${delta >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
              {delta >= 0 ? <IconArrowUpRight size={12} stroke={2.5} /> : <IconArrowDownRight size={12} stroke={2.5} />}
              {Math.abs(delta).toFixed(1)} {deltaUnit}
            </span>
            {deltaLabel && <span className="text-ink-3">{deltaLabel}</span>}
          </span>
        ) : (
          // Ni delta, ni foot → placeholder discret ; si un foot est fourni, on l'affiche à la place.
          !foot && <span className="text-ink-3">{deltaLabel} : —</span>
        )}
        {foot && <div className="text-ink-3">{foot}</div>}
      </div>
    </div>
  );
}
