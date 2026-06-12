// Primitives de squelette de chargement (loading.tsx). Présentationnelles, sans état :
// affichées instantanément (Suspense Next) pendant que les données de la page chargent.
// Palette charte : navy / cyan / cloud, animation `animate-pulse`.

/** Bloc « pulse » générique (gris-bleu sur fond clair). */
export function Sk({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-navy/10 ${className}`} aria-hidden />;
}

/** Placeholder du bandeau de navigation (mime AppNav : barre navy + liens + actions). */
export function NavSkeleton({ maxWidth = "max-w-7xl" }: { maxWidth?: string }) {
  return (
    <header className="bg-navy" aria-hidden>
      <div className={`mx-auto flex w-full ${maxWidth} items-center justify-between gap-4 px-4 py-3 sm:px-6`}>
        <div className="flex min-w-0 items-center gap-4">
          <div className="h-6 w-24 animate-pulse rounded bg-white/20" />
          <div className="hidden items-center gap-2 md:flex">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-7 w-24 animate-pulse rounded-md bg-white/10" />
            ))}
          </div>
        </div>
        <div className="flex flex-none items-center gap-3">
          <div className="h-7 w-28 animate-pulse rounded-md bg-white/10" />
          <div className="h-7 w-28 animate-pulse rounded-md bg-white/10" />
        </div>
      </div>
    </header>
  );
}

/** Carte KPI (mime KpiCard : icône carrée + valeur + libellé). */
export function KpiCardSkeleton() {
  return (
    <div className="rounded-xl border border-navy/10 bg-white p-4 shadow-sm">
      <div className="flex items-center gap-3">
        <div className="h-9 w-9 flex-none animate-pulse rounded-lg bg-navy/10" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-5 w-2/3 animate-pulse rounded bg-navy/10" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-navy/10" />
        </div>
      </div>
    </div>
  );
}

/** Grille de cartes KPI. */
export function KpiGridSkeleton({
  count = 4,
  cols = "lg:grid-cols-4",
}: {
  count?: number;
  cols?: string;
}) {
  return (
    <div className={`grid grid-cols-2 gap-3 ${cols}`}>
      {Array.from({ length: count }).map((_, i) => (
        <KpiCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Bloc « carte » vide (graphe, panneau). */
export function CardSkeleton({ className = "h-64" }: { className?: string }) {
  return (
    <div
      className={`animate-pulse rounded-xl border border-navy/10 bg-white shadow-sm ${className}`}
      aria-hidden
    />
  );
}

/** Tableau (en-tête + lignes). */
export function TableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="overflow-hidden rounded-xl border border-navy/10 bg-white shadow-sm">
      <div className="h-10 border-b border-navy/10 bg-navy/[0.02]" />
      <div className="divide-y divide-navy/[0.06]">
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 px-4 py-3">
            <div className="h-4 w-1/3 animate-pulse rounded bg-navy/10" />
            <div className="ml-auto h-4 w-16 animate-pulse rounded bg-navy/10" />
          </div>
        ))}
      </div>
    </div>
  );
}
