"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { IconX } from "@tabler/icons-react";
import { euro, apportionEuros, pct1 } from "@/lib/facturation";
import { CHARGE_CATEGORIES, type ChargeCategory } from "@/lib/tresorerie";

// Graphe « CA vs charges — mensuel HT ». Par mois : barre CA empilée (abonnement + installation)
// vs barre CHARGES = 3 blocs : « Charges » (TOUTES les charges d'exploitation agrégées, 1 couleur
// unie) + « TVA » + « IS » (hachurés, hors exploitation, empilés au-dessus). Marge nette = CA HT −
// bloc Charges, d'où l'identité CA − Charges = marge du mois (TVA/IS purement visuels, hors marge).
//
// Survol/focus → tooltip LÉGER (CA, Charges, Marge). Clic/tap/Entrée → volet latéral droit avec le
// détail des charges par catégorie (ordre décroissant €), puis TVA/IS, puis marge nette.
//
// Mois sans données bancaires (avant `bankStart`, premier décaissement Revolut capté) : aucune
// dépense captée → barre charges = 0, marge nette non étiquetée (mention dégradée).

export interface ChargeSeries {
  months: { key: string; label: string }[];
  abo: number[];
  install: number[];
  charges: Record<ChargeCategory, number[]>;
  // Reversements hors exploitation (TVA, IS) par mois — purement visuels, hors marge.
  horsExploit?: { tva: number[]; is: number[] };
}

// Libellé court de chaque catégorie de charge — pour le détail du volet (ventilation complète).
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

// Bloc unique « Charges d'exploitation » de la barre (1 couleur unie). Teal foncé (#0E7490) :
// même famille que le cyan de marque du CA mais nettement plus sombre → distinct par la
// luminosité (CA pâle vs Charges foncé), et distinct du slate hachuré neutre (TVA/IS).
// Référencé par la barre, la légende, le tooltip léger et le volet (1 source de vérité).
const CHARGES_COLOR = "bg-cyan-700";

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

const chargeTotalOf = (charges: Record<ChargeCategory, number[]>, i: number) =>
  CHARGE_CATEGORIES.reduce((s, c) => s + charges[c][i], 0);

