// Squelette de la page de connexion. Indispensable : sans lui, /login hériterait du
// squelette du Cockpit (app/loading.tsx) → mauvais visuel. Mime la carte centrée du login.
export default function Loading() {
  return (
    <main className="flex flex-1 items-center justify-center bg-navy px-6 py-16">
      <div className="w-full max-w-sm rounded-2xl bg-white p-8 shadow-xl">
        <div className="mx-auto h-7 w-28 animate-pulse rounded bg-navy/10" />
        <div className="mx-auto mt-6 h-5 w-40 animate-pulse rounded bg-navy/10" />
        <div className="mx-auto mt-2 h-3 w-52 animate-pulse rounded bg-navy/10" />
        <div className="mt-6 space-y-3">
          <div className="h-11 w-full animate-pulse rounded-lg bg-navy/10" />
          <div className="h-11 w-full animate-pulse rounded-lg bg-navy/15" />
        </div>
      </div>
    </main>
  );
}
