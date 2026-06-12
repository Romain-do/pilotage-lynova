import {
  NavSkeleton,
  KpiGridSkeleton,
  CardSkeleton,
  TableSkeleton,
  Sk,
} from "@/components/Skeleton";

// Squelette Trésorerie (Revolut) : nav · barre d'outils · grille KPI · graphes · soldes · tableau.
export default function Loading() {
  return (
    <main className="flex flex-1 flex-col bg-cloud">
      <NavSkeleton />
      <div className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6">
        {/* Barre d'outils */}
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-2">
            <Sk className="h-6 w-44" />
            <Sk className="h-3 w-64" />
          </div>
          <Sk className="h-9 w-64" />
        </div>

        {/* KPI */}
        <div className="mt-4">
          <KpiGridSkeleton count={5} cols="lg:grid-cols-5" />
        </div>

        {/* Graphes */}
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <CardSkeleton className="h-72 lg:col-span-2" />
          <CardSkeleton className="h-72" />
        </div>

        {/* Soldes par compte + dépenses par catégorie */}
        <CardSkeleton className="mt-4 h-40" />
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <TableSkeleton rows={5} />
          <TableSkeleton rows={5} />
        </div>
      </div>
    </main>
  );
}
