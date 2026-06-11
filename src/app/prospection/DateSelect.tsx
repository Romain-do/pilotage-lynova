"use client";

import { useMemo } from "react";

// Saisie de date en 3 listes déroulantes (jour / mois / année) → date ISO « yyyy-mm-dd ».
// Remplace le calendrier natif (fini les fermetures intempestives). Années : de l'actuelle
// à +2. Le jour est borné au nombre de jours du mois choisi (pas de 30 février).

const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** Nombre de jours du mois (month1 = 1..12). 31 par défaut si incomplet. */
function daysInMonth(year: number, month1: number): number {
  if (!year || !month1) return 31;
  return new Date(year, month1, 0).getDate();
}

export function DateSelect({
  value,
  onChange,
  selectClassName = "",
  ariaLabel,
}: {
  /** Date « yyyy-mm-dd » ou "" si non renseignée. */
  value: string;
  /** Appelé dès qu'une date complète est choisie ("" si incomplète / effacée). */
  onChange: (iso: string) => void;
  selectClassName?: string;
  ariaLabel?: string;
}) {
  const [yStr = "", mStr = "", dStr = ""] = value ? value.split("-") : [];
  const year = Number(yStr) || 0;
  const month = Number(mStr) || 0;
  const day = Number(dStr) || 0;

  const nowYear = new Date().getFullYear();
  const years = useMemo(() => {
    const list = [nowYear, nowYear + 1, nowYear + 2];
    // Conserve l'année existante si hors plage (rappel passé / autre année).
    if (year && !list.includes(year)) list.push(year);
    return list.sort((a, b) => a - b);
  }, [nowYear, year]);

  const days = useMemo(
    () => Array.from({ length: daysInMonth(year, month) }, (_, i) => i + 1),
    [year, month]
  );

  function emit(y: number, m: number, d: number) {
    if (!y || !m || !d) {
      onChange("");
      return;
    }
    const clampedDay = Math.min(d, daysInMonth(y, m));
    onChange(`${y}-${String(m).padStart(2, "0")}-${String(clampedDay).padStart(2, "0")}`);
  }

  const cls =
    selectClassName ||
    "rounded-md border border-navy/15 bg-white px-2 py-1.5 text-sm text-navy focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/40";

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={ariaLabel}>
      <select
        aria-label="Jour"
        className={cls}
        value={day || ""}
        onChange={(e) => emit(year, month, Number(e.target.value))}
      >
        <option value="">Jour</option>
        {days.map((d) => (
          <option key={d} value={d}>
            {d}
          </option>
        ))}
      </select>
      <select
        aria-label="Mois"
        className={cls}
        value={month || ""}
        onChange={(e) => emit(year, Number(e.target.value), day)}
      >
        <option value="">Mois</option>
        {MONTHS.map((label, i) => (
          <option key={label} value={i + 1}>
            {label}
          </option>
        ))}
      </select>
      <select
        aria-label="Année"
        className={cls}
        value={year || ""}
        onChange={(e) => emit(Number(e.target.value), month, day)}
      >
        <option value="">Année</option>
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </div>
  );
}
