"use client";

import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { IconInfoCircle } from "@tabler/icons-react";

// Infobulle « ⓘ » accessible (survol souris + focus clavier + tap mobile).
// La bulle est rendue dans un PORTAL vers document.body : les KpiCard appliquent un
// `hover:-translate-y-px` (transform) qui crée un contexte de stacking — une bulle en `fixed`
// imbriquée serait décalée/clippée. Le portal la sort de la hiérarchie des cartes et un z-index
// très élevé la garde au-dessus de la nav, des cartes et des volets.
//
// - Survol souris (desktop) : la bulle SUIT le curseur (position `fixed` aux coordonnées souris
//   + offset), recalculée sur `mousemove`, avec clamp/flip pour rester entièrement dans le viewport.
// - Focus clavier / tap tactile : pas de curseur → la bulle s'ancre de façon STABLE sous l'icône
//   (toggle d'affichage au tap).
const OFFSET = 14; // décalage curseur → coin de la bulle (souris)
const GAP = 6; // écart icône → bulle (focus/tap)
const MARGIN = 8; // marge minimale avec les bords du viewport
const WIDTH = 256; // largeur de la bulle (w-64) — repli avant mesure réelle

export function InfoTip({
  children,
  label = "Plus d'informations",
}: {
  children: ReactNode;
  label?: string;
}) {
  const [open, setOpen] = useState(false); // tap (toggle tactile)
  const [hovering, setHovering] = useState(false); // survol souris
  const [focused, setFocused] = useState(false); // focus clavier
  const [mounted, setMounted] = useState(false); // portal dispo après montage (SSR-safe)
  const btnRef = useRef<HTMLButtonElement>(null);
  const tipRef = useRef<HTMLDivElement>(null);
  // Point d'ancrage : { x, y } + `cursor` (true = suit la souris, false = ancré sous l'icône).
  const [anchor, setAnchor] = useState<{ x: number; y: number; cursor: boolean }>({ x: 0, y: 0, cursor: false });
  const [pos, setPos] = useState<{ left: number; top: number }>({ left: -9999, top: -9999 });

  useEffect(() => setMounted(true), []);

  const visible = hovering || focused || open;

  // Ancrage stable sous l'icône (focus clavier / tap).
  const anchorToIcon = () => {
    const r = btnRef.current?.getBoundingClientRect();
    if (r) setAnchor({ x: r.left, y: r.bottom + GAP, cursor: false });
  };

  // Recalcule la position clampée/flippée dès que la bulle est visible ou que l'ancrage bouge.
  // `useLayoutEffect` → mesure + placement avant peinture (pas de flash à l'apparition).
  useLayoutEffect(() => {
    if (!visible) return;
    const el = tipRef.current;
    const w = el?.offsetWidth || WIDTH;
    const h = el?.offsetHeight || 0;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    let left = anchor.cursor ? anchor.x + OFFSET : anchor.x;
    let top = anchor.cursor ? anchor.y + OFFSET : anchor.y;

    // Flip près du bord droit / bas.
    if (left + w + MARGIN > vw) left = anchor.cursor ? anchor.x - w - OFFSET : vw - w - MARGIN;
    if (top + h + MARGIN > vh) {
      const r = btnRef.current?.getBoundingClientRect();
      top = anchor.cursor ? anchor.y - h - OFFSET : (r ? r.top - GAP - h : vh - h - MARGIN);
    }
    // Clamp final dans le viewport.
    left = Math.max(MARGIN, Math.min(left, vw - w - MARGIN));
    top = Math.max(MARGIN, Math.min(top, vh - h - MARGIN));
    setPos({ left, top });
  }, [visible, anchor]);

  return (
    <span className="inline-flex align-middle">
      <button
        ref={btnRef}
        type="button"
        onClick={() => {
          setOpen((o) => !o);
          anchorToIcon();
        }}
        onMouseEnter={(e) => {
          setHovering(true);
          setAnchor({ x: e.clientX, y: e.clientY, cursor: true });
        }}
        onMouseMove={(e) => setAnchor({ x: e.clientX, y: e.clientY, cursor: true })}
        onMouseLeave={() => setHovering(false)}
        onFocus={() => {
          setFocused(true);
          anchorToIcon();
        }}
        onBlur={() => setFocused(false)}
        aria-label={label}
        aria-expanded={visible}
        className="inline-flex items-center rounded-full text-ink-3 transition-colors hover:text-ink focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
      >
        <IconInfoCircle size={14} stroke={2} />
      </button>
      {mounted && visible &&
        createPortal(
          <div
            ref={tipRef}
            role="tooltip"
            style={{ position: "fixed", left: pos.left, top: pos.top, width: WIDTH, zIndex: 2147483000 }}
            className="pointer-events-none rounded-card border border-line bg-white p-3 text-xs font-normal normal-case leading-snug text-ink-2 shadow-card-hover"
          >
            {children}
          </div>,
          document.body
        )}
    </span>
  );
}
