// Logo « LYNOVA » — le « Y » en cyan (§7). Couleur du texte héritée (currentColor)
// pour s'adapter au fond (blanc sur barre bleu nuit, bleu nuit sur fond clair).
export function Logo({ className = "" }: { className?: string }) {
  return (
    <span
      className={`font-bold tracking-[0.15em] select-none ${className}`}
      aria-label="LYNOVA"
    >
      L<span className="text-cyan">Y</span>NOVA
    </span>
  );
}
