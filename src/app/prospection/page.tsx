import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { lastSyncAll } from "@/lib/sync-state";
import { getProspectionBoard } from "@/lib/prospection-data";
import { AppNav } from "@/components/AppNav";
import { Prospection } from "./Prospection";
import { createStarterPipeline } from "./actions";

// Prospection native (§6) — accessible aux deux rôles.
export const dynamic = "force-dynamic";
// La synchro manuelle (refreshAll, DIRIGEANT) s'exécute dans cette route → marge anti-timeout.
export const maxDuration = 60;

export default async function ProspectionPage({
  searchParams,
}: {
  searchParams: Promise<{ prospect?: string }>;
}) {
  const me = await requireUser();
  const { prospect } = await searchParams;

  const [board, lastSync] = await Promise.all([getProspectionBoard(), lastSyncAll(prisma)]);

  return (
    <main className="flex flex-1 flex-col bg-cloud">
      <AppNav role={me.role} />

      {!board.pipeline ? (
        <EmptyState />
      ) : (
        <Prospection
          pipelineName={board.pipeline.name}
          currentUser={{ id: me.id, name: me.name, role: me.role }}
          initialSelectedId={prospect ?? null}
          lastSync={lastSync}
          initialGroups={board.groups}
          initialStages={board.pipeline.stages}
        />
      )}
    </main>
  );
}

function EmptyState() {
  return (
    <section className="mx-auto flex w-full max-w-xl flex-1 flex-col items-center justify-center px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold text-navy">Aucun pipeline</h1>
      <p className="mt-2 text-navy/60">
        Créez un pipeline de démarrage avec des colonnes par défaut (À contacter, Contacté,
        Rendez-vous, Proposition, Gagné, Perdu). Vous pourrez les renommer ensuite.
      </p>
      <form action={createStarterPipeline} className="mt-6">
        <button
          type="submit"
          className="rounded-lg bg-navy px-5 py-2.5 font-medium text-white transition-colors hover:bg-navy-700"
        >
          Créer le pipeline de démarrage
        </button>
      </form>
    </section>
  );
}
