// Types partagés (serveur ↔ client) pour la prospection (§6).
// Les entités Prisma (Decimal, Date) sont sérialisées en types simples avant
// d'être passées aux composants client : dealValue → number, dates → ISO string.

export interface CommentDTO {
  id: string;
  authorName: string | null;
  body: string;
  createdAt: string; // ISO
}

export interface ProspectDTO {
  id: string;
  stageId: string;
  /** Contact (personne) — optionnel. Le titre des cartes est la société (`company`). */
  name: string | null;
  /** Société = titre de la carte. */
  company: string | null;
  groupId: string | null;
  phone: string | null;
  email: string | null;
  reminderAt: string | null; // ISO (date)
  reminderDone: boolean;
  dealValue: number | null; // € HT estimé
  notes: string | null;
  comments: CommentDTO[];
}

export interface StageDTO {
  id: string;
  name: string;
  kind: string | null;
  prospects: ProspectDTO[];
}

export interface CurrentUserDTO {
  id: string;
  name: string | null;
  role: string; // "DIRIGEANT" | "COMMERCIAL"
}

export interface GroupDTO {
  id: string;
  name: string;
  color: string | null; // clé de palette (voir groupColor)
}

// ── Identité prospect : société = titre, contact = sous-titre ──

/** Titre d'affichage d'un prospect = la société. Repli sur le contact, puis libellé générique. */
export function prospectTitle(p: { company: string | null; name: string | null }): string {
  return p.company?.trim() || p.name?.trim() || "Société à renseigner";
}

/**
 * Sous-titre = le contact (`name`). « Contact à renseigner » s'il est vide.
 * Renvoie "" si la société manque (le contact sert alors de titre — pas de redite).
 */
export function prospectContactLabel(p: { company: string | null; name: string | null }): string {
  if (!p.company?.trim()) return "";
  return p.name?.trim() || "Contact à renseigner";
}

// ── Helpers d'affichage (purs — utilisables serveur & client) ──

export function formatEuro(n: number | null): string | null {
  if (n == null) return null;
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n);
}

export function formatDateFR(iso: string | null): string | null {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });
}

export type ReminderStatus = "none" | "done" | "overdue" | "soon" | "scheduled";

export function reminderStatus(
  reminderAt: string | null,
  done: boolean,
  now: number = Date.now()
): ReminderStatus {
  if (!reminderAt) return "none";
  if (done) return "done";
  const t = new Date(reminderAt).getTime();
  const DAY = 86_400_000;
  if (t < now) return "overdue";
  if (t < now + 7 * DAY) return "soon";
  return "scheduled";
}

/** Pour <input type="date"> : ISO → `yyyy-mm-dd`. */
export function isoToDateInput(iso: string | null): string {
  if (!iso) return "";
  return new Date(iso).toISOString().slice(0, 10);
}

/** `yyyy-mm-dd` à partir d'aujourd'hui + n jours (pour « Reporter »). */
export function dateInDays(n: number): string {
  return new Date(Date.now() + n * 86_400_000).toISOString().slice(0, 10);
}

/** Un prospect enrichi de sa colonne (pour les vues Liste & Agenda). */
export interface ProspectRow extends ProspectDTO {
  stageName: string;
  stageKind: string | null;
}

/** Classe du badge « Température » selon le `kind` de la colonne. */
export function temperatureBadgeClass(kind: string | null): string {
  switch (kind) {
    case "cold":
      return "bg-sky-100 text-sky-700";
    case "warm":
      return "bg-amber-100 text-amber-700";
    case "hot":
      return "bg-orange-100 text-orange-700";
    case "meet":
      return "bg-cyan/25 text-navy";
    case "won":
      return "bg-emerald-100 text-emerald-700";
    case "lost":
      return "bg-navy/10 text-navy/50";
    default:
      return "bg-navy/10 text-navy/60";
  }
}

// ── KPI / catégories (à partir du `kind` de la colonne) ──

// Catégories granulaires (à partir du `kind` des 7 statuts).
export type KpiCategory =
  | "a_rencontrer" // À rencontrer (meet)
  | "rencontres" // Chaud / Tiède / Froid
  | "a_installer" // À installer (signé, en cours)
  | "installes" // Clients installés
  | "refus"; // Refus

export function categoryOf(kind: string | null): KpiCategory | null {
  switch (kind) {
    case "meet":
      return "a_rencontrer";
    case "hot":
    case "warm":
    case "cold":
    case "low":
      return "rencontres";
    case "to_install":
      return "a_installer";
    case "won":
      return "installes";
    case "lost":
      return "refus";
    default:
      return null;
  }
}

// ── Couleurs de groupe (par clé de palette) ──

export interface GroupColor {
  band: string;
  border: string;
  text: string;
  dot: string;
  swatch: string;
}

const GROUP_PALETTE: Record<string, GroupColor> = {
  sky: { band: "bg-sky-50", border: "border-sky-200", text: "text-sky-800", dot: "bg-sky-400", swatch: "bg-sky-400" },
  amber: { band: "bg-amber-50", border: "border-amber-200", text: "text-amber-800", dot: "bg-amber-400", swatch: "bg-amber-400" },
  emerald: { band: "bg-emerald-50", border: "border-emerald-200", text: "text-emerald-800", dot: "bg-emerald-400", swatch: "bg-emerald-400" },
  violet: { band: "bg-violet-50", border: "border-violet-200", text: "text-violet-800", dot: "bg-violet-400", swatch: "bg-violet-400" },
  rose: { band: "bg-rose-50", border: "border-rose-200", text: "text-rose-800", dot: "bg-rose-400", swatch: "bg-rose-400" },
  cyan: { band: "bg-cyan/15", border: "border-cyan/40", text: "text-navy", dot: "bg-cyan", swatch: "bg-cyan" },
};

export const GROUP_COLOR_KEYS = Object.keys(GROUP_PALETTE);

const GROUP_NONE: GroupColor = {
  band: "bg-navy/[0.04]",
  border: "border-navy/10",
  text: "text-navy/60",
  dot: "bg-navy/30",
  swatch: "bg-navy/30",
};

/** Couleur d'un groupe à partir de sa clé de palette (fallback : déterministe par clé/nom). */
export function groupColor(key: string | null): GroupColor {
  if (!key) return GROUP_NONE;
  if (GROUP_PALETTE[key]) return GROUP_PALETTE[key];
  let h = 0;
  for (let i = 0; i < key.length; i++) h = (h * 31 + key.charCodeAt(i)) >>> 0;
  return Object.values(GROUP_PALETTE)[h % GROUP_COLOR_KEYS.length];
}

/** Pastille de couleur d'un statut (température), pour les menus de changement de statut. */
export function temperatureDotClass(kind: string | null): string {
  switch (kind) {
    case "cold":
      return "bg-sky-400";
    case "warm":
      return "bg-amber-400";
    case "hot":
      return "bg-orange-400";
    case "meet":
      return "bg-cyan";
    case "won":
      return "bg-emerald-400";
    case "to_install":
      return "bg-sky-500";
    case "lost":
      return "bg-navy/40";
    default:
      return "bg-navy/30";
  }
}

/** Couleur de la pastille de rappel selon l'urgence. */
export function reminderDotClass(status: ReminderStatus): string {
  switch (status) {
    case "overdue":
      return "bg-red-500";
    case "soon":
      return "bg-amber-500";
    case "scheduled":
      return "bg-navy/30";
    case "done":
      return "bg-emerald-500";
    default:
      return "bg-transparent";
  }
}
