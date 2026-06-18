import { IconTrendingUp } from "@tabler/icons-react";
import { euro } from "@/lib/facturation";
import { InfoTip } from "@/components/InfoTip";

// Carte « CA HT projeté · exercice » (Cockpit, exercice EN COURS uniquement). Deux scénarios à rythme
// constant : « Quasi certain » (base + MRR acquis × rem) et « Potentiel » (base + run-rate 6 mois × rem).
// Quand la projection n'est pas applicable (exercice clos / rem ≤ 0 / données insuffisantes), la carte
// reste affichée avec une mention dédiée (layout stable).
export interface CaProjection {
  base: number; // CA réalisé à date (mois courant inclus)
  rem: number; // mois pleins restants (juil→sept)
  quasiCertain: number;
  potentiel: number;
  monthsUsed: number;
  fewMonths: boolean;
  hasMrr: boolean;
}

export function CaProjectionCard({ fy, projection, className = "" }: { fy: number; projection: CaProjection | null; className?: string }) {
  return (
    <div className={`rounded-card border border-line bg-white p-3.5 shadow-card ${className}`}>
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-cyan/15 text-cyan-600">
          <IconTrendingUp size={18} stroke={2} />
        </span>
        <h2 className="min-w-0 text-xs font-semibold uppercase leading-tight tracking-wide text-ink-3 line-clamp-2">CA HT projeté · ex. {fy}</h2>
        <span className="flex-none">
          <InfoTip label="Détail : CA HT projeté">
            <span className="block">Projection à rythme constant, exercice en cours uniquement.</span>
            <span className="mt-1 block"><strong className="font-semibold text-ink">Base</strong> = CA HT réalisé à date (tout le facturé, mois en cours inclus). <strong className="font-semibold text-ink">rem</strong> = mois entièrement restants après le mois en cours (jusqu&apos;à septembre).</span>
            <span className="mt-1 block"><strong className="font-semibold text-ink">Quasi certain</strong> = base + MRR actuel × rem (récurrent déjà acquis).</span>
            <span className="mt-1 block"><strong className="font-semibold text-ink">Potentiel</strong> = base + run-rate × rem, où run-rate = CA HT moyen des 6 derniers mois complets glissants (mois en cours exclu de la moyenne).</span>
            <span className="mt-1 block text-ink-3">Le reliquat du mois en cours (jours restants) n&apos;est pas extrapolé → projection volontairement conservatrice.</span>
          </InfoTip>
        </span>
      </div>

      {projection == null ? (
        <p className="mt-3 text-sm text-ink-3">Projection disponible uniquement sur l&apos;exercice en cours.</p>
      ) : (
        <Body p={projection} />
      )}
    </div>
  );
}

function Body({ p }: { p: CaProjection }) {
  // Jauge : base (acquis) → min(scénarios) → max(scénarios). Robuste quel que soit l'ordre.
  const lo = Math.min(p.quasiCertain, p.potentiel);
  const hi = Math.max(p.quasiCertain, p.potentiel, 1);
  const w = (v: number) => `${Math.max(0, Math.min(100, (v / hi) * 100))}%`;
  return (
    <>
      <p className="mt-1.5 text-[11px] leading-tight text-ink-3">
        Réalisé à date <strong className="font-medium text-ink-2">{euro(p.base)}</strong> · {p.rem} mois restant{p.rem > 1 ? "s" : ""}
      </p>

      {/* Format étroit : les deux scénarios EMPILÉS (label gauche, valeur droite). */}
      <div className="mt-2.5 space-y-1.5">
        <div className="flex items-baseline justify-between gap-1.5">
          <span className="min-w-0 text-[11px] font-medium uppercase leading-tight tracking-wide text-ink-3">Quasi certain</span>
          <span className="flex-none tabular-nums text-sm font-semibold leading-none text-ink sm:text-base">{euro(p.quasiCertain)}</span>
        </div>
        <div className="flex items-baseline justify-between gap-1.5">
          <span className="min-w-0 text-[11px] font-medium uppercase leading-tight tracking-wide text-ink-3">Potentiel</span>
          <span className="flex-none tabular-nums text-sm font-semibold leading-none text-cyan-600 sm:text-base">{euro(p.potentiel)}</span>
        </div>
      </div>

      {/* Mini-jauge : acquis → quasi certain → potentiel */}
      <div className="mt-2.5">
        <div className="flex h-1.5 w-full overflow-hidden rounded-full bg-cloud">
          <div className="h-full bg-cyan-600" style={{ width: w(p.base) }} aria-hidden />
          <div className="h-full bg-cyan-600/55" style={{ width: w(lo - p.base) }} aria-hidden />
          <div className="h-full bg-cyan-600/25" style={{ width: w(hi - lo) }} aria-hidden />
        </div>
        <div className="mt-1 flex justify-between text-[10px] text-ink-3">
          <span>Réalisé</span>
          <span>{euro(hi)}</span>
        </div>
      </div>

      {p.fewMonths && (
        <p className="mt-2 text-[10px] leading-tight text-ink-3">
          Run-rate sur {p.monthsUsed} mois (&lt; 6 mois dispo).
        </p>
      )}
    </>
  );
}
