"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireDirigeant } from "@/lib/auth";
import { syncRevolut } from "@/lib/revolut/sync";
import { isRevolutConfigured } from "@/lib/revolut/client";

export interface RefreshResult {
  ok: boolean;
  message: string;
  lastSync?: string;
}

/** Relance la synchro Revolut (lecture seule). Réservé DIRIGEANT (garde serveur). */
export async function refreshRevolut(): Promise<RefreshResult> {
  await requireDirigeant();
  if (!isRevolutConfigured()) {
    return { ok: false, message: "Revolut non configuré (clés API manquantes)." };
  }
  try {
    const s = await syncRevolut(prisma);
    revalidatePath("/tresorerie");
    return {
      ok: true,
      message: `À jour : ${s.accounts} comptes · ${s.txCount} transactions.`,
      lastSync: new Date().toISOString(),
    };
  } catch (e) {
    console.error("[tresorerie] refreshRevolut:", e instanceof Error ? e.message : e);
    return { ok: false, message: "Échec de la synchronisation Revolut. Réessayez." };
  }
}
