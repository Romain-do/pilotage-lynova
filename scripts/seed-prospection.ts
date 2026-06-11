/**
 * Données de démo pour la prospection native (§6).
 *
 * Crée un pipeline « Pipeline commercial » avec les 7 statuts, quelques groupes
 * et des prospects de démonstration (rappels, commentaires, groupes).
 * Idempotent : si un pipeline existe déjà, le script n'ajoute pas de doublons.
 *
 * Lancer :  npm run seed:prospection
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const DAY = 86_400_000;
function inDays(n: number): Date {
  return new Date(Date.now() + n * DAY);
}

const STAGES = [
  { name: "À rencontrer", kind: "meet" },
  { name: "Chaud", kind: "hot" },
  { name: "Tiède", kind: "warm" },
  { name: "Froid", kind: "cold" },
  { name: "À installer", kind: "to_install" },
  { name: "Clients installés", kind: "won" },
  { name: "Refus", kind: "lost" },
];

const GROUPS = [
  { name: "Commerces de bouche", color: "emerald" },
  { name: "Restauration", color: "amber" },
  { name: "Réseau Bio", color: "sky" },
];

async function main() {
  const existing = await prisma.pipeline.findFirst({ where: { archived: false } });
  if (existing) {
    console.log(`• Pipeline déjà présent (« ${existing.name} ») — aucun doublon créé.`);
    return;
  }

  const author = await prisma.user.findFirst({
    where: { role: "DIRIGEANT", active: true },
    select: { id: true, name: true },
  });
  const authorId = author?.id ?? null;
  const authorName = author?.name ?? "Romain";

  const pipeline = await prisma.pipeline.create({
    data: {
      name: "Pipeline commercial",
      stages: { create: STAGES.map((s, i) => ({ ...s, position: i })) },
    },
    include: { stages: true },
  });

  const groupIdByName = new Map<string, string>();
  for (const g of GROUPS) {
    const created = await prisma.group.create({ data: { name: g.name, color: g.color } });
    groupIdByName.set(g.name, created.id);
  }

  const stage = (name: string) => {
    const s = pipeline.stages.find((x) => x.name === name);
    if (!s) throw new Error(`Colonne introuvable : ${name}`);
    return s.id;
  };

  type Demo = {
    stageName: string;
    name: string;
    company?: string;
    group?: string;
    contact?: string;
    phone?: string;
    email?: string;
    reminderAt?: Date;
    notes?: string;
    comments?: string[];
  };

  const demos: Demo[] = [
    {
      stageName: "À rencontrer",
      name: "Boucherie Martin",
      company: "Boucherie Martin SARL",
      group: "Commerces de bouche",
      reminderAt: inDays(-3),
      notes: "Rencontré au salon. Intéressé par la formule abonnement.",
      comments: ["Relance à faire — laissé un message vocal."],
    },
    { stageName: "À rencontrer", name: "Primeur du Coin", group: "Commerces de bouche" },
    {
      stageName: "Chaud",
      name: "Restaurant Le Gourmet",
      group: "Restauration",
      phone: "06 12 34 56 78",
      email: "paul@legourmet.fr",
      reminderAt: inDays(2),
      comments: ["Premier échange positif, attend une démo."],
    },
    {
      stageName: "Tiède",
      name: "Épicerie Bio Nature",
      company: "Bio Nature",
      group: "Réseau Bio",
      reminderAt: inDays(10),
    },
    {
      stageName: "À installer",
      name: "Traiteur Délices",
      group: "Restauration",
      reminderAt: inDays(1),
      notes: "Signé ! Installation à planifier.",
      comments: ["Contrat signé le 5.", "Caler la date d'installation."],
    },
    { stageName: "Clients installés", name: "Fromagerie Comté & Co", group: "Commerces de bouche" },
    {
      stageName: "Refus",
      name: "Supérette Express",
      comments: ["Parti chez un concurrent moins cher."],
    },
  ];

  let pos = 0;
  for (const d of demos) {
    pos += 1024;
    await prisma.prospect.create({
      data: {
        stageId: stage(d.stageName),
        groupId: d.group ? groupIdByName.get(d.group) ?? null : null,
        name: d.name,
        company: d.company ?? null,
        phone: d.phone ?? null,
        email: d.email ?? null,
        reminderAt: d.reminderAt ?? null,
        notes: d.notes ?? null,
        position: pos,
        createdById: authorId,
        comments: d.comments
          ? { create: d.comments.map((body) => ({ body, authorId, authorName })) }
          : undefined,
      },
    });
  }

  console.log(
    `✔ Pipeline « ${pipeline.name} » : ${STAGES.length} statuts, ${GROUPS.length} groupes, ${demos.length} prospects de démo.`
  );
}

main()
  .catch((e) => {
    console.error("Échec du seed prospection :", e instanceof Error ? e.message : e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
