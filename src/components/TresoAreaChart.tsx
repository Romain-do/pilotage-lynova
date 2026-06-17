"use client";

import { IconX } from "@tabler/icons-react";
import { euro } from "@/lib/facturation";
import { useChartSelection } from "@/components/useChartSelection";

// Graphe « Évolution de la trésorerie » (aire lissée du solde EUR fin de mois).
// Extrait de la vue Trésorerie pour être réutilisé tel quel au Cockpit (pas de duplication).
// Les helpers niceCeil / kEuro / Line et le type SeriePoint sont exportés car la vue Trésorerie
// les partage avec son graphe « Flux nets mensuels ».

// `missing` (compare/N-1 seulement) : pas de donnée ce mois → la courbe N-1 est INTERROMPUE
// (pas de chute artificielle à 0). Jamais positionné sur la série courante.
export type SeriePoint = { key: string; label: string; inflow: number; outflow: number; endBalance: number; missing?: boolean };

// Arrondi « joli » vers le haut pour caler les repères d'axe.
export function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const exp = Math.floor(Math.log10(v));
  const base = 10 ** exp;
  const f = v / base;
  const nf = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return nf * base;
}
// Montant abrégé pour les axes : « 30 k€ », « 450 € ».
export function kEuro(v: number): string {
  const a = Math.abs(v);
  if (a >= 1000) return `${(v / 1000).toLocaleString("fr-FR", { maximumFractionDigits: a >= 10000 ? 0 : 1 })} k€`;
  return `${Math.round(v)} €`;
}
// Lissage Catmull-Rom → cubique de Bézier (coords en repère 0..100).
function smoothPath(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return "";
  if (pts.length === 1) return `M ${pts[0].x} ${pts[0].y}`;
  let d = `M ${pts[0].x.toFixed(2)} ${pts[0].y.toFixed(2)}`;
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[i + 2] ?? p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(2)} ${c1y.toFixed(2)}, ${c2x.toFixed(2)} ${c2y.toFixed(2)}, ${p2.x.toFixed(2)} ${p2.y.toFixed(2)}`;
  }
  return d;
}

// `title` (aria) + `valueLabel` (libellé de la ligne tooltip) sont paramétrables pour réutiliser le
// graphe sur d'autres séries (ex. « Évolution du MRR ») — défauts = trésorerie, usage inchangé.
// `deltaInTooltip` ajoute la variation nette vs le mois précédent (MRR_m − MRR_{m-1}), colorée.
// `compare` (optionnel) : 2ᵉ série N-1, alignée INDEX PAR INDEX sur `series` (même position fiscale),
// tracée en ligne pointillée AMBRÉE (token --color-n1), sans aire ; `missing` interrompt la courbe.
// `projection` (optionnel) : prolonge la courbe après le dernier point réel (1 point/mois), tracé en
// pointillé CYAN à opacité réduite (jamais ambré : le jaune est réservé au N-1).
// Les légendes + lignes de tooltip n'apparaissent que si les séries correspondantes existent.
export function TresoAreaChart({
  series,
  compare,
  projection,
  title = "Évolution de la trésorerie",
  valueLabel = "Solde fin",
  deltaInTooltip = false,
}: {
  series: SeriePoint[];
  compare?: SeriePoint[];
  // Projection en FOURCHETTE : `low` = quasi certaine (borne basse), `high` = potentielle (borne haute).
  projection?: { label: string; low: number; high: number }[];
  title?: string;
  valueLabel?: string;
  deltaInTooltip?: boolean;
}) {
  const { active: sel, pinned, handlers, leave, close } = useChartSelection();
  const n = series.length;
  if (n === 0) return <p className="mt-6 text-center text-sm text-ink-3">Aucune donnée sur la période.</p>;

  const proj = projection ?? [];
  const p = proj.length;
  const N = n + p; // timeline complète (réel + projection)
  const showProjection = p > 0;

  // Valeur N-1 d'un index (null si hors série réelle, absent ou `missing`).
  const cmpAt = (i: number): number | null => {
    const s = compare?.[i];
    return s && !s.missing ? s.endBalance : null;
  };
  const compareVals = (compare ?? []).filter((s) => s && !s.missing).map((s) => s.endBalance);
  const showCompare = compareVals.length > 0;

  // L'axe Y intègre N-1 ET la fourchette de projection pour ne jamais les tronquer.
  const maxBal = Math.max(...series.map((s) => s.endBalance), ...compareVals, ...proj.flatMap((q) => [q.low, q.high]), 0);
  const niceMax = niceCeil(maxBal);
  const TOP = 8; // marge haute (place pour le marqueur)
  const yOf = (v: number) => Math.min(100, Math.max(0, TOP + (1 - v / niceMax) * (100 - TOP)));
  const xOf = (i: number) => (N > 1 ? (i / (N - 1)) * 100 : 50);

  const pts = series.map((s, i) => ({ x: xOf(i), y: yOf(s.endBalance) }));
  const line = smoothPath(pts);
  // Aire sous la seule courbe réelle (bornée au dernier point réel).
  const area = n > 1 ? `${line} L ${xOf(n - 1).toFixed(2)} 100 L ${xOf(0).toFixed(2)} 100 Z` : "";

  // Courbe N-1 : segments contigus (les `missing`/null créent des ruptures). Lissés par segment.
  const cmpSegments: { x: number; y: number }[][] = [];
  if (showCompare) {
    let run: { x: number; y: number }[] = [];
    for (let i = 0; i < n; i++) {
      const v = cmpAt(i);
      if (v != null) run.push({ x: xOf(i), y: yOf(v) });
      else if (run.length) { cmpSegments.push(run); run = []; }
    }
    if (run.length) cmpSegments.push(run);
  }

  // Projection en fourchette : 2 courbes (low/high) partant du dernier point réel + zone remplie.
  const lastReal = pts[n - 1];
  const projLowPts = proj.map((q, j) => ({ x: xOf(n + j), y: yOf(q.low) }));
  const projHighPts = proj.map((q, j) => ({ x: xOf(n + j), y: yOf(q.high) }));
  const lowPath = showProjection ? smoothPath([lastReal, ...projLowPts]) : "";
  const highPath = showProjection ? smoothPath([lastReal, ...projHighPts]) : "";
  // Zone entre les 2 bornes : aller le long de `high`, retour le long de `low` (segments droits).
  const bandPath = showProjection
    ? `${highPath} ${[...projLowPts].reverse().map((q) => `L ${q.x.toFixed(2)} ${q.y.toFixed(2)}`).join(" ")} L ${lastReal.x.toFixed(2)} ${lastReal.y.toFixed(2)} Z`
    : "";

  const ticks = [0, 1 / 3, 2 / 3, 1].map((t) => niceMax * t);
  const last = pts[n - 1];
  const lastVal = series[n - 1].endBalance;
  const axisSel = sel ?? n - 1;

  const isProj = (i: number) => i >= n;
  const labelAt = (i: number) => (i < n ? series[i].label : proj[i - n].label);
  // Pour le marqueur de sélection sur un point projeté : borne haute (potentielle).
  const valueAt = (i: number) => (i < n ? series[i].endBalance : proj[i - n].high);
  const ariaLabel = `${title} sur ${n} mois : de ${euro(series[0].endBalance)} (${series[0].label}) à ${euro(lastVal)} (${series[n - 1].label})${showProjection ? `, projection (fourchette) jusqu'à ${proj[p - 1].label} : ${euro(proj[p - 1].low)} à ${euro(proj[p - 1].high)}` : ""}.`;

  return (
    <div className="relative mt-3 select-none" onMouseLeave={leave} role="group" aria-label={ariaLabel}>
      {/* Légende — quand une 2ᵉ courbe (N-1) et/ou une projection est tracée */}
      {(showCompare || showProjection) && (
        <div className="mb-1.5 flex flex-wrap items-center justify-end gap-3 text-[11px] text-ink-2">
          <span className="inline-flex items-center gap-1.5"><span className="h-0.5 w-3.5 rounded-full bg-cyan-600" /> Exercice</span>
          {showProjection && (
            <>
              <span className="inline-flex items-center gap-1.5"><span className="h-0 w-3.5 border-t-2 border-dashed border-cyan-600 opacity-90" /> Proj. quasi certaine</span>
              <span className="inline-flex items-center gap-1.5"><span className="h-0 w-3.5 border-t-2 border-dashed border-cyan-600 opacity-45" /> Proj. potentielle</span>
            </>
          )}
          {showCompare && (
            <span className="inline-flex items-center gap-1.5 text-n1-text"><span className="h-0 w-3.5 border-t-2 border-dashed border-n1" /> N-1</span>
          )}
        </div>
      )}
      <div className="relative h-44 pl-12">
        {/* Repères d'axe Y (libellés HTML, nets) */}
        {ticks.map((t, i) => (
          <span key={i} className="absolute left-0 -translate-y-1/2 text-[10px] font-medium text-ink-3"
            style={{ top: `${yOf(t)}%` }}>{kEuro(t)}</span>
        ))}
        {/* Zone traçée */}
        <div className="relative h-full">
          <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-full w-full overflow-visible">
            <defs>
              <linearGradient id="treso-area" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="var(--color-cyan)" stopOpacity="0.38" />
                <stop offset="100%" stopColor="var(--color-cyan)" stopOpacity="0" />
              </linearGradient>
            </defs>
            {/* Grille horizontale */}
            {ticks.map((t, i) => (
              <line key={i} x1="0" x2="100" y1={yOf(t)} y2={yOf(t)} stroke="var(--color-line)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
            ))}
            {area && <path d={area} fill="url(#treso-area)" className="motion-safe:animate-[fade-in_0.7s_ease-out]" />}
            {/* Courbe N-1 pointillée ambrée (sous la courbe pleine), segment par segment */}
            {cmpSegments.map((seg, i) =>
              seg.length >= 2 ? (
                <path key={i} d={smoothPath(seg)} fill="none" stroke="var(--color-n1)" strokeWidth={2}
                  strokeDasharray="4 3" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
              ) : (
                <circle key={i} cx={seg[0].x} cy={seg[0].y} r={1.6} fill="var(--color-n1)" vectorEffect="non-scaling-stroke" />
              )
            )}
            {/* Projection en fourchette (pointillé cyan, jamais jaune) : zone remplie + 2 bornes */}
            {showProjection && (
              <>
                <path d={bandPath} fill="var(--color-cyan)" fillOpacity={0.12} stroke="none" />
                {/* Potentielle (borne haute) : plus claire */}
                <path d={highPath} fill="none" stroke="var(--color-cyan-600)" strokeWidth={2} strokeDasharray="4 3"
                  opacity={0.45} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
                {/* Quasi certaine (borne basse) : plus foncée/opaque */}
                <path d={lowPath} fill="none" stroke="var(--color-cyan-600)" strokeWidth={2} strokeDasharray="4 3"
                  opacity={0.9} vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" />
              </>
            )}
            <path d={line} fill="none" stroke="var(--color-cyan-600)" strokeWidth={2} vectorEffect="non-scaling-stroke"
              strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          {/* Marqueur dernier point réel */}
          <span className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-cyan-600 shadow"
            style={{ left: `${last.x}%`, top: `${last.y}%` }} />
          {/* Marqueurs de fin de fourchette (creux) : bornes haute & basse */}
          {showProjection && (
            <>
              <span className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-600 bg-white opacity-60"
                style={{ left: `${projHighPts[p - 1].x}%`, top: `${projHighPts[p - 1].y}%` }} />
              <span className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-cyan-600 bg-white"
                style={{ left: `${projLowPts[p - 1].x}%`, top: `${projLowPts[p - 1].y}%` }} />
            </>
          )}
          {/* Marqueur sélection */}
          {sel !== null && sel !== n - 1 && (
            <span className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-600"
              style={{ left: `${xOf(sel)}%`, top: `${yOf(valueAt(sel))}%` }} />
          )}
          {/* Colonnes interactives (réel + projeté) */}
          <div className="absolute inset-0 flex">
            {Array.from({ length: N }).map((_, i) => (
              <button
                key={i < n ? series[i].key : `proj-${i - n}`}
                type="button"
                {...handlers(i)}
                aria-label={isProj(i)
                  ? `${labelAt(i)} : projection — quasi certaine ${euro(proj[i - n].low)}, potentielle ${euro(proj[i - n].high)}.`
                  : `${labelAt(i)} : ${valueLabel.toLowerCase()} ${euro(series[i].endBalance)}.`}
                aria-pressed={pinned === i}
                className="h-full flex-1 cursor-pointer rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan focus-visible:ring-inset"
              />
            ))}
          </div>
        </div>
      </div>
      {/* Axe des mois */}
      <div className="flex pl-12">
        {Array.from({ length: N }).map((_, i) => (
          <div key={i} className="flex-1 text-center">
            {(N <= 14 || i % 2 === 0) && (
              <span className={`text-[9px] ${axisSel === i ? "font-semibold text-ink" : isProj(i) ? "text-ink-3/70" : "text-ink-3"}`}>{labelAt(i)}</span>
            )}
          </div>
        ))}
      </div>
      {/* Tooltip */}
      {sel !== null && (
        <div className={`absolute top-0 z-10 w-40 -translate-x-1/2 rounded-card border border-line bg-white p-2.5 text-xs shadow-card-hover ${pinned ? "pointer-events-auto" : "pointer-events-none"}`}
          style={{ left: `calc(48px + (100% - 48px) * ${(xOf(sel) / 100).toFixed(4)})`, ...(sel > N * 0.66 ? { transform: "translateX(-90%)" } : {}) }}>
          {pinned && (
            <button type="button" onClick={close} aria-label="Fermer le détail"
              className="absolute right-1.5 top-1.5 rounded p-0.5 text-ink-3 hover:bg-cloud hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan">
              <IconX size={13} />
            </button>
          )}
          <div className="pr-4 font-semibold text-ink">{labelAt(sel)}</div>
          <div className="mt-1.5 space-y-1">
            {isProj(sel) ? (
              <>
                <div className="flex items-center gap-1.5">
                  <span className="h-0 w-3 flex-none border-t-2 border-dashed border-cyan-600" aria-hidden />
                  <span className="text-ink-2">Quasi certaine</span>
                  <span className="ml-auto font-semibold text-ink">{euro(proj[sel - n].low)}</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="h-0 w-3 flex-none border-t-2 border-dashed border-cyan-600 opacity-50" aria-hidden />
                  <span className="text-ink-2">Potentielle</span>
                  <span className="ml-auto font-semibold text-ink">{euro(proj[sel - n].high)}</span>
                </div>
                <div className="text-[11px] italic text-ink-3">projection (rythme moyen)</div>
              </>
            ) : (
              <>
                <Line label={valueLabel} value={euro(series[sel].endBalance)} strong />
                {showCompare && (
                  <div className="flex items-center gap-1.5">
                    <span className="h-0 w-3 flex-none border-t-2 border-dashed border-n1" aria-hidden />
                    <span className="text-n1-text">N-1</span>
                    <span className="ml-auto font-medium text-n1-text">{cmpAt(sel) != null ? euro(cmpAt(sel)!) : "—"}</span>
                  </div>
                )}
                {deltaInTooltip && (() => {
                  if (sel === 0) return <div className="text-[11px] text-ink-3">Variation : 1er mois</div>;
                  const d = series[sel].endBalance - series[sel - 1].endBalance;
                  return (
                    <div className="flex items-center gap-1.5">
                      <span className="text-ink-2">Variation</span>
                      <span className={`ml-auto font-medium ${d > 0 ? "text-emerald-700" : d < 0 ? "text-red-700" : "text-ink-3"}`}>
                        {d >= 0 ? "+" : "−"}{euro(Math.abs(d))}
                      </span>
                    </div>
                  );
                })()}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function Line({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="text-ink-2">{label}</span>
      <span className={`ml-auto ${strong ? "font-semibold text-ink" : "font-medium text-ink"}`}>{value}</span>
    </div>
  );
}
