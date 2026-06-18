import type { ReactNode } from "react";
import { IconArrowUpRight, IconArrowDownRight, IconAlertTriangle } from "@tabler/icons-react";
import { InfoTip } from "@/components/InfoTip";
import { pct1, euro, rel } from "@/lib/facturation";

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
//
// Comparaison N-1 « riche » : passer `valueRaw` (valeur courante brute) + `valuePrev` (valeur N-1
// brute, en €) → trois niveaux distincts sous la valeur :
//   1. ligne évolution : badge % coloré (polarité conservée) + delta € juste à côté ;
//   2. ligne `avgFoot` (⌀ …/mois) : MISE EN AVANT (text-sm/medium) car info importante ;
//   3. ligne N-1 : discrète (text-[11px] text-ink-3), préfixe `prevLabel` (défaut « N-1 »).
// `foot` reste une ligne de détail discrète (ex. « entrées · sorties »). Sans valueRaw/valuePrev,
// on retombe sur le mode `delta` (% précalculé) historique.
export function KpiCard({
  icon, tint, label, value, valueRaw, valuePrev, delta, deltaUnit = "%", deltaLabel = "Vs N-1", prevLabel = "N-1", muted = false, foot, avgFoot, positiveIsGood = true, deltaNeutral = false, staleNote, info, badge, compact = false,
}: {
  icon: ReactNode;
  tint: string;
  label: string;
  value: string;
  valueRaw?: number;
  valuePrev?: number;
  delta?: number | null;
  deltaUnit?: string;
  deltaLabel?: string;
  prevLabel?: string;
  muted?: boolean;
  foot?: string;
  // Ligne ⌀ …/mois mise en avant (sous la ligne évolution).
  avgFoot?: string;
  positiveIsGood?: boolean;
  deltaNeutral?: boolean;
  staleNote?: string;
  info?: ReactNode;
  // Pastille discrète à droite du label (ex. « actuel » pour un indicateur instantané affiché
  // alors qu'un exercice passé est sélectionné).
  badge?: ReactNode;
  // Version COMPACTE (~moitié de hauteur) : padding & valeur réduits, ⌀/mois + N-1 fusionnés sur
  // une seule petite ligne. Pour empiler la carte avec une autre dans une colonne de grille.
  compact?: boolean;
}) {
  // Mode N-1 riche (€ + %) si valeurs brutes fournies et carte non grisée.
  const hasN1 = valueRaw != null && valuePrev != null && !muted;
  const dPct = hasN1 ? rel(valueRaw!, valuePrev!) : null;
  const dEur = hasN1 ? valueRaw! - valuePrev! : null;
  // Direction (flèche + couleur) : % si calculable, sinon signe du delta €, sinon `delta` historique.
  const dir = hasN1 ? (dPct ?? dEur ?? 0) : (delta ?? 0);
  const hasDelta = hasN1 || delta != null;
  const isGood = hasDelta && (positiveIsGood ? dir >= 0 : dir <= 0);
  const badgeClass = deltaNeutral
    ? "bg-cloud text-ink-2"
    : isGood ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700";
  const Arrow = dir >= 0 ? IconArrowUpRight : IconArrowDownRight;
  return (
    <div className={`group rounded-card border border-line bg-white shadow-card transition-all duration-200 motion-safe:hover:-translate-y-px hover:shadow-card-hover ${compact ? "p-3" : "p-3.5"}`}>
      <div className="flex items-center gap-2">
        <span className={`flex h-8 w-8 flex-none items-center justify-center rounded-[10px] ${tint}`}>{icon}</span>
        <span className="min-w-0 text-xs font-medium uppercase leading-tight tracking-wide text-ink-3 line-clamp-2">{label}</span>
        {badge && <span className="flex-none rounded-full bg-cloud px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-ink-3">{badge}</span>}
        {info && <span className="flex-none"><InfoTip label={`Détail : ${label}`}>{info}</InfoTip></span>}
      </div>
      <div className={`font-semibold leading-none ${compact ? "mt-2 text-lg sm:text-xl" : "mt-2.5 text-xl sm:text-2xl"} ${muted ? "text-ink-3" : "text-ink"}`}>{value}</div>
      <div className={`min-h-4 ${compact ? "mt-1 space-y-0.5" : "mt-1.5 space-y-1"}`}>
        {/* 1 — ligne évolution (badge % + delta €), ou mode `delta` historique, ou placeholder */}
        {hasN1 ? (
          <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs">
            <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold ${badgeClass}`}>
              <Arrow size={12} stroke={2.5} />
              {dPct != null ? `${pct1(Math.abs(dPct))} %` : euro(Math.abs(dEur!))}
            </span>
            {dPct != null && (
              <span className="font-medium text-ink-2">{dEur! >= 0 ? "+" : "−"}{euro(Math.abs(dEur!))}</span>
            )}
          </span>
        ) : delta != null ? (
          <span className="inline-flex items-center gap-1 text-xs">
            <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold ${badgeClass}`}>
              <Arrow size={12} stroke={2.5} />
              {pct1(Math.abs(delta))} {deltaUnit}
            </span>
            {deltaLabel && <span className="text-ink-3">{deltaLabel}</span>}
          </span>
        ) : (
          // Ni delta, ni foot/avgFoot → placeholder discret.
          !foot && !avgFoot && <span className="text-xs text-ink-3">{deltaLabel} : —</span>
        )}
        {compact ? (
          <>
            {/* foot (ex. mention n/a) reste sur sa ligne */}
            {foot && <div className="text-[11px] text-ink-3">{foot}</div>}
            {/* compact : ⌀ …/mois + N-1 fusionnés sur une seule petite ligne */}
            {(avgFoot || hasN1) && (
              <div className="text-[11px]">
                {avgFoot && <span className="text-ink-2">{avgFoot}</span>}
                {avgFoot && hasN1 && <span className="text-ink-3"> · </span>}
                {hasN1 && <span className="font-medium text-n1-text">{prevLabel} {euro(valuePrev!)}</span>}
              </div>
            )}
          </>
        ) : (
          <>
            {/* 2 — ⌀ …/mois, mis en avant */}
            {avgFoot && <div className="text-sm font-medium text-ink-2">{avgFoot}</div>}
            {/* foot générique discret (ex. entrées · sorties) */}
            {foot && <div className="text-xs text-ink-3">{foot}</div>}
            {/* 3 — N-1, en ambré (code couleur N-1 harmonisé) */}
            {hasN1 && <div className="text-[11px] font-medium text-n1-text">{prevLabel} {euro(valuePrev!)}</div>}
          </>
        )}
        {staleNote && (
          <div className="inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
            <IconAlertTriangle size={11} stroke={2.5} /> {staleNote}
          </div>
        )}
      </div>
    </div>
  );
}
