import { TableSkeleton, Sk } from "@/components/Skeleton";

// Squelette Administration : en-tête navy propre à l'écran admin (Logo + retour),
// puis section (titre · carte d'invitation · carte Microsoft 365 · tableau utilisateurs).
export default function Loading() {
  return (
    <main className="flex flex-1 flex-col">
      {/* En-tête navy (spécifique à /admin, pas l'AppNav) */}
      <header className="bg-navy" aria-hidden>
        <div className="mx-auto flex w-full max-w-5xl items-center justify-between px-6 py-4">
          <div className="h-6 w-24 animate-pulse rounded bg-white/20" />
          <div className="h-8 w-36 animate-pulse rounded-md bg-white/10" />
        </div>
      </header>

      <section className="mx-auto w-full max-w-5xl flex-1 px-6 py-10">
        <Sk className="h-3 w-28" />
        <Sk className="mt-2 h-8 w-72" />
        <Sk className="mt-3 h-4 w-full max-w-2xl" />

        {/* Carte « Ajouter un utilisateur » */}
        <div className="mt-8 space-y-4 rounded-xl border border-navy/10 bg-white p-6 shadow-sm">
          <Sk className="h-5 w-48" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Sk className="h-11" />
            <Sk className="h-11" />
            <Sk className="h-11" />
          </div>
          <Sk className="h-10 w-28" />
        </div>

        {/* Carte « Agenda Microsoft 365 » */}
        <div className="mt-8 space-y-3 rounded-xl border border-navy/10 bg-white p-6 shadow-sm">
          <Sk className="h-5 w-56" />
          <Sk className="h-4 w-full max-w-xl" />
          <Sk className="h-10 w-44" />
        </div>

        {/* Tableau utilisateurs */}
        <div className="mt-8">
          <TableSkeleton rows={4} />
        </div>
      </section>
    </main>
  );
}
