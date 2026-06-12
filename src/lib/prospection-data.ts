// Chargement MIS EN CACHE de la prospection (données globales, pas de dépendance
// utilisateur). DTO DÉJÀ sérialisés (mapProspect : dates ISO, Decimal→number) — requis
// car unstable_cache sérialise le résultat.
//
// La prospection n'a pas de synchro externe (native, depuis l'abandon de Trello) → le
// cron / refreshAll ne l'invalident PAS. Invalidation = les mutations (server actions de
// prospection/actions.ts) via updateTag("prospection") (read-your-own-writes, frais immédiat).
// Filet : revalidate 3600 s. Tag commun "prospection" → invalide /prospection ET le Cockpit.
import { unstable_cache } from "next/cache";
import { prisma } from "@/lib/prisma";
import type { StageDTO, GroupDTO } from "@/lib/prospection";
import { mapProspect } from "@/lib/prospection-map";

export interface ProspectionBoard {
  pipeline: { name: string; stages: StageDTO[] } | null;
  groups: GroupDTO[];
}

/** Pipeline complet (stages + prospects + commentaires) + groupes, pour /prospection. */
export const getProspectionBoard = unstable_cache(
  async (): Promise<ProspectionBoard> => {
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

    return {
      pipeline: pipeline
        ? {
            name: pipeline.name,
            stages: pipeline.stages.map<StageDTO>((s) => ({
              id: s.id,
              name: s.name,
              kind: s.kind,
              prospects: s.prospects.map(mapProspect),
            })),
          }
        : null,
      groups: groups.map((g) => ({ id: g.id, name: g.name, color: g.color })),
    };
  },
  ["prospection-board"],
  { tags: ["prospection"], revalidate: 3600 }
);

/** Prospect allégé pour les KPI / « À recontacter » du Cockpit. reminderAt en ISO (sérialisé). */
export interface CockpitProspect {
  id: string;
  company: string | null;
  genre: string | null;
  nom: string | null;
  prenom: string | null;
  reminderAt: string | null; // ISO
  reminderDone: boolean;
  kind: string | null; // kind de la colonne (stage)
}

/** Liste à plat des prospects actifs (champs utiles au Cockpit), pour /. */
export const getCockpitProspection = unstable_cache(
  async (): Promise<CockpitProspect[]> => {
    const pipeline = await prisma.pipeline.findFirst({
      where: { archived: false },
      orderBy: { createdAt: "asc" },
      include: {
        stages: {
          orderBy: { position: "asc" },
          include: {
            prospects: {
              where: { archived: false },
              select: {
                id: true,
                company: true,
                genre: true,
                nom: true,
                prenom: true,
                reminderAt: true,
                reminderDone: true,
              },
            },
          },
        },
      },
    });
    return (pipeline?.stages ?? []).flatMap((s) =>
      s.prospects.map((pr) => ({
        id: pr.id,
        company: pr.company,
        genre: pr.genre,
        nom: pr.nom,
        prenom: pr.prenom,
        reminderAt: pr.reminderAt ? pr.reminderAt.toISOString() : null,
        reminderDone: pr.reminderDone,
        kind: s.kind,
      }))
    );
  },
  ["cockpit-prospection"],
  { tags: ["prospection"], revalidate: 3600 }
);
