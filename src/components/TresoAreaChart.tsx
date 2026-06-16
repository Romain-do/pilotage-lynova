"use client";

import { useState } from "react";
import { euro } from "@/lib/facturation";

// Graphe « Évolution de la trésorerie » (aire lissée du solde EUR fin de mois).
// Extrait de la vue Trésorerie pour être réutilisé tel quel au Cockpit (pas de duplication).
// Les helpers niceCeil / kEuro / Line et le type SeriePoint sont exportés car la vue Trésorerie
// les partage avec son graphe « Flux nets mensuels ».

export type SeriePoint = { key: string; label: string; inflow: number; outflow: number; endBalance: number };

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

export function TresoAreaChart({ series }: { series: SeriePoint[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const n = series.length;
  if (n === 0) return <p className="mt-6 text-center text-sm text-ink-3">Aucune donnée sur la période.</p>;

  const maxBal = Math.max(...series.map((s) => s.endBalance), 0);
  const niceMax = niceCeil(maxBal);
  const TOP = 8; // marge haute (place pour le marqueur)
  const yOf = (v: number) => {
    const y = TOP + (1 - v / niceMax) * (100 - TOP);
    return Math.min(100, Math.max(0, y));
  };
  const xOf = (i: number) => (n > 1 ? (i / (n - 1)) * 100 : 50);
  const pts = series.map((s, i) => ({ x: xOf(i), y: yOf(s.endBalance) }));
  const line = smoothPath(pts);
  const area = n > 1 ? `${line} L ${xOf(n - 1).toFixed(2)} 100 L ${xOf(0).toFixed(2)} 100 Z` : "";
  const ticks = [0, 1 / 3, 2 / 3, 1].map((t) => niceMax * t);
  const last = pts[n - 1];
  const lastVal = series[n - 1].endBalance;
  const sel = hover ?? n - 1;
  const ariaLabel = `Évolution de la trésorerie sur ${n} mois : de ${euro(series[0].endBalance)} (${series[0].label}) à ${euro(lastVal)} (${series[n - 1].label}).`;

  return (
    <div className="relative mt-3 select-none" onMouseLeave={() => setHover(null)} role="img" aria-label={ariaLabel}>
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
            <path d={line} fill="none" stroke="var(--color-cyan-600)" strokeWidth={2} vectorEffect="non-scaling-stroke"
              strokeLinejoin="round" strokeLinecap="round" />
          </svg>
          {/* Marqueur dernier point (sans étiquette flottante : la valeur reste lisible au survol) */}
          <span className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-cyan-600 shadow"
            style={{ left: `${last.x}%`, top: `${last.y}%` }} />
          {/* Marqueur survol */}
          {hover !== null && hover !== n - 1 && (
            <span className="pointer-events-none absolute h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-cyan-600"
              style={{ left: `${pts[hover].x}%`, top: `${pts[hover].y}%` }} />
          )}
          {/* Colonnes de survol */}
          <div className="absolute inset-0 flex">
            {series.map((s, i) => (
              <div key={s.key} className="h-full flex-1" onMouseEnter={() => setHover(i)} />
            ))}
          </div>
        </div>
      </div>
      {/* Axe des mois */}
      <div className="flex pl-12">
        {series.map((s, i) => (
          <div key={s.key} className="flex-1 text-center">
            {(n <= 14 || i % 2 === 0) && <span className={`text-[9px] ${sel === i ? "font-semibold text-ink" : "text-ink-3"}`}>{s.label}</span>}
          </div>
        ))}
      </div>
      {/* Tooltip */}
      {hover !== null && (
        <div className="pointer-events-none absolute top-0 z-10 w-40 -translate-x-1/2 rounded-card border border-line bg-white p-2.5 text-xs shadow-card-hover"
          style={{ left: `calc(48px + (100% - 48px) * ${(xOf(hover) / 100).toFixed(4)})`, ...(hover > n * 0.66 ? { transform: "translateX(-90%)" } : {}) }}>
          <div className="font-semibold text-ink">{series[hover].label}</div>
          <div className="mt-1.5"><Line label="Solde fin" value={euro(series[hover].endBalance)} strong /></div>
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
