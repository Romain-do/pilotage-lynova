"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireUser, requireDirigeant } from "@/lib/auth";
import type { ProspectDTO, CommentDTO, GroupDTO } from "@/lib/prospection";
import { mapProspect, mapComment } from "@/lib/prospection-map";

// Server actions de la prospection (§6). Accessibles aux DEUX rôles (lecture + écriture)
// → garde requireUser (et non requireDirigeant). Chaque action re-vérifie l'auth
// (joignable en POST direct). Aucune suppression physique : archivage logique.

const STEP = 1024;

/** Parse un champ texte de formulaire en chaîne propre ou null. */
function str(v: FormDataEntryValue | null, max = 500): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  return t.length ? t.slice(0, max) : null;
}

/** Parse une date `yyyy-mm-dd` (input date) en Date, ou null. */
function parseDate(v: FormDataEntryValue | null): Date | null {
  if (typeof v !== "string" || !v) return null;
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Création rapide d'un prospect (saisie de la SOCIÉTÉ = titre, dans une colonne). */
export async function createProspect(formData: FormData): Promise<ProspectDTO | null> {
  const me = await requireUser();

  const stageId = str(formData.get("stageId"), 64);
  const company = str(formData.get("company"), 200);
  if (!stageId || !company) return null;

  // Position : à la fin de la colonne.
  const last = await prisma.prospect.findFirst({
    where: { stageId, archived: false },
    orderBy: { position: "desc" },
    select: { position: true },
  });

  const created = await prisma.prospect.create({
    data: {
      stageId,
      company,
      position: (last?.position ?? 0) + STEP,
      createdById: me.id,
    },
    include: { comments: true },
  });

  revalidatePath("/prospection");
  return mapProspect(created);
}

/** Édition de la fiche prospect (panneau latéral). */
export async function updateProspect(formData: FormData): Promise<ProspectDTO | null> {
  await requireUser();

  const id = str(formData.get("id"), 64);
  const company = str(formData.get("company"), 200); // société = titre, requis
  if (!id || !company) return null;

  const genreRaw = str(formData.get("genre"), 10);
  const updated = await prisma.prospect.update({
    where: { id },
    data: {
      company,
      genre: genreRaw === "Mr" || genreRaw === "Mme" ? genreRaw : null, // contact : civilité
      nom: str(formData.get("nom"), 120),
      prenom: str(formData.get("prenom"), 120),
      groupId: str(formData.get("groupId"), 64),
      phone: str(formData.get("phone"), 50),
      email: str(formData.get("email"), 200),
      notes: str(formData.get("notes"), 5000),
      reminderAt: parseDate(formData.get("reminderAt")),
      reminderDone: formData.get("reminderDone") === "on",
    },
    include: { comments: true },
  });

  revalidatePath("/prospection");
  return mapProspect(updated);
}

/** Déplace un prospect (drag & drop). `beforeId` = carte devant laquelle insérer, ou null = fin. */
export async function moveProspect(
  prospectId: string,
  toStageId: string,
  beforeId: string | null
): Promise<void> {
  await requireUser();

  const siblings = (
    await prisma.prospect.findMany({
      where: { stageId: toStageId, archived: false },
      orderBy: { position: "asc" },
      select: { id: true, position: true },
    })
  ).filter((s) => s.id !== prospectId);

  let newPos: number;
  const idx = beforeId ? siblings.findIndex((s) => s.id === beforeId) : -1;

  if (!beforeId || idx === -1) {
    newPos = (siblings[siblings.length - 1]?.position ?? 0) + STEP;
  } else {
    const before = siblings[idx];
    const prev = siblings[idx - 1];
    const prevPos = prev ? prev.position : before.position - 2 * STEP;
    newPos = (prevPos + before.position) / 2;
  }

  await prisma.prospect.update({
    where: { id: prospectId },
    data: { stageId: toStageId, position: newPos },
  });
  revalidatePath("/prospection");
}

/** Ajoute un commentaire horodaté et signé. */
export async function addComment(prospectId: string, body: string): Promise<CommentDTO | null> {
  const me = await requireUser();
  const clean = body.trim();
  if (!clean) return null;

  const created = await prisma.comment.create({
    data: {
      prospectId,
      authorId: me.id,
      authorName: me.name ?? me.email,
      body: clean.slice(0, 5000),
    },
  });

  revalidatePath("/prospection");
  return mapComment(created);
}

/** Marque la relance faite / à refaire (bouton « Fait » de l'agenda). */
export async function toggleReminderDone(
  prospectId: string,
  done: boolean
): Promise<ProspectDTO | null> {
  await requireUser();
  const updated = await prisma.prospect.update({
    where: { id: prospectId },
    data: { reminderDone: done },
    include: { comments: true },
  });
  revalidatePath("/prospection");
  return mapProspect(updated);
}

/** Reprogramme la date de rappel (bouton « Reporter » de l'agenda). null = retire le rappel. */
export async function setReminder(
  prospectId: string,
  dateISO: string | null
): Promise<ProspectDTO | null> {
  await requireUser();
  const reminderAt = dateISO ? parseDate(dateISO) : null;
  const updated = await prisma.prospect.update({
    where: { id: prospectId },
    // Reporter une relance la « rouvre » (plus considérée comme faite).
    data: { reminderAt, reminderDone: false },
    include: { comments: true },
  });
  revalidatePath("/prospection");
  return mapProspect(updated);
}

/** Archive un prospect (logique — jamais de suppression physique, §6/§3). */
export async function archiveProspect(prospectId: string): Promise<void> {
  await requireUser();
  await prisma.prospect.update({ where: { id: prospectId }, data: { archived: true } });
  revalidatePath("/prospection");
}

/**
 * Retrait d'un prospect par le DIRIGEANT : ARCHIVAGE LOGIQUE uniquement (§8 — aucune
 * suppression physique). La donnée est conservée en base (archived = true), juste retirée
 * des listes. RÉSERVÉE AU DIRIGEANT — garde CÔTÉ SERVEUR (§3) ; le COMMERCIAL est rejeté
 * même par appel direct.
 */
export async function deleteProspect(prospectId: string): Promise<void> {
  await requireDirigeant();
  await prisma.prospect.update({ where: { id: prospectId }, data: { archived: true } });
  revalidatePath("/prospection");
}

/** Crée un pipeline de démarrage (les 7 statuts) quand aucun n'existe. */
export async function createStarterPipeline(): Promise<void> {
  await requireUser();

  const existing = await prisma.pipeline.findFirst({ where: { archived: false } });
  if (existing) return;

  // Les 7 statuts (ordre + `kind` pour le mapping KPI).
  const starterStages = [
    { name: "À rencontrer", kind: "meet" },
    { name: "Chaud", kind: "hot" },
    { name: "Tiède", kind: "warm" },
    { name: "Froid", kind: "cold" },
    { name: "À installer", kind: "to_install" },
    { name: "Clients installés", kind: "won" },
    { name: "Refus", kind: "lost" },
  ];

  await prisma.pipeline.create({
    data: {
      name: "Pipeline commercial",
      stages: { create: starterStages.map((s, i) => ({ ...s, position: i })) },
    },
  });
  revalidatePath("/prospection");
}

// ───────────────────────── Groupes ─────────────────────────

/** Crée un groupe (nom + couleur de palette). */
export async function createGroup(name: string, color: string | null): Promise<GroupDTO | null> {
  await requireUser();
  const clean = name.trim();
  if (!clean) return null;
  const g = await prisma.group.create({ data: { name: clean.slice(0, 120), color } });
  revalidatePath("/prospection");
  return { id: g.id, name: g.name, color: g.color };
}

/** Renomme / recolore un groupe. */
export async function updateGroup(
  id: string,
  name: string,
  color: string | null
): Promise<GroupDTO | null> {
  await requireUser();
  const clean = name.trim();
  if (!clean) return null;
  const g = await prisma.group.update({
    where: { id },
    data: { name: clean.slice(0, 120), color },
  });
  revalidatePath("/prospection");
  return { id: g.id, name: g.name, color: g.color };
}

/** Supprime un groupe (les prospects sont conservés, leur groupe passe à « aucun »). */
export async function deleteGroup(id: string): Promise<void> {
  await requireUser();
  await prisma.group.delete({ where: { id } }); // onDelete: SetNull côté prospect
  revalidatePath("/prospection");
}

/** Assigne (ou retire si groupId=null) un groupe à plusieurs prospects d'un coup. */
export async function assignGroup(
  prospectIds: string[],
  groupId: string | null
): Promise<void> {
  await requireUser();
  if (prospectIds.length === 0) return;
  await prisma.prospect.updateMany({
    where: { id: { in: prospectIds } },
    data: { groupId },
  });
  revalidatePath("/prospection");
}
