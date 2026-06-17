"use client";

import { useState } from "react";
import { IconReportMoney, IconArrowUpRight, IconArrowDownRight, IconAlertTriangle, IconX } from "@tabler/icons-react";
import { euro, pct1, apportionEuros } from "@/lib/facturation";
import { CHARGE_META } from "@/components/CaVsChargesChart";
import { InfoTip } from "@/components/InfoTip";
import type { RevolutCharges } from "@/lib/tresorerie";

// Carte « Marge nette (approchée) » — PARTAGÉE Cockpit + Facturation (rendu identique).
// Fusionne marge nette ET taux de marge nette dans une seule carte :
//   • valeur principale = marge nette en € + delta Vs N-1 (en %) ;
//   • indicateur secondaire = taux de marge nette (%) + delta Vs N-1 (en pts).
// Polarité « plus haut = mieux » pour les deux → vert si ≥ 0, rouge sinon.
// Mention « CA HT − charges TTC (approché) · depuis nov. 2024 » + détail (ventilation CA HT −
// charges par catégorie : survol souris `group-hover` / toggle tactile-clavier `open`).
// Sans données bancaires (`hasBank` false) : « n/a ».
export function MargeNetteCard({
  hasBank,
  value,
  valuePrev,
  delta,
  caHtTotal,
  net,
  taux,
  tauxDeltaPts,
  staleNote,
}: {
  hasBank: boolean;
  value: number;
  valuePrev: number;
  delta: number | null;
  caHtTotal: number;
  net: RevolutCharges;
  taux: number | null;
  tauxDeltaPts: number | null;
  staleNote?: string;
}) {
  // Delta € vs N-1 (le delta % est fourni par `delta`, déjà garde-fou hasBank/hasBankPrev).
  const dEur = value - valuePrev;
  // Détail accessible souris (group-hover), tactile & clavier (toggle `open` + ×).
  const [open, setOpen] = useState(false);
  // Ventilation arrondie par apportionnement → CA HT − Σ postes == marge nette affichée (tombe juste).
  const detailCats = CHARGE_META.filter((m) => net.byCategory[m.key] > 0);
  const detailRounded = apportionEuros(detailCats.map((m) => net.byCategory[m.key]), Math.round(caHtTotal) - Math.round(value));
  return (
    <div className="group relative rounded-card border border-line bg-white p-3.5 shadow-card transition-all duration-200 motion-safe:hover:-translate-y-px hover:shadow-card-hover">
      <div className="flex items-center gap-2">
        <span className="flex h-8 w-8 flex-none items-center justify-center rounded-[10px] bg-violet-50 text-violet-600">
          <IconReportMoney size={18} stroke={2} />
        </span>
        <span className="min-w-0 truncate text-xs font-medium uppercase tracking-wide text-ink-3">Marge nette (approchée)</span>
        <span className="flex-none">
          <InfoTip label="Détail : Marge nette (approchée)">
            <span className="block">Marge nette ≈ CA HT − charges d&apos;exploitation : dépenses Revolut en TTC (décaissements réellement sortis), hors TVA &amp; IS, URSSAF incluse.</span>
            <span className="mt-1 block">Taux net = marge nette ÷ CA HT. Données bancaires depuis nov. 2024.</span>
            <span className="mt-1 block text-ink-3">Ventilation complète via « Détail » ci-dessous.</span>
          </InfoTip>
        </span>
      </div>
      {hasBank ? (
        <>
          <div className="mt-2.5 text-2xl font-semibold leading-none text-ink">{euro(value)}</div>
          <div className="mt-1.5 min-h-4 space-y-1 text-xs">
            {delta == null ? (
              <span className="text-ink-3">Vs N-1 : —</span>
            ) : (
              <>
                <span className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 font-semibold ${delta >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                    {delta >= 0 ? <IconArrowUpRight size={12} stroke={2.5} /> : <IconArrowDownRight size={12} stroke={2.5} />}
                    {pct1(Math.abs(delta))} %
                  </span>
                  <span className="font-medium text-ink-2">{dEur >= 0 ? "+" : "−"}{euro(Math.abs(dEur))}</span>
                </span>
                <div className="font-medium text-n1-text">N-1 {euro(valuePrev)}</div>
              </>
            )}
          </div>

          {/* Indicateur secondaire : taux de marge nette + delta en pts (plus haut = mieux). */}
          <div className="mt-2 flex items-center justify-between gap-2 border-t border-line pt-2">
            <span className="text-[11px] font-medium uppercase tracking-wide text-ink-3">Taux net</span>
            <span className="inline-flex items-center gap-1.5">
              <span className="text-sm font-semibold text-ink">{taux != null ? `${pct1(taux)} %` : "—"}</span>
              {tauxDeltaPts != null && (
                <span className={`inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-xs font-semibold ${tauxDeltaPts >= 0 ? "bg-emerald-50 text-emerald-700" : "bg-red-50 text-red-700"}`}>
                  {tauxDeltaPts >= 0 ? <IconArrowUpRight size={12} stroke={2.5} /> : <IconArrowDownRight size={12} stroke={2.5} />}
                  {pct1(Math.abs(tauxDeltaPts))} pts
                </span>
              )}
            </span>
          </div>

          {staleNote && (
            <div className="mt-1.5 inline-flex items-center gap-1 rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-700">
              <IconAlertTriangle size={11} stroke={2.5} /> {staleNote}
            </div>
          )}
          <div className="mt-1.5 flex items-baseline justify-between gap-2">
            <p className="text-[10px] italic leading-tight text-ink-3">CA HT − charges TTC (approché) · depuis nov. 2024</p>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-expanded={open}
              aria-controls="marge-nette-detail"
              className="flex-none rounded text-[10px] font-medium text-cyan-600 hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
            >
              {open ? "Masquer" : "Détail"}
            </button>
          </div>
          {/* Détail : survol souris (group-hover) + ouverture tactile/clavier (open) */}
          <div
            id="marge-nette-detail"
            className={`absolute left-1/2 top-full z-20 mt-1 max-h-80 w-64 -translate-x-1/2 overflow-auto rounded-card border border-line bg-white p-3 text-xs shadow-card-hover group-hover:block ${open ? "pointer-events-auto block" : "pointer-events-none hidden"}`}
          >
            {open && (
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Fermer le détail"
                className="absolute right-1.5 top-1.5 rounded p-0.5 text-ink-3 hover:bg-cloud hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
              >
                <IconX size={13} />
              </button>
            )}
            <div className="pr-4 font-semibold text-ink">Marge nette = CA HT − charges d&apos;exploitation (TTC)</div>
            <div className="mt-2 space-y-1">
              <TipRow label="CA HT" value={euro(Math.round(caHtTotal))} />
              <div className="my-1 border-t border-line" />
              {detailCats.map((m, k) => (
                <TipRow key={m.key} label={`− ${m.label}`} value={euro(-detailRounded[k])} />
              ))}
              <div className="mt-1 border-t border-line pt-1"><TipRow label="= Marge nette" value={euro(value)} strong /></div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="mt-2.5 text-2xl font-semibold leading-none text-ink-3">n/a</div>
          <p className="mt-1.5 min-h-4 text-xs leading-tight text-ink-3">pas de données bancaires avant nov. 2024</p>
        </>
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
