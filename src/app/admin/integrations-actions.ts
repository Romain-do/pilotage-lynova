"use server";

import { revalidatePath } from "next/cache";
import { requireDirigeant } from "@/lib/auth";
import { clearMsGraphConnection } from "@/lib/msgraph/auth";

// Server action de gestion des intégrations (DIRIGEANT seul, §3).
// Joignable en POST direct → re-vérifie l'autorisation côté serveur.

/** Déconnecte le compte Microsoft 365 (supprime le refresh token stocké). */
export async function disconnectMsGraph(): Promise<void> {
  await requireDirigeant();
  await clearMsGraphConnection();
  revalidatePath("/admin");
}
