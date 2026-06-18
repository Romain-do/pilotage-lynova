import { IconArrowUpRight, IconArrowDownRight } from "@tabler/icons-react";
import { euro, rel, pct1 } from "@/lib/facturation";
import { InfoTip } from "@/components/InfoTip";

// Carte « Leaya » (style maison Leaya, tokens @theme). Partagée Evoliz + Trésorerie.
// ttc = total versé sur la période ; HT = ttc / 1,2 (TVA 20 %). Badge Vs N-1 si pertinent.
export function LeayaCard({ ttc, ttcPrev }: { ttc: number; ttcPrev: number }) {
  const ht = ttc / 1.2;
  const delta = ttcPrev > 0 ? rel(ttc, ttcPrev) : null;
  const dEur = ttc - ttcPrev; // delta € vs N-1
  return (
    <div className="group rounded-card border border-leaya-border bg-leaya p-3.5 shadow-card transition-all duration-200 motion-safe:hover:-translate-y-px hover:shadow-card-hover">
      <div className="flex h-8 items-center gap-2">
        <span className="font-serif text-lg italic leading-none text-leaya-gold">Leaya</span>
        <span className="flex-none text-leaya-gold">
          <InfoTip label="Détail : Leaya">
            <span className="block">Total versé à Leaya sur la période (TTC) — décaissements Revolut dont le bénéficiaire est Leaya.</span>
            <span className="mt-1 block">HT = TTC ÷ 1,2 (TVA 20 %).</span>
          </InfoTip>
        </span>
      </div>
      <div className="mt-2.5 flex flex-wrap items-baseline gap-1.5">
        <span className="text-xl font-semibold leading-none text-leaya-ink sm:text-2xl">{euro(ttc)}</span>
        <span className="text-[10px] font-medium uppercase tracking-wide text-leaya-gold">TTC</span>
      </div>
      <div className="mt-1.5 space-y-1 text-xs">
        {delta != null && (
          <>
            <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span className="inline-flex items-center gap-0.5 rounded-full bg-leaya-badge px-1.5 py-0.5 font-semibold text-leaya-ink">
                {delta >= 0 ? <IconArrowUpRight size={12} stroke={2.5} /> : <IconArrowDownRight size={12} stroke={2.5} />}
                {pct1(Math.abs(delta))} %
              </span>
              <span className="font-medium text-ink-2">{dEur >= 0 ? "+" : "−"}{euro(Math.abs(dEur))}</span>
            </span>
            <div className="text-[11px] font-medium text-n1-text">N-1 {euro(ttcPrev)}</div>
          </>
        )}
        <div className="text-ink-3">soit <strong className="font-medium text-leaya-ink">{euro(ht)}</strong> HT · TVA 20 %</div>
      </div>
    </div>
  );
}