// Légende réduite : CA (abo/install) + Charges (bloc unique) + hors exploitation (TVA/IS hachurés).
// Réutilisée par Facturation et le Cockpit pour rester synchrone avec les couleurs de la pile.
export function ChargesLegend() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-ink-2">
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-cyan" /> Abonnement</span>
      <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-cyan/40" /> Installation</span>
      <span className="inline-flex items-center gap-1.5"><span className={`h-2.5 w-2.5 rounded-sm ${CHARGES_COLOR}`} /> Charges</span>
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
  const { months, abo, install, charges, horsExploit } = data;
  const n = months.length;
  // Survol/focus → tooltip léger ; clic → volet détaillé (mois ouvert).
  const [hover, setHover] = useState<number | null>(null);
  const [openMonth, setOpenMonth] = useState<number | null>(null);

  const ca = months.map((_, i) => abo[i] + install[i]);
  const chargeTotal = months.map((_, i) => chargeTotalOf(charges, i));
  // Total hors exploitation (TVA + IS) empilé au-dessus → la barre charges peut dépasser la barre
  // CA : on l'inclut dans le `max` pour que la pile complète tienne dans la hauteur.
  const horsTotal = months.map((_, i) => (horsExploit ? horsExploit.tva[i] + horsExploit.is[i] : 0));
  const max = Math.max(1, ...ca, ...months.map((_, i) => chargeTotal[i] + horsTotal[i]));
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);
  const ariaLabel = `CA vs charges mensuels HT sur ${n} mois : CA total ${euro(sum(ca))}, charges d'exploitation totales ${euro(
    sum(chargeTotal)
  )} (dépenses Revolut hors TVA et IS) ; hors exploitation (TVA + IS) ${euro(sum(horsTotal))}, affiché à part et hors marge.`;
  // Résumé parlé par colonne (lecteur d'écran). Le clic ouvre le volet détaillé.
  const ariaFor = (i: number) => {
    const degraded = bankStart == null || months[i].key < bankStart.slice(0, 7);
    const m = ca[i] - chargeTotal[i];
    return `${months[i].label} : CA HT ${euro(ca[i])}, charges d'exploitation ${euro(chargeTotal[i])}${
      degraded ? ", marge nette indisponible" : `, marge nette ${euro(m)}`
    }${horsTotal[i] > 0 ? `, hors exploitation ${euro(horsTotal[i])}` : ""}. Ouvrir le détail.`;
  };

  return (
    <div className="relative mt-3" onMouseLeave={() => setHover(null)} role="group" aria-label={ariaLabel}>
      <div className="flex h-48 items-end gap-1 sm:gap-1.5">
        {months.map((m, i) => (
          <button
            key={m.key}
            type="button"
            onMouseEnter={() => setHover(i)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover((h) => (h === i ? null : h))}
            onClick={() => setOpenMonth(i)}
            aria-label={ariaFor(i)}
            aria-haspopup="dialog"
            className="relative flex h-full min-w-0 flex-1 cursor-pointer flex-col items-center justify-end rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
          >
            <div className={`absolute inset-x-0 bottom-5 top-0 rounded-md transition-colors ${hover === i ? "bg-cyan/[0.07]" : ""}`} />
            <div className="relative flex h-full w-full items-end justify-center gap-0.5 pb-5 sm:gap-1">
              <StackedBar
                segments={[
                  { value: abo[i], color: "bg-cyan" },
                  { value: install[i], color: "bg-cyan/40" },
                ]}
                max={max}
                idx={i}
                dim={hover !== null && hover !== i}
              />
              <StackedBar
                segments={[
                  { value: chargeTotal[i], color: CHARGES_COLOR },
                  ...horsSegments(horsExploit, i),
                ]}
                max={max}
                idx={i}
                dim={hover !== null && hover !== i}
              />
            </div>
            {(n <= 14 || i % 2 === 0) && (
              <span className={`absolute bottom-0 truncate text-[9px] transition-colors ${hover === i ? "font-semibold text-ink" : "text-ink-3"}`}>{m.label}</span>
            )}
          </button>
        ))}
      </div>

      {/* Tooltip LÉGER (survol/focus) — détail complet au clic, dans le volet */}
      {hover !== null && openMonth === null && (
        <LightTooltip
          index={hover}
          n={n}
          label={months[hover].label}
          monthKey={months[hover].key}
          ca={ca[hover]}
          chargeTotal={chargeTotal[hover]}
          tva={horsExploit?.tva[hover] ?? 0}
          is={horsExploit?.is[hover] ?? 0}
          bankStart={bankStart}
        />
      )}

      {/* Volet latéral droit (clic) — ventilation détaillée du mois */}
      {openMonth !== null && (
        <MonthDrawer
          index={openMonth}
          label={months[openMonth].label}
          monthKey={months[openMonth].key}
          ca={ca[openMonth]}
          charges={charges}
          tva={horsExploit?.tva[openMonth] ?? 0}
          is={horsExploit?.is[openMonth] ?? 0}
          bankStart={bankStart}
          onClose={() => setOpenMonth(null)}
        />
      )}
    </div>
  );
}

// Segments hors exploitation (TVA puis IS) pour la barre charges du mois `i` : teinte neutre +
// hachures. Renvoie des segments à 0 si aucun reversement ce mois-là (non rendus).
function horsSegments(horsExploit: ChargeSeries["horsExploit"], i: number) {
  return HORS_SEGMENTS.map((s) => ({
    value: horsExploit?.[s.key]?.[i] ?? 0,
    color: s.color,
    hatch: true,
  }));
}

// Barre empilée générique (segments du bas vers le haut). Hauteur totale ∝ somme / max.
function StackedBar({
  segments,
  max,
  idx,
  dim,
}: {
  segments: { value: number; color: string; hatch?: boolean }[];
  max: number;
  idx: number;
  dim: boolean;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0);
  const h = Math.min(100, (total / max) * 100);
  return (
    <div
      className={`flex w-2.5 origin-bottom flex-col justify-end overflow-hidden rounded-t-sm transition-opacity duration-200 motion-safe:animate-[grow-up_0.5s_ease-out_both] sm:w-6 ${dim ? "opacity-40" : "opacity-100"}`}
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
    </div>
  );
}

