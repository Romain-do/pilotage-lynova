"use client";

import { useState } from "react";

// Sélection d'un point/colonne de graphe, robuste souris + clavier + tactile (cf. M4 audit).
// - survol souris (onMouseEnter) ET focus clavier (onFocus) → aperçu transitoire ;
// - tap/clic OU Entrée/Espace → épingle un tooltip persistant ; re-tap sur le même = referme.
// `active` = index à afficher (l'épingle est prioritaire, sinon le survol/focus courant).
// Le tooltip épinglé reste fermable via son bouton ×, indépendamment du hover résiduel que
// certains navigateurs tactiles synthétisent.
export function useChartSelection() {
  const [hover, setHover] = useState<number | null>(null);
  const [pinned, setPinned] = useState<number | null>(null);
  const active = pinned ?? hover;

  // Handlers à étaler sur chaque colonne/point focusable (`<button>`).
  const handlers = (i: number) => ({
    onMouseEnter: () => setHover(i),
    onFocus: () => setHover(i),
    onBlur: () => setHover((h) => (h === i ? null : h)),
    onClick: () => {
      if (pinned === i) {
        setPinned(null);
        setHover(null);
      } else {
        setPinned(i);
      }
    },
  });

  return {
    active,
    pinned,
    handlers,
    // À brancher sur onMouseLeave du conteneur : efface l'aperçu, garde l'épingle.
    leave: () => setHover(null),
    // Fermeture explicite (bouton ×) : enlève épingle ET aperçu.
    close: () => {
      setPinned(null);
      setHover(null);
    },
  };
}
