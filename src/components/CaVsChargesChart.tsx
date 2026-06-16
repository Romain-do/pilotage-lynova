"use client";

import { Fragment, type CSSProperties } from "react";
import { IconX } from "@tabler/icons-react";
import { euro, apportionEuros } from "@/lib/facturation";
import { CHARGE_CATEGORIES, type ChargeCategory } from "@/lib/tresorerie";
import { useChartSelection } from "@/components/useChartSelection";

// Graphe « CA vs charges — mensuel HT ». Par mois : barre CA empilée (abonnement + installation)
// vs barre CHARGES empilée. La barre charges = charges d'EXPLOITATION (ventilation des dépenses
// Revolut hors deny-list TVA/IS, URSSAF incluse), une couleur par catégorie + « Autres ». Marge
// nette = CA HT − charges d'exploitation, d'où l'identité CA − barre exploitation = marge du mois.
//
// Au-dessus, empilés et hachurés (teinte neutre), les reversements HORS EXPLOITATION (TVA reversée
// à l'État, impôt sociétés) : PUREMENT VISUELS — ils montrent tout ce qui sort du compte mais
// n'entrent PAS dans la marge nette. Légende « hors exploitation ».
//
// Mois sans données bancaires (avant `bankStart`, premier décaissement Revolut capté) : aucune
// dépense captée → barre charges = 0. Le tooltip n'étiquette alors PAS le résultat « marge nette »
// (charges Revolut non captées) — mention dégradée.

export interface ChargeSeries {
  months: { key: string; label: string }[];
  abo: number[];
  install: number[];
  charges: Record<ChargeCategory, number[]>;
  // Reversements hors exploitation (TVA, IS) par mois — purement visuels, hors marge.
  horsExploit?: { tva: number[]; is: number[] };
}

// Libellé court de chaque catégorie de charge — pour le détail intégral du tooltip (10 lignes).
export const CHARGE_META: { key: ChargeCategory; label: string }[] = [
  { key: "Rémunération", label: "Rémunération" },
  { key: "Loyer", label: "Loyer" },
  { key: "Électricité", label: "Électricité" },
  { key: "Charges sociales", label: "Charges sociales" },
  { key: "Assurance", label: "Assurance" },
  { key: "Comptable", label: "Comptable" },
  { key: "Abonnements & télécom", label: "Abonnements & télécom" },
  { key: "Fournisseurs", label: "Fournisseurs" },
  { key: "Notes de frais", label: "Notes de frais" },
  { key: "Autres", label: "Autres" },
];

// Segments AFFICHÉS dans la barre (bas → haut) : 5 charges structurantes + « Autres » qui absorbe
// les petites catégories pour la lisibilité. Partitionne exactement les 10 CHARGE_CATEGORIES (aucun
// chevauchement, aucune omise) → la hauteur de la barre reste égale au total des charges du mois.
// Les classes Tailwind sont en littéral ici pour être détectées par le scanner.
// Teintes choisies pour 6 hues nettement distinctes (anti-confusion amber/orange & violet/rose) :
// violet · vert émeraude · bleu ciel · rose · ambre · gris ardoise. Classes en littéral (scanner).
const BAR_SEGMENTS: { label: string; color: string; cats: ChargeCategory[] }[] = [
  { label: "Rémunération", color: "bg-violet-500", cats: ["Rémunération"] },
  { label: "Charges sociales", color: "bg-emerald-500", cats: ["Charges sociales"] },
  { label: "Loyer", color: "bg-sky-500", cats: ["Loyer"] },
  { label: "Électricité", color: "bg-rose-400", cats: ["Électricité"] },
  { label: "Fournisseurs", color: "bg-amber-400", cats: ["Fournisseurs"] },
  { label: "Autres", color: "bg-slate-400", cats: ["Assurance", "Comptable", "Abonnements & télécom", "Notes de frais", "Autres"] },
];
const segValue = (seg: { cats: ChargeCategory[] }, charges: Record<ChargeCategory, number[]>, i: number) =>
  seg.cats.reduce((s, c) => s + charges[c][i], 0);

// Segments HORS EXPLOITATION empilés au-dessus de la barre charges (teinte neutre + hachures) :
// reversements qui sortent du compte mais n'entrent pas dans la marge nette.
const HORS_SEGMENTS: { key: "tva" | "is"; label: string; color: string }[] = [
  { key: "tva", label: "TVA", color: "bg-slate-300" },
  { key: "is", label: "IS", color: "bg-slate-500" },
];
// Hachures diagonales blanches superposées à la teinte de base → rendu « hors exploitation ».
const HATCH_STYLE: CSSProperties = {
  backgroundImage: "repeating-linear-gradient(45deg, rgba(255,255,255,0.55) 0 2px, transparent 2px 5px)",
};