// Tooltip léger au survol/focus : CA, Charges, Marge nette (ou mention dégradée). Pas de détail.
function LightTooltip({
  index, n, label, monthKey, ca, chargeTotal, tva, is, bankStart,
}: {
  index: number; n: number; label: string; monthKey: string; ca: number; chargeTotal: number; tva: number; is: number; bankStart: string | null;
}) {
  const degraded = bankStart == null || monthKey < bankStart.slice(0, 7);
  const roundedCa = Math.round(ca);
  const roundedCharges = Math.round(chargeTotal);
  const marge = roundedCa - roundedCharges;
  const hasHors = !degraded && (tva > 0 || is > 0);
  const left = ((index + 0.5) / n) * 100;
  const alignRight = index > n * 0.66;
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 w-44 -translate-x-1/2 rounded-card border border-line bg-white p-2.5 text-xs shadow-card-hover"
      style={{ left: `${left}%`, ...(alignRight ? { transform: "translateX(-85%)" } : {}) }}
    >
      <div className="font-semibold text-ink">{label}</div>
      <div className="mt-1.5 space-y-1">
        <TipRow label="CA HT" value={euro(roundedCa)} />
        {degraded ? (
          <div className="text-[10px] leading-tight text-ink-3">Charges non captées avant nov. 2024.</div>
        ) : (
          <>
            <TipRow label="Charges" value={euro(roundedCharges)} color={CHARGES_COLOR} />
            <div className="border-t border-line pt-1"><TipRow label="Marge nette" value={euro(marge)} strong /></div>
          </>
        )}
      </div>
      {/* Hors exploitation (TVA/IS) — affiché seulement si > 0 ; n'entre pas dans la marge. */}
      {hasHors && (
        <div className="mt-1.5 border-t border-line pt-1.5">
          <div className="text-[10px] uppercase tracking-wide text-ink-3">Hors exploitation</div>
          <div className="mt-1 space-y-1">
            {tva > 0 && <TipRow label="TVA" value={euro(Math.round(tva))} color="bg-slate-300" hatch />}
            {is > 0 && <TipRow label="IS" value={euro(Math.round(is))} color="bg-slate-500" hatch />}
          </div>
          <div className="mt-0.5 text-[10px] italic leading-tight text-ink-3">N&apos;entre pas dans la marge.</div>
        </div>
      )}
      <div className="mt-1.5 text-[10px] italic text-ink-3">Cliquez pour le détail →</div>
    </div>
  );
}

