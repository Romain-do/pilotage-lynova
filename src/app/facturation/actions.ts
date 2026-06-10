"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDirigeant } from "@/lib/auth";
import { syncEvoliz } from "@/lib/evoliz/sync";
import { isEvolizConfigured } from "@/lib/evoliz/client";

export interface RefreshResult {
  ok: boolean;
  message: string;
  lastSync?: string;
}

/** Relance la synchro Evoliz. Réservé DIRIGEANT (garde serveur). */
export async function refreshEvoliz(): Promise<RefreshResult> {
  await requireDirigeant();

  if (!isEvolizConfigured()) {
    return { ok: false, message: "Evoliz non configuré (clés API manquantes)." };
  }
  try {
    const s = await syncEvoliz(prisma);
    revalidatePath("/facturation");
    return {
      ok: true,
      message: `À jour : ${s.invoicesCounted} factures · CA HT net ${new Intl.NumberFormat("fr-FR", {
        style: "currency",
        currency: "EUR",
        maximumFractionDigits: 0,
      }).format(s.caHtNet)}`,
      lastSync: new Date().toISOString(),
    };
  } catch (e) {
    console.error("[facturation] refreshEvoliz:", e instanceof Error ? e.message : e);
    return { ok: false, message: "Échec de la synchronisation Evoliz. Réessayez." };
  }
}
