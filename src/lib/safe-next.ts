// Empêche les redirections ouvertes : n'accepte qu'un chemin interne relatif.
export function safeNext(next: string | null | undefined, fallback = "/"): string {
  if (!next) return fallback;
  // Doit commencer par "/" mais pas par "//" (URL protocole-relative) ni "/\".
  if (!next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return fallback;
  }
  return next;
}
