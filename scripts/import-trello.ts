/**
 * Import one-shot du tableau Trello « Pipe et ventes » vers la prospection native (§6, §4.3).
 *
 *   npm run import:trello             → IMPORT À BLANC (dry-run) : affiche le mapping, n'écrit RIEN.
 *   npm run import:trello -- --commit → écrit réellement (efface la démo puis importe).
 *
 * Mapping des colonnes & groupes validé manuellement (voir LIST_MAP / groupNameOf).
 * Variables requises (.env.local) : TRELLO_API_KEY, TRELLO_TOKEN.
 */
import { config } from "dotenv";
config({ path: ".env.local" });

import { PrismaClient } from "@prisma/client";

const API_BASE = "https://api.trello.com/1";
const BOARD_NAME = "Pipe et ventes";
const COLOR_KEYS = ["sky", "amber", "emerald", "violet", "rose", "cyan"];

const key = process.env.TRELLO_API_KEY;
const token = process.env.TRELLO_TOKEN;
if (!key || !token) {
  console.error("ERREUR : TRELLO_API_KEY et TRELLO_TOKEN requis dans .env.local.");
  process.exit(1);
}
const COMMIT = process.argv.includes("--commit");

async function api<T>(path: string, query: Record<string, string | number> = {}): Promise<T> {
  const url = new URL(`${API_BASE}/${path}`);
  url.searchParams.set("key", key as string);
  url.searchParams.set("token", token as string);
  for (const [k, v] of Object.entries(query)) url.searchParams.set(k, String(v));
  const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  if (!res.ok) {
    const t = await res.text().catch(() => "");
    throw new Error(`Trello ${res.status} sur ${path}${t ? ` : ${t}` : ""}`);
  }
  return (await res.json()) as T;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Les 7 statuts cibles (ordre = position).
const STAGES = [
  { name: "À rencontrer", kind: "meet" },
  { name: "Chaud", kind: "hot" },
  { name: "Tiède", kind: "warm" },
  { name: "Froid", kind: "cold" },
  { name: "À installer", kind: "to_install" },
  { name: "Clients installés", kind: "won" },
  { name: "Refus", kind: "lost" },
] as const;
type StatutName = (typeof STAGES)[number]["name"];

// Mapping EXPLICITE (clé = nom de liste normalisé : minuscule + espaces compactés).
const LIST_MAP: Record<string, StatutName | "skip"> = {
  "a rencontrer": "À rencontrer",
  "prospects totaux": "skip",
  "en cours (chaud)": "Chaud",
  "en cours (tiède)": "Tiède",
  "en cours (froid)": "Froid",
  "signés en développement": "À installer",
  "signés et installés (après méganne)": "Clients installés",
  "signés et installés (avant meganne)": "Clients installés",
  "clients totaux actifs": "skip",
  "refus propect": "Refus",
  "ventre mou <10% succès": "Froid",
};
const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
const mapList = (name: string): StatutName | "skip" | null => LIST_MAP[norm(name)] ?? null;

// Groupes : étiquettes « Groupe X » + l'enseigne « Cruchaudet » (validé). Hors motifs de refus.
function groupNameOf(labelName: string): string | null {
  const m = labelName.match(/^\s*groupe\s*[:\-]?\s*(.+)$/i);
  if (m) return m[1].trim();
  if (norm(labelName) === "cruchaudet") return "Cruchaudet";
  return null;
}

// Cartes-EN-TÊTE (titres de colonnes), à NE PAS importer comme prospects.
const normA = (s: string) =>
  s.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ");

const HEADER_LABELS = new Set(
  [
    "A rencontrer",
    "En cours (froid)",
    "En cours (Tiède)",
    "En cours (chaud)",
    "Signés et en développement",
    "Clients",
    "Clients totaux",
    "Refus",
    "Prospects totaux",
    "Prospects rencontrés",
    "Prospects à rencontrer",
  ].map(normA)
);

/** true si la carte est un titre de colonne (nom == nom de colonne, ou libellé d'en-tête connu). */
function isHeaderCard(cardName: string, listName: string): boolean {
  const n = normA(cardName);
  return n === normA(listName) || HEADER_LABELS.has(n);
}

interface TrelloCard {
  id: string;
  name: string;
  idList: string;
  due?: string | null;
  dueComplete?: boolean;
  desc?: string;
  labels?: { id: string; name: string; color: string }[];
}
interface TrelloComment {
  date: string;
  memberCreator?: { fullName?: string };
  data?: { text?: string };
}

async function main() {
  const boards = await api<{ id: string; name: string }[]>("members/me/boards", {
    filter: "open",
    fields: "name",
  });
  const board = boards.find((b) => b.name.trim().toLowerCase() === BOARD_NAME.toLowerCase());
  if (!board) {
    console.error(`Tableau « ${BOARD_NAME} » introuvable.`);
    process.exit(1);
  }

  const [lists, cards] = await Promise.all([
    api<{ id: string; name: string }[]>(`boards/${board.id}/lists`, { filter: "open", fields: "name" }),
    api<TrelloCard[]>(`boards/${board.id}/cards`, {
      filter: "open",
      fields: "name,idList,due,dueComplete,labels,desc",
    }),
  ]);
  const listById = new Map(lists.map((l) => [l.id, l]));
  const cardsByList = new Map<string, TrelloCard[]>();
  for (const c of cards) (cardsByList.get(c.idList) ?? cardsByList.set(c.idList, []).get(c.idList)!).push(c);

  // ── Plan ──
  console.log(`\n=== IMPORT ${COMMIT ? "RÉEL" : "À BLANC"} — « ${board.name} » (${cards.length} cartes) ===\n`);
  const perStatut = new Map<StatutName, number>();
  let skipped = 0;
  let headersExcluded = 0;
  const unknown: string[] = [];
  console.log("── Colonnes → statuts (cartes-titres exclues) ──");
  for (const l of lists) {
    const cs = cardsByList.get(l.id) ?? [];
    const target = mapList(l.name);
    if (target === null) {
      unknown.push(l.name);
      console.log(`  « ${l.name} » (${cs.length}) → ❌ INCONNUE`);
      continue;
    }
    if (target === "skip") {
      skipped += cs.length;
      console.log(`  « ${l.name} » (${cs.length}) → ⏭️  ignorée`);
      continue;
    }
    const real = cs.filter((c) => !isHeaderCard(c.name, l.name)).length;
    const hdr = cs.length - real;
    headersExcluded += hdr;
    perStatut.set(target, (perStatut.get(target) ?? 0) + real);
    console.log(
      `  « ${l.name} » → ${target} : ${real} prospect(s)${hdr ? ` (${hdr} en-tête ignorée)` : ""}`
    );
  }
  console.log("\n── Total par statut (vrais prospects) ──");
  for (const s of STAGES) console.log(`  ${s.name} : ${perStatut.get(s.name) ?? 0}`);
  console.log(`\nCartes-titres exclues : ${headersExcluded}`);

  // Groupes
  const groupNames = new Set<string>();
  for (const c of cards) for (const lab of c.labels ?? []) {
    const g = lab.name ? groupNameOf(lab.name) : null;
    if (g) groupNames.add(g);
  }
  console.log(`\n── Groupes (${groupNames.size}) ──\n  ${[...groupNames].sort().join(", ")}`);

  const toImport = cards.filter((c) => {
    const ln = listById.get(c.idList)?.name ?? "";
    const t = mapList(ln);
    return t !== null && t !== "skip" && !isHeaderCard(c.name, ln);
  });
  console.log(
    `\n=== BILAN : ${toImport.length} prospects à importer · ${skipped} ignorées (colonnes) · ${headersExcluded} en-têtes ===`
  );
  if (unknown.length) {
    console.error(`\n❌ Colonnes inconnues (mapping à compléter) : ${unknown.join(", ")}`);
    process.exit(1);
  }

  if (!COMMIT) {
    console.log("\nℹ️  À BLANC : rien écrit. Relance avec --commit pour importer.");
    return;
  }

  // ── Écriture ──
  const prisma = new PrismaClient();
  try {
    const author = await prisma.user.findFirst({
      where: { role: "DIRIGEANT", active: true },
      select: { id: true },
    });

    console.log("\nEffacement de la démo…");
    await prisma.comment.deleteMany({});
    await prisma.prospect.deleteMany({});
    await prisma.stage.deleteMany({});
    await prisma.pipeline.deleteMany({});
    await prisma.group.deleteMany({});

    console.log("Création du pipeline + 7 statuts…");
    const pipeline = await prisma.pipeline.create({
      data: { name: board.name, stages: { create: STAGES.map((s, i) => ({ ...s, position: i })) } },
      include: { stages: true },
    });
    const stageId = (name: StatutName) => pipeline.stages.find((s) => s.name === name)!.id;

    console.log(`Création de ${groupNames.size} groupes…`);
    const groupId = new Map<string, string>();
    let ci = 0;
    for (const name of [...groupNames].sort()) {
      const g = await prisma.group.create({
        data: { name, color: COLOR_KEYS[ci % COLOR_KEYS.length] },
      });
      groupId.set(name, g.id);
      ci++;
    }

    console.log(`Import de ${toImport.length} cartes (+ commentaires)…`);
    const posByStage = new Map<string, number>();
    let done = 0;
    for (const c of toImport) {
      const statut = mapList(listById.get(c.idList)!.name) as StatutName;
      const sid = stageId(statut);
      const pos = (posByStage.get(sid) ?? 0) + 1024;
      posByStage.set(sid, pos);

      // Groupe de la carte (première étiquette de groupe trouvée).
      let gid: string | null = null;
      for (const lab of c.labels ?? []) {
        const gn = lab.name ? groupNameOf(lab.name) : null;
        if (gn) {
          gid = groupId.get(gn) ?? null;
          break;
        }
      }

      // Commentaires (historique Trello), du plus ancien au plus récent.
      const actions = await api<TrelloComment[]>(`cards/${c.id}/actions`, {
        filter: "commentCard",
        limit: 1000,
      });
      const comments = actions
        .filter((a) => a.data?.text)
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        .map((a) => ({
          body: a.data!.text!.slice(0, 5000),
          authorName: a.memberCreator?.fullName ?? "Trello",
          authorId: null as string | null,
          createdAt: new Date(a.date),
        }));

      await prisma.prospect.create({
        data: {
          stageId: sid,
          groupId: gid,
          company: c.name.slice(0, 200), // le nom de carte Trello = la société (= titre)
          notes: c.desc ? c.desc.slice(0, 5000) : null,
          reminderAt: c.due ? new Date(c.due) : null,
          reminderDone: c.dueComplete ?? false,
          position: pos,
          createdById: author?.id ?? null,
          comments: comments.length ? { create: comments } : undefined,
        },
      });
      done++;
      if (done % 20 === 0) console.log(`  … ${done}/${toImport.length}`);
      await sleep(120); // respect des limites Trello
    }

    console.log(`\n✔ Import terminé : ${done} prospects, ${groupNames.size} groupes, 7 statuts.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((e) => {
  console.error("Échec import Trello :", e instanceof Error ? e.message : e);
  process.exit(1);
});
