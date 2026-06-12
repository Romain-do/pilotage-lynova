"use client";

import { useState } from "react";
import { euro } from "@/lib/facturation";
import { CHARGE_CATEGORIES, type ChargeCategory } from "@/lib/tresorerie";

// Graphe « CA vs charges — mensuel HT ». Par mois : barre CA empilée (abonnement + installation)
// vs barre CHARGES empilée = ventilation des dépenses Revolut (hors deny-list TVA/IS), une couleur
// par catégorie + « Autres » pour le non-nommé. Marge nette = CA HT − charges Revolut, d'où
// l'identité CA − charges = marge nette du mois.
//
// Mois sans données bancaires (avant `bankStart`, premier décaissement Revolut capté) : aucune
// dépense captée → barre charges = 0. Le tooltip n'étiquette alors PAS le résultat « marge nette »
// (charges Revolut non captées) — mention dégradée.

export interface ChargeSeries {
  months: { key: string; label: string }[];
  abo: number[];
  install: number[];
  charges: Record<ChargeCategory, number[]>;
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

// Légende partagée (CA empilé + une pastille par catégorie de charge). Réutilisée par Facturation
// et le Cockpit pour rester synchrone avec les couleurs de la pile.
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
    </div>
  );
}

export function CaVsChargesChart({ data, bankStart }: { data: ChargeSeries; bankStart: string | null }) {
  const [hover, setHover] = useState<number | null>(null);
  const { months, abo, install, charges } = data;
  const n = months.length;

  const ca = months.map((_, i) => abo[i] + install[i]);
  const chargeTotal = months.map((_, i) => CHARGE_CATEGORIES.reduce((s, c) => s + charges[c][i], 0));
  const max = Math.max(1, ...ca, ...chargeTotal);
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
  const ariaLabel = `CA vs charges mensuels HT sur ${n} mois : CA total ${euro(sum(ca))}, charges totales ${euro(
    sum(chargeTotal)
  )} (ventilation des dépenses Revolut hors TVA et IS).`;

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
                  segments={BAR_SEGMENTS.map((seg) => ({ value: segValue(seg, charges, i), color: seg.color }))}
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
          bankStart={bankStart}
        />
      )}
    </div>
  );
}

// Barre empilée générique (segments du bas vers le haut). Hauteur totale ∝ somme / max.
function StackedBar({
  segments,
  max,
  idx,
  dim,
}: {
  segments: { value: number; color: string }[];
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
          seg.value > 0 ? <div key={seg.i} className={`w-full ${seg.color}`} style={{ height: `${seg.frac}%` }} /> : null
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
  bankStart,
}: {
  index: number;
  n: number;
  label: string;
  monthKey: string;
  abo: number;
  install: number;
  charges: Record<ChargeCategory, number[]>;
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
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 w-52 -translate-x-1/2 rounded-card border border-line bg-white p-3 text-xs shadow-card-hover"
      style={{ left: `${left}%`, ...(alignRight ? { transform: "translateX(-85%)" } : {}) }}
    >
      <div className="font-semibold text-ink">{label}</div>
      <div className="mt-2 space-y-1">
        <TipRow label="CA HT" value={euro(ca)} strong />
        <div className="border-t border-line pt-1" />
        {degraded ? (
          <div className="text-[10px] leading-tight text-ink-3">Aucune dépense Revolut captée ce mois.</div>
        ) : rows.length === 0 ? (
          <TipRow label="Charges" value={euro(0)} />
        ) : (
          rows.map((m) => <TipRow key={m.key} label={m.label} value={euro(charges[m.key][index])} />)
        )}
        {!degraded && (
          <div className="border-t border-line pt-1">
            <TipRow label="Charges" value={euro(chargeTotal)} strong />
          </div>
        )}
      </div>
      {degraded ? (
        <div className="mt-2 border-t border-line pt-1.5 text-[10px] leading-tight text-ink-3">
          Charges Revolut non captées avant nov. 2024 — marge nette indisponible.
        </div>
      ) : (
        <div className="mt-2 border-t border-line pt-1.5">
          <TipRow label="Marge nette" value={euro(margeNette)} strong />
          <div className="mt-1 text-ink-3">{taux !== null ? `Taux net ${taux.toFixed(0)} %` : "—"}</div>
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
