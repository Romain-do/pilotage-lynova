"use client";

// Error boundary global (§ robustesse). Capture toute erreur non gérée d'un segment — loader
// Supabase/Evoliz/Revolut indisponible, dépassement de `maxDuration`, etc. — et propose un nouvel
// essai au lieu d'un écran cassé. `reset()` relance le rendu du segment côté client.
import { useEffect } from "react";
import { IconAlertTriangle, IconRefresh } from "@tabler/icons-react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Trace côté client (console + remontée éventuelle). Le détail serveur reste masqué à l'utilisateur.
    console.error(error);
  }, [error]);

  return (
    <main className="flex flex-1 items-center justify-center bg-cloud px-6 py-16">
      <div className="w-full max-w-md rounded-card border border-line bg-white p-8 text-center shadow-card">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-50 text-red-600">
          <IconAlertTriangle size={24} stroke={2} />
        </span>
        <h1 className="mt-5 text-lg font-semibold text-ink">Une erreur est survenue</h1>
        <p className="mt-2 text-sm text-ink-3">
          Le chargement des données a échoué (service momentanément indisponible). Réessayez dans un instant.
        </p>
        {error.digest && <p className="mt-2 text-[11px] text-ink-3">Référence : {error.digest}</p>}
        <div className="mt-6 flex items-center justify-center gap-2">
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 rounded-card bg-navy px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-navy/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
          >
            <IconRefresh size={16} stroke={2} /> Réessayer
          </button>
          <a
            href="/"
            className="inline-flex items-center rounded-card border border-line px-4 py-2 text-sm font-medium text-ink-2 transition-colors hover:bg-cloud focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan"
          >
            Accueil
          </a>
        </div>
      </div>
    </main>
  );
}
