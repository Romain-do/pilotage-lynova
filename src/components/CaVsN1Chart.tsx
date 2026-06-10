"use client";

import { useState } from "react";
import { euro, rel, FISCAL_MONTHS } from "@/lib/facturation";

// Graphe « CA HT mensuel — exercice en cours vs N-1 ». Axe fiscal oct→sept (12 mois).
// Barres : exercice = cyan, N-1 = gris. Tooltip mois + CA exercice + CA N-1 + écart.
export function CaVsN1Chart({ current, previous, fy }: { current: number[]; previous: number[]; fy: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...current, ...previous);
  const n = FISCAL_MONTHS.length;
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

  return (
    <div
      className="relative mt-3"
      onMouseLeave={() => setHover(null)}
      role="img"
      aria-label={`CA HT mensuel, exercice ${fy} (${euro(sum(current))}) vs exercice ${fy - 1} (${euro(sum(previous))}), axe octobre à septembre.`}
    >
      <div className="flex h-44 items-end gap-1 sm:gap-1.5">
        {FISCAL_MONTHS.map((label, i) => {
          const active = hover === null || hover === i;
          return (
            <div
              key={label}
              className="relative flex h-full flex-1 cursor-default flex-col items-center justify-end"
              onMouseEnter={() => setHover(i)}
            >
              <div className={`absolute inset-x-0 bottom-5 top-0 rounded-md transition-colors ${hover === i ? "bg-cyan/[0.07]" : ""}`} />
              <div className="relative flex h-full w-full items-end justify-center gap-0.5 pb-5">
                <div
                  className={`w-2.5 origin-bottom rounded-t-sm bg-cyan transition-opacity duration-200 sm:w-3 ${active ? "opacity-100" : "opacity-40"}`}
                  style={{ height: `${Math.min(100, (current[i] / max) * 100)}%` }}
                />
                <div
                  className={`w-2.5 origin-bottom rounded-t-sm bg-ink-3/40 transition-opacity duration-200 sm:w-3 ${active ? "opacity-100" : "opacity-40"}`}
                  style={{ height: `${Math.min(100, (previous[i] / max) * 100)}%` }}
                />
              </div>
              {(n <= 14 || i % 2 === 0) && (
                <span className={`absolute bottom-0 truncate text-[9px] transition-colors ${hover === i ? "font-semibold text-ink" : "text-ink-3"}`}>{label}</span>
              )}
            </div>
          );
        })}
      </div>
      {hover !== null && <Tooltip index={hover} n={n} label={FISCAL_MONTHS[hover]} cur={current[hover]} prev={previous[hover]} fy={fy} />}
    </div>
  );
}

function Tooltip({ index, n, label, cur, prev, fy }: { index: number; n: number; label: string; cur: number; prev: number; fy: number }) {
  const left = ((index + 0.5) / n) * 100;
  const alignRight = index > n * 0.66;
  const d = rel(cur, prev);
  return (
    <div
      className="pointer-events-none absolute top-0 z-10 w-44 -translate-x-1/2 rounded-card border border-line bg-white p-3 text-xs shadow-card-hover"
      style={{ left: `${left}%`, ...(alignRight ? { transform: "translateX(-85%)" } : {}) }}
    >
      <div className="font-semibold text-ink">{label}</div>
      <div className="mt-2 space-y-1">
        <Row color="bg-cyan" label={`Exercice ${fy}`} value={euro(cur)} />
        <Row color="bg-ink-3/40" label={`Exercice ${fy - 1}`} value={euro(prev)} />
      </div>
      <div className="mt-2 border-t border-line pt-1.5 text-ink-3">{d != null ? `${d >= 0 ? "+" : ""}${d.toFixed(0)} % vs N-1` : "—"}</div>
    </div>
  );
}

function Row({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
      <span className="text-ink-2">{label}</span>
      <span className="ml-auto font-medium text-ink">{value}</span>
    </div>
  );
}
