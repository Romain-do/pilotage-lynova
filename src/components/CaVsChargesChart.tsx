"use client";

import { useState, type CSSProperties } from "react";
import { euro } from "@/lib/facturation";
import { CHARGE_CATEGORIES, type ChargeCategory } from "@/lib/tresorerie";

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
const BAR_SEGMENTS: { label: string; color: string; cats: ChargeCategory[] }[] = [
  { label: "Rémunération", color: "bg-violet-400", cats: ["Rémunération"] },
  { label: "Charges sociales", color: "bg-orange-300", cats: ["Charges sociales"] },
  { label: "Loyer", color: "bg-sky-400", cats: ["Loyer"] },
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
    </div>
  );
}

export function CaVsChargesChart({ data, bankStart }: { data: ChargeSeries; bankStart: string | null }) {
  const [hover, setHover] = useState<number | null>(null);
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

  return (
    <div className="relative mt-3" onMouseLeave={() => setHover(null)} role="img" aria-label={ariaLabel}>
      <div className="flex h-48 items-end gap-1 sm:gap-1.5">
        {months.map((m, i) => {
          const active = hover === null || hover === i;
          return (
            <div
              key={m.key}
              className="relative flex h-full flex-1 cursor-default flex-col items-center justify-end rounded-md"
              onMouseEnter={() => setHover(i)}
            >
              <div className={`absolute inset-x-0 bottom-5 top-0 rounded-md transition-colors ${hover === i ? "bg-cyan/[0.07]" : ""}`} />
              <div className="relative flex h-full w-full items-end justify-center gap-1 pb-5">
                <StackedBar
                  segments={[
                    { value: abo[i], color: "bg-cyan" },
                    { value: install[i], color: "bg-cyan/40" },
                  ]}
                  max={max}
                  idx={i}
                  dim={!active}
                />
                <StackedBar
                  segments={[
                    ...BAR_SEGMENTS.map((seg) => ({ value: segValue(seg, charges, i), color: seg.color })),
                    ...horsSegments(horsExploit, i),
                  ]}
                  max={max}
                  idx={i}
                  dim={!active}
                />
              </div>
              {(n <= 14 || i % 2 === 0) && (
                <span className={`absolute bottom-0 truncate text-[9px] transition-colors ${hover === i ? "font-semibold text-ink" : "text-ink-3"}`}>{m.label}</span>
              )}
            </div>
          );
        })}
      </div>
      {hover !== null && (
        <ChargesTooltip
          index={hover}
          n={n}
          label={months[hover].label}
          monthKey={months[hover].key}
          abo={abo[hover]}
          install={install[hover]}
          charges={charges}
          tva={horsExploit?.tva[hover] ?? 0}
          is={horsExploit?.is[hover] ?? 0}
          bankStart={bankStart}
        />
      )}
    </div>
  );
}

// Segments hors exploitation (TVA puis IS) pour la barre charges du mois `i` : teinte neutre +
// hachures, avec un trait de séparation sur le 1er segment non nul (frontière exploitation / hors
// exploitation). Renvoie [] si aucun reversement ce mois-là.
function horsSegments(horsExploit: ChargeSeries["horsExploit"], i: number) {
  const segs = HORS_SEGMENTS.map((s) => ({
    value: horsExploit?.[s.key]?.[i] ?? 0,
    color: s.color,
    hatch: true,
    divider: false,
  }));
  const firstNonZero = segs.find((s) => s.value > 0);
  if (firstNonZero) firstNonZero.divider = true;
  return segs;
}

// Barre empilée générique (segments du bas vers le haut). Hauteur totale ∝ somme / max.
function StackedBar({
  segments,
  max,
  idx,
  dim,
}: {
  segments: { value: number; color: string; hatch?: boolean; divider?: boolean }[];
  max: number;
  idx: number;
  dim: boolean;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const h = Math.min(100, (total / max) * 100);
  return (
    <div
      className={`flex w-4 origin-bottom flex-col justify-end overflow-hidden rounded-t-sm transition-opacity duration-200 motion-safe:animate-[grow-up_0.5s_ease-out_both] sm:w-6 ${dim ? "opacity-40" : "opacity-100"}`}
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
              className={`w-full ${seg.color} ${seg.divider ? "border-t border-white/80" : ""}`}
              style={{ height: `${seg.frac}%`, ...(seg.hatch ? HATCH_STYLE : {}) }}
            />
          ) : null
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
}) {
  const ca = abo + install;
  const chargeTotal = CHARGE_CATEGORIES.reduce((s, c) => s + charges[c][index], 0);
  // Données bancaires absentes pour ce mois (avant le 1er décaissement capté) → marge nette indisponible.
  const degraded = bankStart == null || monthKey < bankStart.slice(0, 7);
  const margeNette = ca - chargeTotal;
  const taux = ca > 0 ? (margeNette / ca) * 100 : null;
  const left = ((index + 0.5) / n) * 100;
  const alignRight = index > n * 0.66;
  // Lignes de charge non nulles (catégories présentes ce mois-là).
  const rows = CHARGE_META.filter((m) => charges[m.key][index] > 0);
  const hasHors = tva > 0 || is > 0;
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 w-56 -translate-x-1/2 rounded-card border border-line bg-white p-3 text-xs shadow-card-hover"
      style={{ left: `${left}%`, ...(alignRight ? { transform: "translateX(-85%)" } : {}) }}
    >
      <div className="font-semibold text-ink">{label}</div>
      <div className="mt-2">
        <TipRow label="CA HT" value={euro(ca)} strong />
      </div>

      {/* Bloc 1 — Charges d'exploitation (→ entrent dans la marge nette) */}
      <div className="mt-2 border-t border-line pt-1.5">
        {degraded ? (
          <div className="text-[10px] leading-tight text-ink-3">Aucune dépense Revolut captée ce mois.</div>
        ) : (
          <>
            <div className="text-[10px] font-semibold uppercase tracking-wide text-ink-3">{"Charges d'exploitation"}</div>
            <div className="mt-1 space-y-1">
              {rows.length === 0 ? (
                <TipRow label="Charges" value={euro(0)} />
              ) : (
                rows.map((m) => <TipRow key={m.key} label={m.label} value={euro(charges[m.key][index])} />)
              )}
              <div className="border-t border-line pt-1">
                <TipRow label="Total charges" value={euro(chargeTotal)} strong />
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
            {tva > 0 && <TipRow label="TVA reversée" value={euro(tva)} />}
            {is > 0 && <TipRow label="Impôt sociétés (IS)" value={euro(is)} />}
          </div>
          <div className="mt-1 text-[10px] leading-tight text-ink-3">{"N'entre pas dans la marge nette."}</div>
        </div>
      )}
    </div>
  );
}

function TipRow({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-ink-2">{label}</span>
      <span className={`ml-auto ${strong ? "font-semibold text-ink" : "font-medium text-ink"}`}>{value}</span>
    </div>
  );
}
