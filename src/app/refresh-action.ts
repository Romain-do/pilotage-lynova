"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDirigeant } from "@/lib/auth";
import { syncEvoliz, syncEvolizBuys } from "@/lib/evoliz/sync";
import { syncRevolut } from "@/lib/revolut/sync";

async function runSafe<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (e) {
    console.error(`[refreshAll] ${label}:`, e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Synchro complète unifiée (bouton « Actualiser » de toutes les vues). Réservée au
 * DIRIGEANT (garde serveur). Les trois sources tournent EN PARALLÈLE (Promise.all),
 * chacune isolée : une qui échoue ne bloque pas les autres (même logique que le cron).
 * Evoliz = balayage complet groupé (createMany) ; Revolut = incrémental. Mesure la durée.
 */
export async function refreshAll(): Promise<{ ok: boolean; message: string; lastSync: string | null }> {
  await requireDirigeant();
  const t0 = Date.now();

  const [inv, buys, rev] = await Promise.all([
    runSafe("syncEvoliz", () => syncEvoliz(prisma)),
    runSafe("syncEvolizBuys", () => syncEvolizBuys(prisma)),
    runSafe("syncRevolut", () => syncRevolut(prisma)),
  ]);

  // Toutes les vues qui consomment ces caches.
  for (const path of ["/", "/facturation", "/tresorerie", "/prospection"]) revalidatePath(path);

  const secs = ((Date.now() - t0) / 1000).toFixed(1);

  if (inv && buys && rev) {
    const nv = rev.newTx > 0 ? `${rev.newTx} nouvelle${rev.newTx > 1 ? "s" : ""} tx` : "0 nouvelle tx";
    return {
      ok: true,
      message: `À jour en ${secs} s : ${inv.invoicesCounted} factures · ${buys.buysIncluded} achats · ${nv}.`,
      lastSync: new Date().toISOString(),
    };
  }

  const etat = [
    inv ? "factures ✓" : "factures ✗",
    buys ? "achats ✓" : "achats ✗",
    rev ? "trésorerie ✓" : "trésorerie ✗",
  ].join(" · ");
  return { ok: false, message: `Synchro incomplète en ${secs} s (${etat}). Réessayez.`, lastSync: null };
}
