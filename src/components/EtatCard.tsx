import { IconArrowUpRight, IconArrowDownRight, IconBuildingBank } from "@tabler/icons-react";
import { euro, rel, pct1 } from "@/lib/facturation";
import { InfoTip } from "@/components/InfoTip";

// Carte « Versé à l'État » — style maison institutionnel (bleu-ardoise / slate soutenu, tokens
// @theme `etat`), volontairement distincte des KpiCard standards et du doré Leaya. Partagée Cockpit.
// total = TVA + charges sociales (URSSAF) + IS sur l'exercice. Les 3 composantes sont affichées
// EN CLAIR dans la carte (sous-lignes), pas seulement en infobulle.
// Delta NEUTRE vs N-1 : une variation des reversements ne porte aucun jugement (comme la
// rémunération) → badge ardoise neutre, jamais vert/rouge.
// `muted` (ex. pas de données bancaires) grise les montants et masque le delta au profit de `foot`.
export function EtatCard({
  total,
  totalPrev,
  tva,
  social,
  is,
  muted = false,
  foot,
}: {
  total: number;
  totalPrev: number;
  tva: number;
  social: number;
  is: number;
  muted?: boolean;
  foot?: string;
}) {
  const delta = !muted && totalPrev > 0 ? rel(total, totalPrev) : null;
  const dEur = total - totalPrev; // delta € vs N-1 (neutre)
  const rows: { label: string; hint: string; value: number }[] = [
    { label: "TVA", hint: "TVA reversée", value: tva },
    { label: "URSSAF", hint: "Charges sociales", value: social },
    { label: "IS", hint: "Impôt sociétés", value: is },
  ];
  return (
    <div className="group rounded-card border border-etat-border bg-etat p-3.5 shadow-card transition-all duration-200 motion-safe:hover:-translate-y-px hover:shadow-card-hover">
      <div className="flex h-8 items-center gap-2">
        <span className="flex h-7 w-7 flex-none items-center justify-center rounded-[9px] bg-etat-badge text-etat-accent">
          <IconBuildingBank size={16} stroke={2} />
        </span>
        <span className="min-w-0 text-[11px] font-medium uppercase leading-tight tracking-wide text-etat-accent line-clamp-2">
          Versé à l&apos;État
        </span>
        <span className="flex-none text-etat-accent">
          <InfoTip label="Détail : Versé à l'État">
            <span className="block">Total reversé à l&apos;État sur l&apos;exercice = TVA reversée + charges sociales (URSSAF) + impôt sur les sociétés (IS).</span>
            <span className="mt-1 block text-ink-3">Détail des 3 composantes affiché dans la carte.</span>
          </InfoTip>
        </span>
      </div>

      <div className={`mt-2.5 text-xl font-semibold leading-none sm:text-2xl ${muted ? "text-ink-3" : "text-etat-ink"}`}>
        {muted ? "n/a" : euro(total)}
      </div>

      <div className="mt-1.5 min-h-4 space-y-1 text-xs">
        {delta != null ? (
          <>
            <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
              <span className="inline-flex items-center gap-0.5 rounded-full bg-etat-badge px-1.5 py-0.5 font-semibold text-etat-ink">
                {delta >= 0 ? <IconArrowUpRight size={12} stroke={2.5} /> : <IconArrowDownRight size={12} stroke={2.5} />}
                {pct1(Math.abs(delta))} %
              </span>
              <span className="font-medium text-ink-2">{dEur >= 0 ? "+" : "−"}{euro(Math.abs(dEur))}</span>
            </span>
            <div className="text-[11px] font-medium text-n1-text">N-1 {euro(totalPrev)}</div>
          </>
        ) : (
          foot && <span className="text-ink-3">{foot}</span>
        )}
      </div>

      {/* Les 3 composantes, directement lisibles dans la carte. */}
      <dl className="mt-2.5 space-y-1 border-t border-etat-border/80 pt-2.5">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-2 text-xs">
            <dt className="text-etat-accent" title={r.hint}>{r.label}</dt>
            <dd className="font-medium tabular-nums text-etat-ink">{muted ? "—" : euro(r.value)}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}
