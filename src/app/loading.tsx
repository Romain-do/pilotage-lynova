import {
  NavSkeleton,
  KpiGridSkeleton,
  CardSkeleton,
  Sk,
} from "@/components/Skeleton";

// Squelette du Cockpit (/) — affiché instantanément pendant le chargement des données.
// Reprend la structure : nav · salutation · actions · KPI finances · graphe · prospection.
export default function Loading() {
  return (
    <main className="flex flex-1 flex-col bg-cloud">
      <NavSkeleton />
      <section className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        {/* Salutation + actualiser */}
        <div className="flex items-end justify-between gap-4">
          <div className="space-y-2">
            <Sk className="h-7 w-48" />
            <Sk className="h-4 w-32" />
          </div>
          <Sk className="h-9 w-28" />
        </div>

        {/* Actions prioritaires */}
        <div className="mt-6 space-y-2">
          <Sk className="h-4 w-40" />
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Sk className="h-11" />
            <Sk className="h-11" />
          </div>
        </div>

        {/* Finances — KPI */}
        <div className="mt-6 space-y-2">
          <Sk className="h-4 w-28" />
          <KpiGridSkeleton count={8} cols="lg:grid-cols-4" />
        </div>

        {/* Graphe CA */}
        <CardSkeleton className="mt-4 h-72" />

        {/* Prospection */}
        <div className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div className="space-y-2 lg:col-span-2">
            <Sk className="h-4 w-28" />
            <KpiGridSkeleton count={4} cols="lg:grid-cols-2" />
          </div>
          <CardSkeleton className="h-64" />
        </div>
      </section>
    </main>
  );
}
