import Link from "next/link";
import { Logo } from "@/components/Logo";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { mapProspect } from "@/lib/prospection-map";
import type { StageDTO, GroupDTO } from "@/lib/prospection";
import { Prospection } from "./Prospection";
import { createStarterPipeline } from "./actions";

// Prospection native (§6) — accessible aux deux rôles.
export const dynamic = "force-dynamic";

export default async function ProspectionPage() {
  const me = await requireUser();

  const [pipeline, groups] = await Promise.all([
    prisma.pipeline.findFirst({
      where: { archived: false },
      orderBy: { createdAt: "asc" },
      include: {
        stages: {
          orderBy: { position: "asc" },
          include: {
            prospects: {
              where: { archived: false },
              orderBy: { position: "asc" },
              include: { comments: true },
            },
          },
        },
      },
    }),
    prisma.group.findMany({ orderBy: { name: "asc" } }),
  ]);

  const groupDTOs: GroupDTO[] = groups.map((g) => ({ id: g.id, name: g.name, color: g.color }));

  return (
    <main className="flex flex-1 flex-col bg-cloud">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-4">
            <Link href="/">
              <Logo className="text-lg text-white" />
            </Link>
            <span className="text-sm text-white/50">/ Prospection</span>
          </div>
          <Link
            href="/"
            className="rounded-md border border-white/20 px-3 py-1.5 text-sm text-white/90 hover:bg-white/10"
          >
            ← Cockpit
          </Link>
        </div>
      </header>

      {!pipeline ? (
        <EmptyState />
      ) : (
        <Prospection
          pipelineName={pipeline.name}
          currentUser={{ id: me.id, name: me.name, role: me.role }}
          initialGroups={groupDTOs}
          initialStages={pipeline.stages.map<StageDTO>((s) => ({
            id: s.id,
            name: s.name,
            kind: s.kind,
            prospects: s.prospects.map(mapProspect),
          }))}
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
