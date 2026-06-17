"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

// Sélecteur d'exercice fiscal global du Cockpit (LOT 4). Pilote les indicateurs PÉRIODIQUES via le
// searchParam `?fy=` : on navigue vers `/?fy=YYYY` (ou `/` pour l'exercice en cours, URL propre) →
// la route étant `force-dynamic`, le server-component se recalcule et re-rend. Style charte, même
// look que la Toolbar d'Evoliz. `useTransition` garde le sélecteur réactif pendant le rechargement.
export function FySelect({ fy, currentFy, fyList }: { fy: number; currentFy: number; fyList: number[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <select
      aria-label="Choisir l'exercice fiscal piloté"
      value={String(fy)}
      disabled={pending}
      onChange={(e) => {
        const v = Number(e.target.value);
        start(() => router.push(v === currentFy ? "/" : `/?fy=${v}`));
      }}
      className="rounded-card border border-line bg-white px-3 py-1.5 text-sm font-medium text-ink shadow-card focus:border-cyan focus:outline-none focus:ring-2 focus:ring-cyan/40 disabled:opacity-70"
    >
      {fyList.map((y) => (
        <option key={y} value={y}>
          Exercice {y}
          {y === currentFy ? " (en cours)" : ""}
        </option>
      ))}
    </select>
  );
}
