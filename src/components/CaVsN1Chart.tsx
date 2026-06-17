"use client";

import { IconX } from "@tabler/icons-react";
import { euro, rel, pct1, FISCAL_MONTHS } from "@/lib/facturation";
import { useChartSelection } from "@/components/useChartSelection";

// Graphe générique « <métrique> mensuel — exercice en cours vs N-1 ». Axe fiscal oct→sept (12 mois).
// Barres : exercice = cyan, N-1 = gris. Tooltip mois + valeur exercice + valeur N-1 + écart.
// `unitLabel` ne sert qu'à l'aria-label (ex. « CA HT », « Rémunération ») ; défaut « CA HT ».
export function CaVsN1Chart({
  current,
  previous,
  fy,
  unitLabel = "CA HT",
}: {
  current: number[];
  previous: number[];
  fy: number;
  unitLabel?: string;
}) {
  const { active: sel, pinned, handlers, leave, close } = useChartSelection();
  // Valeur d'un mois, bornée à 0 si le tableau est plus court que 12 / contient un trou (anti-NaN).
  const at = (a: number[], i: number) => a[i] ?? 0;
  const max = Math.max(1, ...current.map((v) => v || 0), ...previous.map((v) => v || 0));
  const n = FISCAL_MONTHS.length;
  const sum = (a: number[]) => a.reduce((s, v) => s + v, 0);

  return (
    <div
      className="relative mt-3"
      onMouseLeave={leave}
      role="group"
      aria-label={`${unitLabel} mensuel, exercice ${fy} (${euro(sum(current))}) vs exercice ${fy - 1} (${euro(sum(previous))}), axe octobre à septembre.`}
    >
      <div className="flex h-48 items-end gap-1 sm:gap-1.5">
        {FISCAL_MONTHS.map((label, i) => {
          const active = sel === null || sel === i;
          return (
            <button
              key={label}
              type="button"
              {...handlers(i)}
              aria-label={`${label} : exercice ${fy} ${euro(at(current, i))}, exercice ${fy - 1} ${euro(at(previous, i))}.`}
              aria-pressed={pinned === i}
              className="relative flex h-full flex-1 cursor-pointer flex-col items-center justify-end rounded-md focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
            >
              <div className={`absolute inset-x-0 bottom-5 top-0 rounded-md transition-colors ${sel === i ? "bg-cyan/[0.07]" : ""}`} />
              <div className="relative flex h-full w-full items-end justify-center gap-1 pb-5">
                <div
                  className={`w-4 origin-bottom rounded-t-sm bg-cyan transition-opacity duration-200 sm:w-6 ${active ? "opacity-100" : "opacity-40"}`}
                  style={{ height: `${Math.min(100, (at(current, i) / max) * 100)}%` }}
                />
                <div
                  className={`w-4 origin-bottom rounded-t-sm bg-n1 transition-opacity duration-200 sm:w-6 ${active ? "opacity-100" : "opacity-40"}`}
                  style={{ height: `${Math.min(100, (at(previous, i) / max) * 100)}%` }}
                />
              </div>
              {(n <= 14 || i % 2 === 0) && (
                <span className={`absolute bottom-0 truncate text-[9px] transition-colors ${sel === i ? "font-semibold text-ink" : "text-ink-3"}`}>{label}</span>
              )}
            </button>
          );
        })}
      </div>
      {sel !== null && (
        <Tooltip index={sel} n={n} label={FISCAL_MONTHS[sel]} cur={at(current, sel)} prev={at(previous, sel)} fy={fy} pinned={pinned === sel} onClose={close} />
      )}
    </div>
  );
}

function Tooltip({ index, n, label, cur, prev, fy, pinned, onClose }: { index: number; n: number; label: string; cur: number; prev: number; fy: number; pinned?: boolean; onClose?: () => void }) {
  const left = ((index + 0.5) / n) * 100;
  const alignRight = index > n * 0.66;
  const d = rel(cur, prev);
  return (
    <div
      className={`absolute top-0 z-10 w-44 -translate-x-1/2 rounded-card border border-line bg-white p-3 text-xs shadow-card-hover ${pinned ? "pointer-events-auto" : "pointer-events-none"}`}
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
      <div className="mt-2 space-y-1">
        <Row color="bg-cyan" label={`Exercice ${fy}`} value={euro(cur)} />
        <Row color="bg-n1" label={`Exercice ${fy - 1}`} value={euro(prev)} accent />
      </div>
      <div className="mt-2 border-t border-line pt-1.5 text-ink-3">{d != null ? `${d >= 0 ? "+" : ""}${pct1(d)} % vs N-1` : "—"}</div>
    </div>
  );
}

function Row({ color, label, value, accent }: { color: string; label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className={`h-2.5 w-2.5 rounded-sm ${color}`} />
      <span className={accent ? "text-n1-text" : "text-ink-2"}>{label}</span>
      <span className={`ml-auto font-medium ${accent ? "text-n1-text" : "text-ink"}`}>{value}</span>
    </div>
  );
}
