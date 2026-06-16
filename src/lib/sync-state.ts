import type { PrismaClient } from "@prisma/client";

const SOURCES = ["evoliz", "evoliz_buys", "revolut"];

// Au-delà de ce délai sans synchro réussie, une source est considérée « périmée ». Le cron est
// horaire → 3 h = 3 fenêtres ratées (anomalie probable). Réglable.
export const STALE_AFTER_MS = 3 * 60 * 60 * 1000;

/**
 * « Dernière synchro » globale = la plus ANCIENNE des trois sources (Evoliz factures,
 * Evoliz achats, Revolut). Reflète la fraîcheur réelle du cache : tout est à jour
 * depuis au moins cette date. Renvoie null si aucune synchro n'a encore eu lieu.
 */
export async function lastSyncAll(prisma: PrismaClient): Promise<string | null> {
  const rows = await prisma.syncState.findMany({ where: { source: { in: SOURCES } } });
  const times = rows.map((r) => r.lastSyncAt).filter((d): d is Date => d != null).map((d) => d.getTime());
  return times.length ? new Date(Math.min(...times)).toISOString() : null;
}

/** Fraîcheur d'UNE source : dernière réussite (ISO) + indicateur de péremption (> STALE_AFTER_MS). */
export interface SourceFreshness {
  at: string | null;
  stale: boolean;
}
/** Fraîcheur par SOURCE LOGIQUE consommée par les indicateurs composites (marge nette = Evoliz × Revolut).
 *  `evoliz` agrège factures + achats : on retient leur réussite la plus ANCIENNE (la moins fraîche). */
export interface Freshness {
  evoliz: SourceFreshness;
  revolut: SourceFreshness;
}

/**
 * Fraîcheur PAR SOURCE (dernière réussite déjà stockée dans SyncState — l'upsert ne tourne qu'en
 * fin de sync réussie). Sert à : (1) afficher la maj de chaque source distinctement, (2) marquer
 * les indicateurs croisés « partiellement à jour » si une source est périmée. `now` injectable.
 */
export async function sourceFreshness(prisma: PrismaClient, now: number = Date.now()): Promise<Freshness> {
  const rows = await prisma.syncState.findMany({ where: { source: { in: SOURCES } } });
  const at = (src: string) => rows.find((r) => r.source === src)?.lastSyncAt ?? null;
  // Evoliz = factures + achats : périmé dès que l'une des deux manque ou est trop vieille.
  const evolizParts = [at("evoliz"), at("evoliz_buys")];
  const evolizAt = evolizParts.some((d) => d == null)
    ? null
    : new Date(Math.min(...evolizParts.map((d) => (d as Date).getTime())));
  const mk = (d: Date | null): SourceFreshness => ({
    at: d ? d.toISOString() : null,
    stale: d == null || now - d.getTime() > STALE_AFTER_MS,
  });
  return { evoliz: mk(evolizAt), revolut: mk(at("revolut")) };
}

/** Libellé court des sources périmées (« Revolut », « Evoliz et Revolut »…) ou null si tout est frais. */
export function staleSourcesLabel(f: Freshness): string | null {
  const names: string[] = [];
  if (f.evoliz.stale) names.push("Evoliz");
  if (f.revolut.stale) names.push("Revolut");
  return names.length ? names.join(" et ") : null;
}
