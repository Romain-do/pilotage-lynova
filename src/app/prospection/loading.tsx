import { NavSkeleton, TableSkeleton, Sk } from "@/components/Skeleton";

// Squelette Prospection (vue Liste par défaut) : nav · onglets de vue · bande KPI (6) ·
// filtres · 2 colonnes (« À recontacter » + tableau).
export default function Loading() {
  return (
    <main className="flex flex-1 flex-col bg-cloud">
      <NavSkeleton />

      {/* Onglets de vue */}
      <div className="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6">
        <div className="flex gap-2">
          <Sk className="h-9 w-24" />
          <Sk className="h-9 w-24" />
          <Sk className="h-9 w-24" />
        </div>
      </div>

      <div className="mx-auto w-full max-w-7xl flex-1 px-4 pb-12 sm:px-6">
        {/* Bande KPI connectée (6 cellules) */}
        <div className="overflow-hidden rounded-2xl border border-navy/10 shadow-sm">
          <div className="grid grid-cols-2 gap-px bg-navy/10 sm:grid-cols-3 lg:grid-cols-6">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="flex items-center gap-3 bg-white px-4 py-3.5">
                <div className="h-9 w-9 flex-none animate-pulse rounded-lg bg-navy/10" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <div className="h-5 w-10 animate-pulse rounded bg-navy/10" />
                  <div className="h-3 w-16 animate-pulse rounded bg-navy/10" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Filtres + recherche */}
        <div className="mt-4 flex flex-wrap gap-1.5">
          {Array.from({ length: 6 }).map((_, i) => (
            <Sk key={i} className="h-7 w-20 rounded-full" />
          ))}
        </div>
        <Sk className="mt-3 h-9 w-full max-w-sm" />

        {/* 2 colonnes : « À recontacter » + tableau */}
        <div className="mt-5 grid grid-cols-1 gap-5 lg:grid-cols-[20rem_minmax(0,1fr)]">
          <div className="space-y-2 rounded-2xl border border-navy/10 bg-white p-3 shadow-sm">
            <Sk className="h-4 w-28" />
            {Array.from({ length: 4 }).map((_, i) => (
              <Sk key={i} className="h-16 w-full rounded-xl" />
            ))}
          </div>
          <TableSkeleton rows={8} />
        </div>
      </div>
    </main>
  );
}
