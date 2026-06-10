import Link from "next/link";
import { Logo } from "@/components/Logo";
import { requireUser } from "@/lib/auth";
import { isSupabaseConfigured } from "@/lib/supabase/config";

// Page authentifiée : dépend de la session (cookies) → jamais de cache statique.
export const dynamic = "force-dynamic";

const ROLE_LABEL: Record<string, string> = {
  DIRIGEANT: "Dirigeant",
  COMMERCIAL: "Commercial",
};

export default async function Home() {
  // Mode bootstrap : tant que Supabase n'est pas configuré, on affiche les instructions.
  if (!isSupabaseConfigured()) {
    return <NotConfigured />;
  }

  // Contrôle serveur (le middleware protège déjà, mais §3 : jamais que l'UI).
  const user = await requireUser();

  return (
    <main className="flex flex-1 flex-col">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
          <Logo className="text-lg text-white" />
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-white/70 sm:inline">
              {user.email}
            </span>
            <span className="rounded-full bg-cyan/20 px-2.5 py-1 text-xs font-medium text-cyan">
              {ROLE_LABEL[user.role] ?? user.role}
            </span>
            {user.role === "DIRIGEANT" && (
              <Link
                href="/admin"
                className="rounded-md border border-white/20 px-3 py-1.5 text-sm text-white/90 hover:bg-white/10"
              >
                Administration
              </Link>
            )}
            <form action="/auth/signout" method="post">
              <button
                type="submit"
                className="rounded-md border border-white/20 px-3 py-1.5 text-sm text-white/90 hover:bg-white/10"
              >
                Se déconnecter
              </button>
            </form>
          </div>
        </div>
      </header>

      <section className="mx-auto w-full max-w-5xl flex-1 px-6 py-12">
        <p className="text-sm font-medium uppercase tracking-wide text-cyan-600">
          Étape 2 — Authentification
        </p>
        <h1 className="mt-2 text-3xl font-semibold text-navy">
          Bonjour {user.name ?? user.email}
        </h1>
        <p className="mt-3 max-w-2xl text-navy/70">
          Vous êtes connecté avec le rôle{" "}
          <strong className="text-navy">{ROLE_LABEL[user.role] ?? user.role}</strong>.
          Les vues Cockpit, Trésorerie, Facturation et Prospection seront construites
          aux étapes suivantes (le cloisonnement par rôle est déjà appliqué côté serveur).
        </p>

        <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-navy/10 bg-white p-5 shadow-sm">
            <p className="font-medium text-navy">Cockpit</p>
            <p className="mt-1 text-sm text-navy/50">À venir</p>
          </div>
          {user.role === "DIRIGEANT" ? (
            <>
              <Link
                href="/tresorerie"
                className="rounded-xl border border-navy/10 bg-white p-5 shadow-sm transition-colors hover:border-cyan/60"
              >
                <p className="font-medium text-navy">Trésorerie</p>
                <p className="mt-1 text-sm text-cyan-600">Ouvrir →</p>
              </Link>
              <Link
                href="/facturation"
                className="rounded-xl border border-navy/10 bg-white p-5 shadow-sm transition-colors hover:border-cyan/60"
              >
                <p className="font-medium text-navy">Facturation</p>
                <p className="mt-1 text-sm text-cyan-600">Ouvrir →</p>
              </Link>
            </>
          ) : (
            <>
              <div className="rounded-xl border border-navy/10 bg-white p-5 shadow-sm">
                <p className="font-medium text-navy">Trésorerie</p>
                <p className="mt-1 text-sm text-navy/50">Réservé direction</p>
              </div>
              <div className="rounded-xl border border-navy/10 bg-white p-5 shadow-sm">
                <p className="font-medium text-navy">Facturation</p>
                <p className="mt-1 text-sm text-navy/50">Réservé direction</p>
              </div>
            </>
          )}
          <Link
            href="/prospection"
            className="rounded-xl border border-navy/10 bg-white p-5 shadow-sm transition-colors hover:border-cyan/60"
          >
            <p className="font-medium text-navy">Prospection</p>
            <p className="mt-1 text-sm text-cyan-600">Ouvrir le pipeline →</p>
          </Link>
        </div>
      </section>
    </main>
  );
}

function NotConfigured() {
  const steps = [
    "Créer un projet Supabase puis remplir DATABASE_URL et DIRECT_URL dans .env.local.",
    "Renseigner NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY et SUPABASE_SERVICE_ROLE_KEY.",
    "Lancer `npm run db:migrate` pour créer le schéma.",
    "Lancer `npm run seed:users` pour créer le compte dirigeant.",
    "Redémarrer `npm run dev` : l'authentification et le cloisonnement s'activent.",
  ];
  return (
    <main className="flex flex-1 items-center justify-center px-6 py-16">
      <div className="w-full max-w-xl rounded-2xl border border-navy/10 bg-white p-8 shadow-sm">
        <Logo className="text-2xl text-navy" />
        <h1 className="mt-6 text-xl font-semibold text-navy">
          Configuration requise
        </h1>
        <p className="mt-2 text-sm text-navy/70">
          L&apos;ossature est en place. Renseignez les secrets pour activer
          l&apos;application (mode bootstrap actif).
        </p>
        <ol className="mt-6 space-y-3">
          {steps.map((s, i) => (
            <li key={i} className="flex gap-3 text-sm text-navy/80">
              <span className="flex h-6 w-6 flex-none items-center justify-center rounded-full bg-cyan/30 text-xs font-semibold text-navy">
                {i + 1}
              </span>
              <span>{s}</span>
            </li>
          ))}
        </ol>
      </div>
    </main>
  );
}
