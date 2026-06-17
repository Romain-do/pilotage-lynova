"use client";

import { useEffect, useMemo, useRef, useState } from "react";

// Saisie de date en 3 listes déroulantes (jour / mois / année) → date ISO « yyyy-mm-dd ».
// Remplace le calendrier natif (fini les fermetures intempestives). Années : de l'actuelle
// à +2. Le jour est borné au nombre de jours du mois choisi (pas de 30 février).
//
// État INTERNE des 3 parties (y/m/d) : une sélection partielle « tient » au lieu d'être effacée.
// On n'émet l'ISO via `onChange` que lorsque les 3 parties sont présentes (sinon ""), SANS perdre la
// saisie en cours. On ne resynchronise depuis `value` que sur un changement EXTERNE (bouton « Effacer »,
// ouverture d'un autre prospect) — détecté via `lastEmitted` (≠ nos propres émissions).

const MONTHS = [
  "janvier", "février", "mars", "avril", "mai", "juin",
  "juillet", "août", "septembre", "octobre", "novembre", "décembre",
];

/** Nombre de jours du mois (month1 = 1..12). 31 par défaut tant que mois/année incomplets. */
function daysInMonth(year: number, month1: number): number {
  if (!year || !month1) return 31;
  return new Date(year, month1, 0).getDate();
}

const pad = (n: number) => String(n).padStart(2, "0");

/** Parse « yyyy-mm-dd » → { y, m, d } (0 si absent/incomplet). */
function parse(value: string): { y: number; m: number; d: number } {
  const [yStr = "", mStr = "", dStr = ""] = value ? value.split("-") : [];
  return { y: Number(yStr) || 0, m: Number(mStr) || 0, d: Number(dStr) || 0 };
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
  const init = parse(value);
  const [y, setY] = useState(init.y);
  const [m, setM] = useState(init.m);
  const [d, setD] = useState(init.d);
  // Dernière valeur émise par CE composant → distingue un changement EXTERNE de `value` (Effacer,
  // autre prospect) d'un simple re-render dû à notre propre `onChange` (saisie partielle = "").
  const lastEmitted = useRef(value);

  // Resync de l'état interne UNIQUEMENT sur changement externe de `value`.
  useEffect(() => {
    if (value !== lastEmitted.current) {
      const p = parse(value);
      setY(p.y);
      setM(p.m);
      setD(p.d);
      lastEmitted.current = value;
    }
  }, [value]);

  const nowYear = new Date().getFullYear();
  const years = useMemo(() => {
    const list = [nowYear, nowYear + 1, nowYear + 2];
    // Conserve l'année existante si hors plage (rappel passé / autre année).
    if (y && !list.includes(y)) list.push(y);
    return list.sort((a, b) => a - b);
  }, [nowYear, y]);

  const days = useMemo(
    () => Array.from({ length: daysInMonth(y, m) }, (_, i) => i + 1),
    [y, m]
  );

  // Met à jour les 3 parties (clamp du jour au max du mois/année → pas de 31 février) puis émet.
  function update(ny: number, nm: number, nd: number) {
    const cd = nd ? Math.min(nd, daysInMonth(ny, nm)) : 0;
    setY(ny);
    setM(nm);
    setD(cd);
    const iso = ny && nm && cd ? `${ny}-${pad(nm)}-${pad(cd)}` : "";
    lastEmitted.current = iso;
    onChange(iso);
  }

  const cls =
    selectClassName ||
    "rounded-md border border-navy/15 bg-white px-2 py-1.5 text-sm text-navy focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/40";

  return (
    <div className="flex items-center gap-1.5" role="group" aria-label={ariaLabel}>
      <select
        aria-label="Jour"
        className={cls}
        value={d || ""}
        onChange={(e) => update(y, m, Number(e.target.value))}
      >
        <option value="">Jour</option>
        {days.map((dd) => (
          <option key={dd} value={dd}>
            {dd}
          </option>
        ))}
      </select>
      <select
        aria-label="Mois"
        className={cls}
        value={m || ""}
        onChange={(e) => update(y, Number(e.target.value), d)}
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
        value={y || ""}
        onChange={(e) => update(Number(e.target.value), m, d)}
      >
        <option value="">Année</option>
        {years.map((yy) => (
          <option key={yy} value={yy}>
            {yy}
          </option>
        ))}
      </select>
    </div>
  );
}
