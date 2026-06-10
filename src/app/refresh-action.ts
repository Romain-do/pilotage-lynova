"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDirigeant } from "@/lib/auth";
import { syncEvoliz, syncEvolizBuys } from "@/lib/evoliz/sync";
import { syncRevolut } from "@/lib/revolut/sync";

/**
 * Synchro complète unifiée (bouton « Actualiser » de toutes les vues). Réservée au
 * DIRIGEANT (garde serveur). Lance séquentiellement Evoliz factures → Evoliz achats →
 * Revolut ; chaque source est isolée (try/catch) : une qui échoue ne bloque pas les
 * autres (même logique que le cron). Chaque synchro récupère les données via l'API
 * AVANT d'écrire en base → un échec laisse le cache concerné intact.
 */
export async function refreshAll(): Promise<{ ok: boolean; message: string; lastSync: string | null }> {
  await requireDirigeant();

  let inv: Awaited<ReturnType<typeof syncEvoliz>> | null = null;
  let buys: Awaited<ReturnType<typeof syncEvolizBuys>> | null = null;
  let rev: Awaited<ReturnType<typeof syncRevolut>> | null = null;

  try { inv = await syncEvoliz(prisma); } catch (e) { console.error("[refreshAll] syncEvoliz:", e instanceof Error ? e.message : e); }
  try { buys = await syncEvolizBuys(prisma); } catch (e) { console.error("[refreshAll] syncEvolizBuys:", e instanceof Error ? e.message : e); }
  try { rev = await syncRevolut(prisma); } catch (e) { console.error("[refreshAll] syncRevolut:", e instanceof Error ? e.message : e); }

  // Toutes les vues qui consomment ces caches.
  for (const path of ["/", "/facturation", "/tresorerie", "/prospection"]) revalidatePath(path);

  if (inv && buys && rev) {
    return {
      ok: true,
      message: `À jour : ${inv.invoicesCounted} factures · ${buys.buysIncluded} achats · ${rev.txCount} transactions.`,
      lastSync: new Date().toISOString(),
    };
  }

  const etat = [
    inv ? "factures ✓" : "factures ✗",
    buys ? "achats ✓" : "achats ✗",
    rev ? "trésorerie ✓" : "trésorerie ✗",
  ].join(" · ");
  return { ok: false, message: `Synchronisation incomplète (${etat}). Réessayez.`, lastSync: null };
}