// Légende partagée (CA empilé + une pastille par catégorie de charge + hors exploitation).
// Réutilisée par Facturation et le Cockpit pour rester synchrone avec les couleurs de la pile.
export function ChargesLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-cyan" /> Abonnement</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-cyan/40" /> Installation</span>
      {BAR_SEGMENTS.map((m) => (
        <span key={m.label} className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm ${m.color}`} /> {m.label}
        </span>
      ))}
      <span className="mx-0.5 h-3 w-px bg-line" aria-hidden />
      <span className="text-[11px] italic text-ink-3">hors exploit.</span>
      {HORS_SEGMENTS.map((m) => (
        <span key={m.key} className="inline-flex items-center gap-1.5">
          <span className={`h-2.5 w-2.5 rounded-sm ${m.color}`} style={HATCH_STYLE} /> {m.label}
        </span>
      ))}
      <span className="inline-flex items-center gap-1.5">
        <span className="h-0 w-3.5 border-t-2 border-dashed border-navy/70" aria-hidden /> haut exploitation
      </span>
    </div>
  );
}

export function CaVsChargesChart({ data, bankStart }: { data: ChargeSeries; bankStart: string | null }) {
  const { active: sel, pinned, handlers, leave, close } = useChartSelection();
  const { months, abo, install, charges, horsExploit } = data;
  const n = months.length;

  const ca = months.map((_, i) => abo[i] + install[i]);
  const chargeTotal = months.map((_, i) => CHARGE_CATEGORIES.reduce((s, c) => s + charges[c][i], 0));
  // Total hors exploitation (TVA + IS) empilé au-dessus → la barre charges peut dépasser la barre
  // CA : on l'inclut dans le `max` pour que la pile complète tienne dans la hauteur.
  const horsTotal = months.map((_, i) => (horsExploit ? horsExploit.tva[i] + horsExploit.is[i] : 0));
  const max = Math.max(1, ...ca, ...months.map((_, i) => chargeTotal[i] + horsTotal[i]));
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
  const ariaLabel = `CA vs charges mensuels HT sur ${n} mois : CA total ${euro(sum(ca))}, charges d'exploitation totales ${euro(
    sum(chargeTotal)
  )} (dépenses Revolut hors TVA et IS) ; hors exploitation (TVA + IS) ${euro(sum(horsTotal))}, affiché à part et hors marge.`;
  // Résumé parlé par colonne (lecteur d'écran) : le détail visible au tooltip, accessible au focus.
  const ariaFor = (i: number) => {
    const degraded = bankStart == null || months[i].key < bankStart.slice(0, 7);
    const m = ca[i] - chargeTotal[i];
    return `${months[i].label} : CA HT ${euro(ca[i])}, charges d'exploitation ${euro(chargeTotal[i])}${
      degraded ? ", marge nette indisponible" : `, marge nette ${euro(m)}`
    }${horsTotal[i] > 0 ? `, hors exploitation ${euro(horsTotal[i])}` : ""}`;
  };

  return (
    <div className="relative mt-3" onMouseLeave={leave} role="group" aria-label={ariaLabel}>
      <div className="flex h-48 items-end gap-1 sm:gap-1.5">
        {months.map((m, i) => (
          <button
            key={m.key}
            type="button"
            {...handlers(i)}
            aria-label={ariaFor(i)}
            aria-pressed={pinned === i}
            className="relative flex h-full flex-1 cursor-pointer flex-col items-center justify-end rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
          >
            <div className={`absolute inset-x-0 bottom-5 top-0 rounded-md transition-colors ${sel === i ? "bg-cyan/[0.07]" : ""}`} />
            <div className="relative flex h-full w-full items-end justify-center gap-1 pb-5">
              <StackedBar
                segments={[
                  { value: abo[i], color: "bg-cyan" },
                  { value: install[i], color: "bg-cyan/40" },
                ]}
                max={max}
                idx={i}
                dim={sel !== null && sel !== i}
              />
              <StackedBar
                segments={[
                  ...BAR_SEGMENTS.map((seg) => ({ value: segValue(seg, charges, i), color: seg.color })),
                  ...horsSegments(horsExploit, i),
                ]}
                max={max}
                idx={i}
                dim={sel !== null && sel !== i}
                // Repère « haut des charges d'exploitation » (= seuil de la marge) quand des
                // reversements TVA/IS sont empilés au-dessus, pour ne pas suggérer une perte.
                marker={horsTotal[i] > 0 ? chargeTotal[i] / (chargeTotal[i] + horsTotal[i]) : null}
              />
            </div>
            {(n <= 14 || i % 2 === 0) && (
              <span className={`absolute bottom-0 truncate text-[9px] transition-colors ${sel === i ? "font-semibold text-ink" : "text-ink-3"}`}>{m.label}</span>
            )}
          </button>
        ))}
      </div>
      {sel !== null && (
        <ChargesTooltip
          index={sel}
          n={n}
          label={months[sel].label}
          monthKey={months[sel].key}
          abo={abo[sel]}
          install={install[sel]}
          charges={charges}
          tva={horsExploit?.tva[sel] ?? 0}
          is={horsExploit?.is[sel] ?? 0}
          bankStart={bankStart}
          pinned={pinned === sel}
          onClose={close}
        />
      )}
    </div>
  );
}

// Segments hors exploitation (TVA puis IS) pour la barre charges du mois `i` : teinte neutre +
// hachures. La frontière exploitation / hors exploitation est matérialisée par le `marker` de la
// barre (trait pointillé), pas par un bord de segment. Renvoie [] si aucun reversement ce mois-là.
function horsSegments(horsExploit: ChargeSeries["horsExploit"], i: number) {
  return HORS_SEGMENTS.map((s) => ({
    value: horsExploit?.[s.key]?.[i] ?? 0,
    color: s.color,
    hatch: true,
  }));
}

// Barre empilée générique (segments du bas vers le haut). Hauteur totale ∝ somme / max.
// `marker` (0..1) : trace un trait pointillé à cette fraction depuis le bas — utilisé pour marquer
// le haut des charges d'exploitation sous la pile TVA/IS (seuil de lecture de la marge).
function StackedBar({
  segments,
  max,
  idx,
  dim,
  marker,
}: {
  segments: { value: number; color: string; hatch?: boolean }[];
  max: number;
  idx: number;
  dim: boolean;
  marker?: number | null;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const h = Math.min(100, (total / max) * 100);
  return (
    <div
      className={`relative flex w-4 origin-bottom flex-col justify-end overflow-hidden rounded-t-sm transition-opacity duration-200 motion-safe:animate-[grow-up_0.5s_ease-out_both] sm:w-6 ${dim ? "opacity-40" : "opacity-100"}`}
      style={{ height: `${h}%`, animationDelay: `${idx * 20}ms` }}
    >
      {/* Rendu du haut vers le bas → on parcourt les segments en sens inverse. */}
      {segments
        .map((seg, i) => ({ ...seg, frac: total > 0 ? (seg.value / total) * 100 : 0, i }))
        .reverse()
        .map((seg) =>
          seg.value > 0 ? (
            <div
              key={seg.i}
              className={`w-full ${seg.color}`}
              style={{ height: `${seg.frac}%`, ...(seg.hatch ? HATCH_STYLE : {}) }}
            />
          ) : null
        )}
      {marker != null && total > 0 && (
        <div
          className="pointer-events-none absolute inset-x-0 border-t-2 border-dashed border-navy/70"
          style={{ bottom: `${Math.min(100, marker * 100)}%` }}
          aria-hidden
        />
      )}
    </div>
  );
}

function ChargesTooltip({
  index,
  n,
  label,
  monthKey,
  abo,
  install,
  charges,
  tva,
  is,
  bankStart,
  pinned,
  onClose,
}: {
  index: number;
  n: number;
  label: string;
  monthKey: string;
  abo: number;
  install: number;
  charges: Record<ChargeCategory, number[]>;
  tva: number;
  is: number;
  bankStart: string | null;
  pinned?: boolean;
  onClose?: () => void;
}) {
  const ca = abo + install;
  const chargeTotal = CHARGE_CATEGORIES.reduce((s, c) => s + charges[c][index], 0);
  // Données bancaires absentes pour ce mois (avant le 1er décaissement capté) → marge nette indisponible.
  const degraded = bankStart == null || monthKey < bankStart.slice(0, 7);
  const left = ((index + 0.5) / n) * 100;
  const alignRight = index > n * 0.66;
  // Lignes synchronisées avec la barre & la légende : un poste par segment affiché (6 max), même
  // couleur. « Autres » (catch-all composite) est détaillé en sous-lignes indentées pour signaler
  // ce qu'il regroupe (cf. CHARGE_META). Montants arrondis par apportionnement → Σ des postes ==
  // « Total charges » affiché (le tooltip « tombe juste »), et marge = CA − total (mêmes arrondis).
  const segRoundedAll = apportionEuros(BAR_SEGMENTS.map((seg) => segValue(seg, charges, index)), chargeTotal);
  const roundedChargeTotal = segRoundedAll.reduce((s, x) => s + x, 0); // == Math.round(chargeTotal)
  const roundedCa = Math.round(ca);
  const margeNette = roundedCa - roundedChargeTotal;
  const taux = roundedCa > 0 ? (margeNette / roundedCa) * 100 : null;
  const segRows = BAR_SEGMENTS.map((seg, k) => ({ seg, value: segRoundedAll[k] })).filter((r) => r.value > 0);
  const autresSeg = BAR_SEGMENTS[BAR_SEGMENTS.length - 1];
  const autresSubs = autresSeg.cats.filter((c) => c !== "Autres" && charges[c][index] > 0);
  const hasHors = tva > 0 || is > 0;
  return (
    <div
      className={`absolute top-0 z-10 w-56 -translate-x-1/2 rounded-card border border-line bg-white p-3 text-xs shadow-card-hover ${pinned ? "pointer-events-auto" : "pointer-events-none"}`}
      style={{ left: `${left}%`, ...(alignRight ? { transform: "translateX(-85%)" } : {}) }}
    >
      {pinned && onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Fermer le détail"
          className="absolute right-1.5 top-1.5 rounded p-0.5 text-ink-3 hover:bg-cloud hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
        >
          <IconX size={13} />
        </button>
      )}
      <div className="pr-4 font-semibold text-ink">{label}</div>
      <div className="mt-2">
        <TipRow label="CA HT" value={euro(roundedCa)} strong />
      </div>

      {/* Bloc 1 — Charges d'exploitation (→ entrent dans la marge nette) */}
      <div className="mt-2 border-t border-line pt-1.5">
        {degraded ? (
          <div className="text-[10px] leading-tight text-ink-3">Aucune dépense Revolut captée ce mois.</div>
        ) : (
          <>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">{"Charges d'exploitation"}</div>
            <div className="mt-1 space-y-1">
              {segRows.length === 0 ? (
                <TipRow label="Charges" value={euro(0)} />
              ) : (
                segRows.map(({ seg, value }) =>
                  seg.label === "Autres" ? (
                    <Fragment key={seg.label}>
                      <TipRow label="Autres" value={euro(value)} color={seg.color} />
                      {autresSubs.map((c) => (
                        <TipRow key={c} label={c} value={euro(charges[c][index])} sub />
                      ))}
                    </Fragment>
                  ) : (
                    <TipRow key={seg.label} label={seg.label} value={euro(value)} color={seg.color} />
                  )
                )
              )}
              <div className="border-t border-line pt-1">
                <TipRow label="Total charges" value={euro(roundedChargeTotal)} strong />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Marge nette = CA HT − charges d'exploitation */}
      {degraded ? (
        <div className="mt-2 border-t border-line pt-1.5 text-[10px] leading-tight text-ink-3">
          Charges Revolut non captées avant nov. 2024 — marge nette indisponible.
        </div>
      ) : (
        <div className="mt-2 border-t border-line pt-1.5">
          <TipRow label="Marge nette" value={euro(margeNette)} strong />
          <div className="mt-1 text-[10px] leading-tight text-ink-3">
            {taux !== null ? `Taux net ${taux.toFixed(0)} %` : "—"} · les charges d&apos;exploitation entrent dans la marge.
          </div>
        </div>
      )}

      {/* Bloc 2 — Hors exploitation : TVA, IS (n'entre PAS dans la marge) */}
      {!degraded && hasHors && (
        <div className="mt-2 border-t border-line pt-1.5">
          <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">{"Hors exploitation : TVA, IS"}</div>
          <div className="mt-1 space-y-1">
            {tva > 0 && <TipRow label="TVA reversée" value={euro(tva)} color="bg-slate-300" hatch />}
            {is > 0 && <TipRow label="Impôt sociétés (IS)" value={euro(is)} color="bg-slate-500" hatch />}
          </div>
          <div className="mt-1 text-[10px] leading-tight text-ink-3">{"N'entre pas dans la marge nette."}</div>
        </div>
      )}
    </div>
  );
}

function TipRow({
  label, value, strong, color, hatch, sub,
}: {
  label: string; value: string; strong?: boolean; color?: string; hatch?: boolean; sub?: boolean;
}) {
  return (
    <div className={`flex items-center gap-1.5 ${sub ? "pl-3.5" : ""}`}>
      {color && <span className={`h-2 w-2 flex-none rounded-sm ${color}`} style={hatch ? HATCH_STYLE : undefined} aria-hidden />}
      <span className={sub ? "text-[11px] text-ink-3" : "text-ink-2"}>{label}</span>
      <span className={`ml-auto ${strong ? "font-semibold text-ink" : "font-medium text-ink"}`}>{value}</span>
    </div>
  );
}
