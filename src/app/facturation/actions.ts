"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDirigeant } from "@/lib/auth";
import { syncEvoliz, syncEvolizBuys } from "@/lib/evoliz/sync";
import { isEvolizConfigured } from "@/lib/evoliz/client";

export interface RefreshResult {
  ok: boolean;
  message: string;
  lastSync?: string;
}

/**
 * Rafraîchit les deux sources Evoliz : factures + avoirs, puis achats. Réservé DIRIGEANT.
 * Chaque synchro récupère d'abord toutes les données via l'API AVANT d'écrire en base :
 * un échec réseau/API laisse donc le cache concerné intact (pas d'état incohérent).
 * Les deux sont indépendantes ; on rend compte de ce qui a réussi/échoué.
 */
export async function refreshEvoliz(): Promise<RefreshResult> {
  await requireDirigeant();

  if (!isEvolizConfigured()) {
    return { ok: false, message: "Evoliz non configuré (clés API manquantes)." };
  }

  let inv: Awaited<ReturnType<typeof syncEvoliz>> | null = null;
  let buys: Awaited<ReturnType<typeof syncEvolizBuys>> | null = null;

  try {
    inv = await syncEvoliz(prisma);
  } catch (e) {
    console.error("[facturation] syncEvoliz:", e instanceof Error ? e.message : e);
  }
  try {
    buys = await syncEvolizBuys(prisma);
  } catch (e) {
    console.error("[facturation] syncEvolizBuys:", e instanceof Error ? e.message : e);
  }

  revalidatePath("/facturation");

  if (inv && buys) {
    return {
      ok: true,
      message: `À jour : ${inv.invoicesCounted} factures · ${buys.buysIncluded} achats.`,
      lastSync: new Date().toISOString(),
    };
  }

  const etat = [inv ? "factures ✓" : "factures ✗", buys ? "achats ✓" : "achats ✗"].join(" · ");
  return { ok: false, message: `Synchronisation incomplète (${etat}). Réessayez.` };
}
