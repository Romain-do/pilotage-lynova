import type { ReactNode } from "react";
import { IconArrowUpRight, IconArrowDownRight, IconAlertTriangle } from "@tabler/icons-react";
import { InfoTip } from "@/components/InfoTip";
import { pct1 } from "@/lib/facturation";

// Carte KPI partagée (charte Lynova) — même gabarit que Facturation / Trésorerie.
// `muted` grise la valeur (état « n/a »). `foot` remplace la ligne « Vs N-1 : — »
// quand aucun delta n'est fourni (ex. mention de garde-fou).
// `positiveIsGood` (défaut true) : sens métier du delta. Pour un KPI de COÛT « franc » (achats…),
// passer `false` → la couleur s'inverse (une hausse = rouge, une baisse = vert).
// `deltaNeutral` (défaut false) : aucune polarité, badge gris neutre — pour une métrique dont la
// variation ne porte pas de jugement (ex. rémunération : une hausse n'est ni « bonne » ni « mauvaise »).
// La flèche reflète toujours le sens réel de variation, seule la couleur (ou son absence) juge.
// `staleNote` (optionnel) : mention ambre sous le KPI quand une source d'un indicateur COMPOSITE
// est périmée (ex. marge nette = Evoliz × Revolut) → ne pas présenter le chiffre comme fiable.
// `info` (optionnel) : contenu d'une infobulle « ⓘ » à côté du label (détail technique déporté).
export function KpiCard({
  icon, tint, label, value, delta, deltaUnit = "%", deltaLabel = "Vs N-1", muted = false, foot, positiveIsGood = true, deltaNeutral = false, staleNote, info,
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
  positiveIsGood?: boolean;
  deltaNeutral?: boolean;
  staleNote?: string;
  info?: ReactNode;
}) {
  const isGood = delta != null && (positiveIsGood ? delta >= 0 : delta <= 0);
  const badgeClass = deltaNeutral
    ? "bg-cloud text-ink-2"
    : isGood ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700";
  return (
    <div className="group rounded-card border border-line bg-white p-3.5 shadow-card transition-all duration-200 motion-safe:hover:-translate-y-px hover:shadow-card-hover">
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-[10px] ${tint}`}>{icon}</span>
        <span className="min-w-0 truncate text-xs font-medium uppercase tracking-wide text-ink-3">{label}</span>
        {info && <span className="flex-none"><InfoTip label={`Détail : ${label}`}>{info}</InfoTip></span>}
      </div>
      <div className={`mt-2.5 text-2xl font-semibold leading-none ${muted ? "text-ink-3" : "text-ink"}`}>{value}</div>
      <div className="mt-1.5 min-h-4 space-y-1 text-xs">
        {delta != null ? (
          <span className="inline-flex items-center gap-1">
            <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold ${badgeClass}`}>
              {delta >= 0 ? <IconArrowUpRight size={12} stroke={2.5} /> : <IconArrowDownRight size={12} stroke={2.5} />}
              {pct1(Math.abs(delta))} {deltaUnit}
            </span>
            {deltaLabel && <span className="text-ink-3">{deltaLabel}</span>}
          </span>
        ) : (
          // Ni delta, ni foot → placeholder discret ; si un foot est fourni, on l'affiche à la place.
          !foot && <span className="text-ink-3">{deltaLabel} : —</span>
        )}
        {foot && <div className="text-ink-3">{foot}</div>}
        {staleNote && (
          <div className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
            <IconAlertTriangle size={11} stroke={2.5} /> {staleNote}
          </div>
        )}
      </div>
    </div>
  );
}
