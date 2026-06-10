import { IconArrowUpRight, IconArrowDownRight } from "@tabler/icons-react";
import { euro, rel } from "@/lib/facturation";

// Carte « Versé à Leaya » (style maison Leaya, tokens @theme). Partagée Cockpit + Trésorerie.
// ttc = total versé sur la période ; HT = ttc / 1,2 (TVA 20 %). Badge Vs N-1 si pertinent.
export function LeayaCard({ ttc, ttcPrev }: { ttc: number; ttcPrev: number }) {
  const ht = ttc / 1.2;
  const delta = ttcPrev > 0 ? rel(ttc, ttcPrev) : null;
  return (
    <div className="group rounded-card border border-leaya-border bg-leaya p-3.5 shadow-card transition-all duration-200 motion-safe:hover:-translate-y-px hover:shadow-card-hover">
      <div className="flex h-8 items-center gap-2">
        <span className="text-[11px] font-medium uppercase tracking-wide text-leaya-gold">Versé à</span>
        <span className="font-serif text-lg italic leading-none text-leaya-gold">Leaya</span>
      </div>
      <div className="mt-2.5 flex items-baseline gap-1.5">
        <span className="text-2xl font-semibold leading-none text-leaya-ink">{euro(ttc)}</span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-leaya-gold">TTC</span>
      </div>
      <div className="mt-1.5 space-y-1 text-xs">
        {delta != null && (
          <span className="inline-flex items-center gap-1">
            <span className="inline-flex items-center gap-0.5 rounded-full bg-leaya-badge px-1.5 py-0.5 font-semibold text-leaya-ink">
              {delta >= 0 ? <IconArrowUpRight size={12} stroke={2.5} /> : <IconArrowDownRight size={12} stroke={2.5} />}
              {Math.abs(delta).toFixed(1)} %
            </span>
            <span className="text-ink-3">Vs N-1</span>
          </span>
        )}
        <div className="text-ink-3">soit <strong className="font-medium text-leaya-ink">{euro(ht)}</strong> HT · TVA 20 %</div>
      </div>
    </div>
  );
}
