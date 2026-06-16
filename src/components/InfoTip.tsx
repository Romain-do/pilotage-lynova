"use client";

import { useState, type ReactNode } from "react";
import { IconInfoCircle } from "@tabler/icons-react";

// Petite infobulle « ⓘ » accessible (survol souris + focus clavier + tap mobile).
// - survol : `group-hover` révèle le détail ;
// - clavier : focus du bouton → `group-focus-within` révèle ;
// - tactile : tap = toggle de l'état `open` (re-tap referme).
// Le détail est passé en `children`. `align` gère le débordement près d'un bord droit.
export function InfoTip({
  children,
  label = "Plus d'informations",
  align = "left",
}: {
  children: ReactNode;
  label?: string;
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  return (
    <span className="group relative inline-flex align-middle">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-label={label}
        aria-expanded={open}
        className="inline-flex items-center rounded-full text-ink-3 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
      >
        <IconInfoCircle size={14} stroke={2} />
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute top-full z-30 mt-1 w-64 rounded-card border border-line bg-white p-3 text-xs font-normal normal-case leading-snug text-ink-2 shadow-card-hover ${
          align === "right" ? "right-0" : "left-0"
        } ${open ? "block" : "hidden"} group-hover:block group-focus-within:block`}
      >
        {children}
      </span>
    </span>
  );
}
