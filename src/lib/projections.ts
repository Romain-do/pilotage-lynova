// Projections (exercice EN COURS uniquement). Tout en mois civils « YYYY-MM ».
//
// Méthode commune :
//   • base    = CA réalisé À DATE (tout le facturé depuis le début de l'exercice, MOIS COURANT PARTIEL
//               INCLUS pour ce qui est déjà facturé) ;
//   • rem     = nombre de mois fiscaux ENTIÈREMENT restants APRÈS le mois courant (→ sept.). Le mois
//               courant n'est PAS compté dans `rem` : il est déjà dans `base`. Le reliquat du mois
//               courant (jours restants) n'est volontairement PAS extrapolé → projection conservatrice.
//   • runRate = moyenne mensuelle des 6 DERNIERS MOIS CIVILS COMPLETS glissants (le mois courant partiel
//               reste exclu de la moyenne). Si moins de 6 mois dispo, on prend ce qui existe (min 1) →
//               `fewMonths` signale ce garde-fou. Appliqué sur `rem` mois pleins.

function addMonth(key: string, delta: number): string {
  let y = Number(key.slice(0, 4));
  let m = Number(key.slice(5, 7)) + delta;
  while (m <= 0) { m += 12; y -= 1; }
  while (m > 12) { m -= 12; y += 1; }
  return `${y}-${String(m).padStart(2, "0")}`;
}

// Clés de mois de `start` à `end` inclus (start ≤ end).
function monthSpan(start: string, end: string): string[] {
  const out: string[] = [];
  let k = start;
  while (k <= end) { out.push(k); k = addMonth(k, 1); }
  return out;
}

export interface RunRateBasis {
  base: number; // CA réalisé À DATE (début d'exercice → mois courant inclus)
  rem: number; // mois fiscaux ENTIÈREMENT restants après le mois courant (= futureMonths.length)
  runRate: number; // moyenne mensuelle des 6 derniers mois civils COMPLETS (glissants)
  monthsUsed: number; // nb de mois réellement moyennés (garde-fou : min 1)
  fewMonths: boolean; // true si < 6 mois de données → run-rate sur une fenêtre réduite
  futureMonths: string[]; // mois STRICTEMENT après le mois courant → sept. (prolongement de courbe)
}

// `valueOfMonth(key)` = métrique réalisée d'un mois civil (CA HT, cash net…). `earliestMonth` borne le
// run-rate aux données disponibles (1er mois facturé / 1er mois de données bancaires). Renvoie `null`
// si `fy` n'est pas l'exercice en cours (sécurité — aucune projection hors exercice courant).
export function runRateBasis(
  fy: number,
  todayISO: string,
  valueOfMonth: (key: string) => number,
  earliestMonth: string | null,
): RunRateBasis | null {
  const curMonth = todayISO.slice(0, 7);
  const fyStart = `${fy - 1}-10`;
  const fyEnd = `${fy}-09`;
  if (curMonth < fyStart || curMonth > fyEnd) return null; // pas l'exercice en cours

  const lastComplete = addMonth(curMonth, -1); // dernier mois civil complet (pour le run-rate)

  // base : réalisé À DATE = tous les mois fiscaux du début de l'exercice au MOIS COURANT INCLUS.
  const base = monthSpan(fyStart, curMonth < fyEnd ? curMonth : fyEnd).reduce((s, k) => s + valueOfMonth(k), 0);

  // mois fiscaux ENTIÈREMENT restants, strictement après le mois courant → sept.
  const futureMonths = monthSpan(addMonth(curMonth, 1), fyEnd);
  const rem = futureMonths.length;

  // run-rate : 6 derniers mois complets glissants (mois courant exclu), borné au 1er mois de données.
  let windowStart = addMonth(lastComplete, -5);
  if (earliestMonth && windowStart < earliestMonth) windowStart = earliestMonth;
  const rrMonths = lastComplete >= windowStart ? monthSpan(windowStart, lastComplete) : [];
  const monthsUsed = rrMonths.length;
  const runRate = monthsUsed > 0 ? rrMonths.reduce((s, k) => s + valueOfMonth(k), 0) / monthsUsed : 0;

  return { base, rem, runRate, monthsUsed, fewMonths: monthsUsed < 6, futureMonths };
}