// Volet latéral droit : ventilation des charges du mois par catégorie (ordre décroissant €),
// puis hors exploitation (TVA/IS), puis marge nette. Fermable (×, fond, Échap), focus au montage.
function MonthDrawer({
  index, label, monthKey, ca, charges, tva, is, bankStart, onClose,
}: {
  index: number; label: string; monthKey: string; ca: number;
  charges: Record<ChargeCategory, number[]>; tva: number; is: number; bankStart: string | null; onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const degraded = bankStart == null || monthKey < bankStart.slice(0, 7);
  const catRaw = CHARGE_META.map((m) => charges[m.key][index]);
  const chargeTotalRaw = catRaw.reduce((s, x) => s + x, 0);
  // Montants arrondis par apportionnement → la liste « tombe juste » (Σ == total affiché).
  const apportioned = apportionEuros(catRaw, chargeTotalRaw);
  const rows = CHARGE_META.map((m, k) => ({ label: m.label, value: apportioned[k], raw: catRaw[k] }))
    .filter((r) => r.raw > 0)
    .sort((a, b) => b.raw - a.raw);
  const roundedChargeTotal = apportioned.reduce((s, x) => s + x, 0);
  const roundedCa = Math.round(ca);
  const marge = roundedCa - roundedChargeTotal;
  const taux = roundedCa > 0 ? (marge / roundedCa) * 100 : null;
  const maxRaw = Math.max(1, ...rows.map((r) => r.raw));
  const hasHors = tva > 0 || is > 0;

  return (
    <div className="fixed inset-0 z-40 flex justify-end">
      <div className="absolute inset-0 bg-navy/30" onClick={onClose} aria-hidden />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Détail du mois ${label}`}
        className="relative z-10 flex h-full w-full max-w-md flex-col bg-cloud shadow-xl motion-safe:animate-[fade-in_0.2s_ease-out]"
      >
        <div className="flex items-center justify-between border-b border-line bg-white px-5 py-4">
          <div>
            <h2 className="text-sm font-semibold text-ink">{label}</h2>
            <p className="text-xs text-ink-3">Détail du mois · CA vs charges</p>
          </div>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            aria-label="Fermer le détail"
            className="rounded-md p-1.5 text-ink-3 hover:bg-cloud hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
          >
            <IconX size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5">
          {/* CA HT */}
          <div className="flex items-center justify-between rounded-card border border-line bg-white px-3.5 py-2.5">
            <span className="text-xs font-medium uppercase tracking-wide text-ink-3">CA HT</span>
            <span className="text-base font-semibold text-ink">{euro(roundedCa)}</span>
          </div>

          {/* Charges d'exploitation par catégorie (décroissant) */}
          <div className="mt-4">
            <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Charges d&apos;exploitation</h3>
            {degraded ? (
              <p className="mt-2 text-sm text-ink-3">Aucune dépense Revolut captée ce mois (avant nov. 2024).</p>
            ) : rows.length === 0 ? (
              <p className="mt-2 text-sm text-ink-3">Aucune charge ce mois.</p>
            ) : (
              <div className="mt-2 space-y-2">
                {rows.map((r) => {
                  const pct = chargeTotalRaw > 0 ? (r.raw / chargeTotalRaw) * 100 : 0;
                  return (
                    <div key={r.label}>
                      <div className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="truncate text-ink-2">{r.label}</span>
                        <span className="flex-none font-medium text-ink">{euro(r.value)} <span className="font-normal text-ink-3">· {pct1(pct)} %</span></span>
                      </div>
                      <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-cloud">
                        <div className={`h-full rounded-full ${CHARGES_COLOR} transition-all duration-500`} style={{ width: `${Math.max(2, (r.raw / maxRaw) * 100)}%` }} />
                      </div>
                    </div>
                  );
                })}
                <div className="flex items-center justify-between border-t border-line pt-2 text-sm">
                  <span className="font-medium text-ink-2">Total charges</span>
                  <span className="font-semibold text-ink">{euro(roundedChargeTotal)}</span>
                </div>
              </div>
            )}
          </div>

          {/* Hors exploitation : TVA, IS */}
          {hasHors && (
            <div className="mt-4">
              <h3 className="text-xs font-semibold uppercase tracking-wide text-ink-3">Hors exploitation</h3>
              <div className="mt-2 space-y-1.5 text-sm">
                {tva > 0 && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-ink-2"><span className="h-2.5 w-2.5 rounded-sm bg-slate-300" style={HATCH_STYLE} aria-hidden /> TVA reversée</span>
                    <span className="font-medium text-ink">{euro(Math.round(tva))}</span>
                  </div>
                )}
                {is > 0 && (
                  <div className="flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-ink-2"><span className="h-2.5 w-2.5 rounded-sm bg-slate-500" style={HATCH_STYLE} aria-hidden /> Impôt sociétés (IS)</span>
                    <span className="font-medium text-ink">{euro(Math.round(is))}</span>
                  </div>
                )}
              </div>
              <p className="mt-1.5 text-[11px] italic leading-tight text-ink-3">N&apos;entre pas dans la marge nette.</p>
            </div>
          )}

          {/* Marge nette */}
          <div className="mt-4 rounded-card border border-line bg-white px-3.5 py-2.5">
            {degraded ? (
              <p className="text-xs leading-tight text-ink-3">Charges Revolut non captées avant nov. 2024 — marge nette indisponible.</p>
            ) : (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium uppercase tracking-wide text-ink-3">Marge nette</span>
                  <span className="text-base font-semibold text-ink">{euro(marge)}</span>
                </div>
                <p className="mt-1 text-[11px] text-ink-3">{taux !== null ? `Taux net ${pct1(taux)} %` : "—"} · CA HT − charges d&apos;exploitation.</p>
              </>
            )}
          </div>
        </div>
      </aside>
    </div>
  );
}

function TipRow({ label, value, strong, color, hatch }: { label: string; value: string; strong?: boolean; color?: string; hatch?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      {color && <span className={`h-2 w-2 flex-none rounded-sm ${color}`} style={hatch ? HATCH_STYLE : undefined} aria-hidden />}
      <span className="text-ink-2">{label}</span>
      <span className={`ml-auto ${strong ? "font-semibold text-ink" : "font-medium text-ink"}`}>{value}</span>
    </div>
  );
}
