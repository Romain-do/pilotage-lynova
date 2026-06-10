import type { PrismaClient } from "@prisma/client";

const SOURCES = ["evoliz", "evoliz_buys", "revolut"];

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
